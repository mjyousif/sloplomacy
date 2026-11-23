import {
  ALL_POWERS,
  type AuthUser,
  type CampaignStatsResponse,
  type GameParticipant,
  type GameState,
  type MultiplayerGameSummary,
  type Power,
  type PowerStats,
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
  return participants.find((p) => p.user_id === user.id) ?? null;
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

function emptyMatrix(): Record<Power, Record<Power, number>> {
  const matrix = {} as Record<Power, Record<Power, number>>;
  for (const row of ALL_POWERS) {
    const inner = {} as Record<Power, number>;
    for (const col of ALL_POWERS) {
      inner[col] = 0;
    }
    matrix[row] = inner;
  }
  return matrix;
}

/**
 * Build a baseline `CampaignStatsResponse` synchronously from public board state so the War
 * Ledger renders immediately before `/api/history/stats` resolves (or in offline unit tests).
 */
export function buildFallbackCampaignStats(
  gameState: GameState,
  provinces: Record<string, ProvinceInfo>,
  summary: MultiplayerGameSummary | null,
): CampaignStatsResponse {
  const standings = getSupplyCenterCounts(gameState, provinces);
  const scByPower = {} as Record<Power, number>;
  for (const entry of standings) {
    scByPower[entry.power] = entry.count;
  }

  const activeUnitPowers = new Set(
    (gameState.units || []).filter((u) => !u.is_dislodged).map((u) => u.power),
  );
  const surrenderedSet = new Set(gameState.surrendered_powers || []);
  const playerNames = new Map<Power, string>();
  for (const part of Object.values(summary?.participants || {})) {
    if (part?.power && part.display_name) {
      playerNames.set(part.power, part.display_name);
    }
  }

  const powers = {} as Record<Power, PowerStats>;
  for (const power of ALL_POWERS) {
    const currentScs = scByPower[power] ?? 0;
    powers[power] = {
      power,
      player_name: playerNames.get(power) ?? null,
      is_eliminated: currentScs === 0 && !activeUnitPowers.has(power),
      is_surrendered: surrenderedSet.has(power),
      current_scs: currentScs,
      peak_scs: currentScs,
      scs_captured: 0,
      scs_lost: 0,
      units_built: 0,
      armies_built: 0,
      fleets_built: 0,
      units_disbanded: 0,
      units_destroyed: 0,
      enemies_dislodged: 0,
      builds_waived: 0,
      foreign_supports_given: 0,
      foreign_supports_effective: 0,
      foreign_supports_received: 0,
      foreign_convoys: 0,
      convoys_executed: 0,
      supports_cut: 0,
      moves_succeeded: 0,
      moves_bounced: 0,
      move_success_rate: 0,
      self_bounces: 0,
      press_messages_sent: 0,
    };
  }

  return {
    game_id: gameState.game_id,
    turns_resolved: 0,
    powers,
    sc_timeline: [
      {
        label: `${gameState.season} ${gameState.year}`,
        season: gameState.season,
        year: gameState.year,
        counts: scByPower,
      },
    ],
    support_matrix: emptyMatrix(),
    attack_matrix: emptyMatrix(),
    awards: [],
  };
}
