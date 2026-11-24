import type { Dispatch, SetStateAction } from 'react';
import { apiFetch } from '../lib/api';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  Power,
  ProvinceInfo,
} from '../types/diplomacy';
import { myPowerIn } from '../utils/heroGame';

type ViewMode = 'lobby' | 'sandbox' | 'multiplayer';

/** What `useSpectate` reads from `useGameSession`. */
export interface SpectateSession {
  activeGameId: string;
  setActiveGameId: Dispatch<SetStateAction<string>>;
  setActiveGameSummary: Dispatch<SetStateAction<MultiplayerGameSummary | null>>;
  setLockedPower: Dispatch<SetStateAction<Power | null>>;
  setProvinces: Dispatch<SetStateAction<Record<string, ProvinceInfo>>>;
  boardRequestSeq: { current: number };
  applyServerState: (st: GameState) => void;
  matchPasscodes: Record<string, string>;
  setMatchPasscodes: Dispatch<SetStateAction<Record<string, string>>>;
  isSpectator: boolean;
  spectatorPower: Power | null;
  setWatchedPower: Dispatch<SetStateAction<Power | null>>;
  fetchGamesList: () => Promise<void>;
}

/** What `useSpectate` reads from `useSeatActions`. */
export interface SpectateSeats {
  handleJoinOrEnterMultiplayerGame: (
    gameId: string,
    power: Power,
    passcode?: string,
  ) => Promise<void>;
  handleSelectPower: (power: Power) => void;
}

export interface SpectateOptions {
  session: SpectateSession;
  seats: SpectateSeats;
  setViewMode: Dispatch<SetStateAction<ViewMode>>;
  authUser: AuthUser | null;
  triggerToast: (msg: string) => void;
}

/** What the game screen needs while the player watches: see `SpectatorBar`. */
export interface SpectatorControls {
  /** The private match's passcode, which reading its press needs. */
  passcode: string | null;
  /** Claims a free seat in the match being watched (asks a guest to sign in). */
  onClaimSeat: (power: Power) => void;
  /** Back to the lobby. A spectator holds no seat, so nothing is given up. */
  onLeave: () => void;
}

/** Why a match could not be opened to watch, from the server's answer. */
export function watchRefusal(status: number): string {
  if (status === 403)
    return 'This campaign is private: its passcode is missing or wrong.';
  if (status === 429)
    return 'Too many wrong passcodes. Try again in a few minutes.';
  if (status === 404) return 'No campaign has that Game ID.';
  return `Could not open this campaign (${status}).`;
}

/**
 * Watching a match without a seat: open it from the lobby browser or Join with code, look at
 * any power's units (only on this screen), claim a free seat, or leave. The board comes from
 * `GET /api/game` with no `power`, so every hidden order is masked, and a private match needs
 * its passcode, which is kept for the socket and later reads. A player who already holds a
 * seat in the match is taken into it instead.
 */
export function useSpectate({
  session,
  seats,
  setViewMode,
  authUser,
  triggerToast,
}: SpectateOptions) {
  const { isSpectator, activeGameId, matchPasscodes } = session;

  /**
   * Opens a match to watch, from the lobby (where the private sandbox is already closed).
   * When it cannot be watched the reason is shown and thrown, for a form to show too.
   */
  const watchGame = async (gameId: string, passcode?: string) => {
    try {
      await openToWatch(gameId, passcode);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'Could not watch this campaign.';
      triggerToast(reason);
      throw new Error(reason);
    }
  };

  const openToWatch = async (gameId: string, passcode?: string) => {
    const typed = passcode?.trim() || matchPasscodes[gameId] || '';
    const res = await apiFetch('/game', {
      query: { game_id: gameId },
      passcode: typed,
    });
    if (!res.ok) throw new Error(watchRefusal(res.status));
    const data = await res.json();
    const summary: MultiplayerGameSummary | null = data.summary ?? null;
    if (!summary || summary.is_sandbox) {
      throw new Error('Only multiplayer campaigns can be watched.');
    }
    const seat = myPowerIn(summary, authUser);
    if (seat) {
      await seats.handleJoinOrEnterMultiplayerGame(gameId, seat, typed);
      return;
    }
    session.boardRequestSeq.current++;
    if (typed) {
      session.setMatchPasscodes((prev) => ({ ...prev, [gameId]: typed }));
    }
    session.setActiveGameId(gameId);
    session.setActiveGameSummary(summary);
    session.applyServerState(data.state);
    session.setProvinces(data.provinces);
    session.setLockedPower(null);
    session.setWatchedPower(null);
    setViewMode('multiplayer');
  };

  // A spectator's picker changes only what this screen shows; a player's goes to the server.
  const handleSelectPower = (power: Power) => {
    if (isSpectator) {
      session.setWatchedPower(power);
      return;
    }
    seats.handleSelectPower(power);
  };

  const spectator: SpectatorControls | undefined = isSpectator
    ? {
        passcode: matchPasscodes[activeGameId] ?? null,
        onClaimSeat: (power) => {
          seats
            .handleJoinOrEnterMultiplayerGame(
              activeGameId,
              power,
              matchPasscodes[activeGameId],
            )
            .catch(() => {});
        },
        onLeave: () => {
          setViewMode('lobby');
          session.fetchGamesList();
        },
      }
    : undefined;

  return { watchGame, handleSelectPower, spectator };
}
