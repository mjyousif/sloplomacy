import { authedFetch } from '../lib/supabase';
import type {
  AdminActionLogEntry,
  AuthUser,
  MultiplayerGameSummary,
  Order,
  Power,
  ProvinceInfo,
  ProvinceType,
  Unit,
  UnitType,
} from '../types/diplomacy';

/**
 * The power this browser is playing. In multiplayer that is the seat the player claimed:
 * the server's active_power is one field shared by everyone in the game, so it cannot say.
 */
export function resolvePlayerPower(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  lockedPower: Power | null,
  serverActivePower: Power | undefined,
): Power {
  if (viewMode === 'multiplayer' && lockedPower) {
    return lockedPower;
  }
  return serverActivePower ?? 'FRANCE';
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

export function filterUnitsForDisband(
  units: Unit[],
  powerFilter: string,
): Unit[] {
  if (!powerFilter || powerFilter === 'ALL') {
    return units;
  }
  return units.filter((u) => u.power === powerFilter);
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
        user_id: authUser?.id || (!lockedPower ? 'guest' : undefined),
        email: authUser?.email,
        power: lockedPower,
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
