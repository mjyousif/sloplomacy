import { authedFetch } from '../lib/supabase';
import {
  type AdminActionLogEntry,
  ALL_POWERS,
  type AuthUser,
  type MultiplayerGameSummary,
  type Order,
  type Power,
  type ProvinceInfo,
  type ProvinceType,
  type Unit,
  type UnitType,
} from '../types/diplomacy';

/**
 * The power this browser is playing. In multiplayer that is the seat the player claimed:
 * the server's active_power is one field shared by everyone in the game, so it cannot say.
 */
export function resolvePlayerPower(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  lockedPower: Power | null,
  serverActivePower: Power | undefined,
  sandboxMode: boolean = false,
  /** A spectator's power on screen (`watchedPowerFor`), which wins over the shared one. */
  watchedPower: Power | null = null,
): Power {
  if (viewMode === 'multiplayer' && lockedPower && !sandboxMode) {
    return lockedPower;
  }
  if (viewMode === 'multiplayer' && !lockedPower && watchedPower) {
    return watchedPower;
  }
  return serverActivePower ?? lockedPower ?? 'FRANCE';
}

/**
 * Watching a match without a seat. A spectator sees every power's orders masked, never sends
 * a `power` to the server (a token-less `power` would claim a guest seat), and gives no orders.
 */
export function isSpectating(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  lockedPower: Power | null,
  summary: MultiplayerGameSummary | null,
): boolean {
  return viewMode === 'multiplayer' && !lockedPower && !summary?.is_sandbox;
}

/**
 * The power a spectator's order panel shows: the one they picked, else the first power with
 * units on the board. It is only what this browser shows, never sent to the server.
 */
export function watchedPowerFor(
  picked: Power | null,
  units: readonly Unit[] | undefined,
): Power {
  if (picked) return picked;
  return (
    ALL_POWERS.find((p) => units?.some((u) => u.power === p)) ?? ALL_POWERS[0]
  );
}

export function checkIsGameCreator(
  gameSummary: MultiplayerGameSummary | null,
  user: AuthUser | null,
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
): boolean {
  if (viewMode === 'sandbox') {
    return true;
  }
  if (!gameSummary) {
    return true;
  }
  if (gameSummary.is_sandbox) {
    return true;
  }
  if (user) {
    if (gameSummary.creator_id && gameSummary.creator_id === user.id) {
      return true;
    }
    if (
      gameSummary.created_by &&
      gameSummary.created_by.toLowerCase() === user.email.toLowerCase()
    ) {
      return true;
    }
  } else {
    if (
      gameSummary.creator_id === 'guest' ||
      (gameSummary.created_by &&
        gameSummary.created_by.toLowerCase().includes('guest'))
    ) {
      return true;
    }
  }
  return false;
}

export function canPlaceUnitTypeInProvince(
  unitType: UnitType,
  provinceType: ProvinceType,
): boolean {
  if (provinceType === 'IMPASSABLE') {
    return false;
  }
  if (unitType === 'A') {
    return provinceType === 'LAND' || provinceType === 'COAST';
  }
  if (unitType === 'F') {
    return provinceType === 'SEA' || provinceType === 'COAST';
  }
  return false;
}

export function getAvailableCoasts(
  provinceInfo: ProvinceInfo | undefined,
  unitType: UnitType,
): string[] {
  if (!provinceInfo || unitType !== 'F') {
    return [];
  }
  return provinceInfo.coasts || [];
}

export function resolveUnitPlacement(
  unitType: UnitType,
  provInfo: ProvinceInfo | undefined,
  requestedCoast: string | null | undefined,
  showToast: (msg: string) => void,
): { ok: true; coast: string | null } | { ok: false } {
  if (!provInfo) return { ok: false };
  if (!canPlaceUnitTypeInProvince(unitType, provInfo.type)) {
    showToast(
      unitType === 'A'
        ? `Armies cannot be placed in ${provInfo.name} (${provInfo.type}).`
        : `Fleets cannot be placed in ${provInfo.name} (${provInfo.type}).`,
    );
    return { ok: false };
  }
  const availableCoasts = getAvailableCoasts(provInfo, unitType);
  const coast =
    availableCoasts.length > 0
      ? requestedCoast && availableCoasts.includes(requestedCoast)
        ? requestedCoast
        : availableCoasts[0]
      : null;
  return { ok: true, coast };
}

export function buildDefaultHoldOrder(
  unitId: string,
  power: Power,
  unitType: UnitType,
  origin: string,
  originCoast: string | null,
): Order {
  return {
    unit_id: unitId,
    power,
    unit_type: unitType,
    origin,
    origin_coast: originCoast,
    order_type: 'HOLD',
    via_convoy: false,
    is_explicit: false,
  };
}

export function mintStagedUnitId(
  power: Power,
  unitType: UnitType,
  provId: string,
  coast: string | null,
  existingUnits: Unit[],
): string {
  const baseId = `${power.slice(0, 3)}_${unitType}_${provId}${coast ? `_${coast}` : ''}`;
  const usedIds = new Set(existingUnits.map((u) => u.id));
  let newId = baseId;
  let counter = 1;
  while (usedIds.has(newId)) {
    newId = `${baseId}_${counter}`;
    counter += 1;
  }
  return newId;
}

export function getUnacknowledgedAdminEntries(
  adminLog: AdminActionLogEntry[] | undefined,
  authUser: AuthUser | null,
  lockedPower: Power | null,
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
): AdminActionLogEntry[] {
  if (viewMode === 'lobby' || !adminLog || adminLog.length === 0) {
    return [];
  }
  const viewerTokens = [
    authUser?.id,
    authUser?.email,
    lockedPower,
    !authUser && !lockedPower ? 'guest' : null,
  ].filter((t): t is string => Boolean(t));

  return adminLog.filter(
    (entry) =>
      !entry.acknowledged_by?.some((ack) => viewerTokens.includes(ack)),
  );
}

export interface AdminAcknowledgeResponse {
  ok: boolean;
  acknowledged_by: string;
}

export async function acknowledgeAdminEntriesRequest(
  activeGameId: string,
  entryIds: string[],
  authUser: AuthUser | null,
  lockedPower: Power | null,
): Promise<AdminAcknowledgeResponse | null> {
  const res = await authedFetch(
    `/api/admin/acknowledge?game_id=${encodeURIComponent(activeGameId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entry_ids: entryIds,
        // Who is acknowledging comes from the token. A guest names its seat; the server
        // believes it only for a seat claimed without an account.
        power: authUser ? undefined : lockedPower,
      }),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

export async function postAdminBoardEditRequest(
  activeGameId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  return authedFetch(
    `/api/admin/board-edit?game_id=${encodeURIComponent(activeGameId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export {
  applyUndoStagedChange,
  computeStagedChanges,
  computeStagedDiffLines,
  type StagedChangeEntry,
  type StagedChangeKind,
} from './adminStagedChanges';
