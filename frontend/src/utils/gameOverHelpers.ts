import {
  ALL_POWERS,
  type AuthUser,
  type GameParticipant,
  type GameState,
  type MultiplayerGameSummary,
  type Power,
  type ProvinceInfo,
} from '../types/diplomacy';

export const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export type CompletedCampaignPhase =
  | 'active'
  | 'unwitnessed'
  | 'grace'
  | 'archived';

export interface CompletedCampaignStatus {
  phase: CompletedCampaignPhase;
  hoursRemaining: number;
}

/** Find the signed-in user's participant entry in a game summary, if any. */
export function getMyParticipant(
  summary: MultiplayerGameSummary | null | undefined,
  user: AuthUser | null | undefined,
): GameParticipant | null {
  if (!summary || !user) return null;
  const participants = Object.values(summary.participants || {});
  return (
    participants.find(
      (p) =>
        p.user_id === user.id ||
        (user.email && p.email?.toLowerCase() === user.email.toLowerCase()),
    ) ?? null
  );
}

/**
 * Determine where a campaign sits in the post-completion lifecycle for `user`:
 * - `active`: game has not concluded
 * - `unwitnessed`: game concluded, user has not yet witnessed GameOverModal
 * - `grace`: user witnessed it < 24h ago (still visible in My Active Campaigns)
 * - `archived`: >= 24h since user witnessed it (leaves My Active Campaigns)
 */
export function getCompletedCampaignStatus(
  summary: MultiplayerGameSummary,
  user: AuthUser | null | undefined,
  nowMs: number = Date.now(),
): CompletedCampaignStatus {
  const isCompleted = summary.status === 'completed' || Boolean(summary.winner);
  if (!isCompleted) {
    return { phase: 'active', hoursRemaining: 0 };
  }

  const participant = getMyParticipant(summary, user);
  const seenAt = participant?.game_over_seen_at;
  if (!seenAt) {
    return { phase: 'unwitnessed', hoursRemaining: 24 };
  }

  const seenMs = Date.parse(seenAt);
  if (Number.isNaN(seenMs)) {
    return { phase: 'unwitnessed', hoursRemaining: 24 };
  }

  const elapsed = Math.max(0, nowMs - seenMs);
  if (elapsed < GRACE_PERIOD_MS) {
    const hoursRemaining = Math.max(
      1,
      Math.ceil((GRACE_PERIOD_MS - elapsed) / (60 * 60 * 1000)),
    );
    return { phase: 'grace', hoursRemaining };
  }

  return { phase: 'archived', hoursRemaining: 0 };
}

/** True while a campaign should remain in "My Active Campaigns & Saved Games". */
export function isVisibleInMyActiveCampaigns(
  summary: MultiplayerGameSummary,
  user: AuthUser | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  return getCompletedCampaignStatus(summary, user, nowMs).phase !== 'archived';
}

export interface PowerSupplyStanding {
  power: Power;
  count: number;
}

/** Count owned supply centers per power, sorted descending by count. */
export function getSupplyCenterCounts(
  gameState: GameState,
  provinces: Record<string, ProvinceInfo>,
): PowerSupplyStanding[] {
  const counts: Record<Power, number> = {
    FRANCE: 0,
    ENGLAND: 0,
    GERMANY: 0,
    ITALY: 0,
    AUSTRIA: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };

  for (const [provId, owner] of Object.entries(gameState.ownership || {})) {
    const prov = provinces[provId];
    if (prov ? prov.is_supply_center : true) {
      if (owner in counts) {
        counts[owner] += 1;
      }
    }
  }

  return ALL_POWERS.map((power) => ({ power, count: counts[power] })).sort(
    (a, b) => b.count - a.count,
  );
}
