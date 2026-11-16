import { EUROPE_PROVINCE_GEOMETRY } from '../data/europeMapGeometry';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import { getCompletedCampaignStatus } from './gameOverHelpers';

/**
 * What one of a player's own games wants from them, most pressing first: orders to give,
 * nothing until the others finalize, a finished campaign to look back at, a saved sandbox.
 */
export type GameUrgency = 'your-move' | 'waiting' | 'finished' | 'sandbox';

const URGENCY_RANK: Record<GameUrgency, number> = {
  'your-move': 0,
  waiting: 1,
  finished: 2,
  sandbox: 3,
};

/** The power the user holds in a game, or null when they hold no seat. */
export function myPowerIn(
  game: MultiplayerGameSummary,
  user: AuthUser | null,
): Power | null {
  if (!user) return null;
  const seat = Object.values(game.participants || {}).find(
    (p) => p.user_id === user.id,
  );
  return seat?.power ?? null;
}

export function gameUrgency(
  game: MultiplayerGameSummary,
  user: AuthUser | null,
): GameUrgency {
  if (game.is_sandbox) return 'sandbox';
  if (game.status === 'completed' || game.winner) return 'finished';
  const power = myPowerIn(game, user);
  if (!power) return 'waiting';
  // A surrendered power is in civil disorder: there is nothing left for its player to order.
  if (game.surrendered_powers?.includes(power)) return 'waiting';
  return game.finalized_powers?.includes(power) ? 'waiting' : 'your-move';
}

const stamp = (iso: string | null | undefined): number => {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

const lastPlayed = (game: MultiplayerGameSummary): number =>
  stamp(game.last_moved_at) || stamp(game.created_at);

/**
 * A player's games in the order the homepage shows them: the ones waiting on their orders
 * first (soonest deadline first, untimed ones after), then the rest. Ties go to a game that
 * has resolved a turn over one that has not started, then to the most recently played.
 */
export function sortMyGames(
  games: MultiplayerGameSummary[],
  user: AuthUser | null,
): MultiplayerGameSummary[] {
  return [...games].sort((a, b) => {
    const urgencyA = gameUrgency(a, user);
    const urgencyB = gameUrgency(b, user);
    if (urgencyA !== urgencyB) {
      return URGENCY_RANK[urgencyA] - URGENCY_RANK[urgencyB];
    }
    if (urgencyA === 'your-move') {
      const dueA = a.deadline ?? Number.POSITIVE_INFINITY;
      const dueB = b.deadline ?? Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
    }
    const startedA = a.last_moved_at ? 0 : 1;
    const startedB = b.last_moved_at ? 0 : 1;
    if (startedA !== startedB) return startedA - startedB;
    return lastPlayed(b) - lastPlayed(a);
  });
}

/** The game the hero features: the most pressing one that is not a saved sandbox. */
export function pickHeroGame(
  games: MultiplayerGameSummary[],
  user: AuthUser | null,
): MultiplayerGameSummary | null {
  return sortMyGames(games, user).find((g) => !g.is_sandbox) ?? null;
}

/**
 * How many supply centers a power holds on a board preview. `ownership` also records who last
 * stood in the other land provinces, which only colour the map, so those are skipped.
 */
export function supplyCenterCount(
  ownership: Record<string, Power> | undefined,
  power: Power,
): number {
  return Object.entries(ownership ?? {}).filter(
    ([prov, owner]) =>
      owner === power && EUROPE_PROVINCE_GEOMETRY[prov]?.scPos !== undefined,
  ).length;
}

/** "Due in 14h", "Due in 25 min", "Due now": how long a running phase clock has left. */
export function deadlineLabel(
  deadline: number | null | undefined,
  nowMs: number,
): string | null {
  if (deadline === null || deadline === undefined) return null;
  const seconds = deadline - nowMs / 1000;
  if (seconds <= 0) return 'Due now';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Due in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Due in ${hours}h`;
  return `Due in ${Math.floor(hours / 24)} days`;
}

/** How many of the seated, unsurrendered powers have finalized: "2 of 5 finalized". */
export function finalizedLabel(game: MultiplayerGameSummary): string {
  const surrendered = new Set(game.surrendered_powers ?? []);
  const playing = Object.values(game.participants || {}).filter(
    (p) => !surrendered.has(p.power),
  );
  const done = playing.filter((p) =>
    game.finalized_powers?.includes(p.power),
  ).length;
  return `${done} of ${playing.length} finalized`;
}

/** The words the homepage puts on one of a player's own games. */
export interface MyGameCopy {
  urgency: GameUrgency;
  /** The player's seat. A saved sandbox with no seat falls back to France, as the list did. */
  power: Power;
  /** The short status on the pill: "Your move", "Waiting on others", "Finished", ... */
  status: string;
  /** The turn the game is on: "Fall 1902 · Movement". */
  turn: string;
  /** The main button: "Resume as France", "Review board" or "Open sandbox". */
  enterLabel: string;
  /** The entry in the ⋯ menu: "Surrender & Leave", "Leave" or "Delete". */
  leaveLabel: string;
}

export function describeMyGame(
  game: MultiplayerGameSummary,
  user: AuthUser | null,
  nowMs: number = Date.now(),
): MyGameCopy {
  const urgency = gameUrgency(game, user);
  const power = myPowerIn(game, user) ?? 'FRANCE';
  const name = POWER_METADATA[power].shortName;

  let status = 'Waiting on others';
  if (urgency === 'your-move') status = 'Your move';
  if (urgency === 'sandbox') status = 'Saved sandbox';
  if (urgency === 'finished') {
    const completion = user
      ? getCompletedCampaignStatus(game, user, nowMs)
      : null;
    status =
      completion?.phase === 'grace'
        ? `Finished · archives in ${completion.hoursRemaining}h`
        : 'Finished · see the result';
  }

  return {
    urgency,
    power,
    status,
    turn: `${game.season} ${game.year} · ${game.phase}`,
    enterLabel:
      urgency === 'finished'
        ? 'Review board'
        : urgency === 'sandbox'
          ? 'Open sandbox'
          : `Resume as ${name}`,
    leaveLabel: game.is_sandbox
      ? 'Delete'
      : game.status === 'active'
        ? 'Surrender & Leave'
        : 'Leave',
  };
}
