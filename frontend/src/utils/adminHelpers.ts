import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import { API_BASE } from '../lib/api';
import { authedFetch } from '../lib/supabase';
import {
  type AdminActionLogEntry,
  ALL_POWERS,
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  type Order,
  type Power,
  type ProvinceInfo,
  type ProvinceType,
  type Unit,
  type UnitType,
} from '../types/diplomacy';
import {
  isUnitUnchangedFromBase,
  mergeLiveUnitOrders,
  ordersHaveSameParameters,
} from './adminStagedChanges';

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
    return Boolean(
      gameSummary.creator_id && gameSummary.creator_id === user.id,
    );
  }
  return gameSummary.creator_id === 'guest';
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
    `${API_BASE}/admin/acknowledge?game_id=${encodeURIComponent(activeGameId)}`,
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
    `${API_BASE}/admin/board-edit?game_id=${encodeURIComponent(activeGameId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export type AdminBoardSnapshot = Pick<
  GameState,
  'units' | 'ownership' | 'orders'
>;

export function snapshotAdminBoardState(state: GameState): AdminBoardSnapshot {
  return {
    units: state.units.map((u) => ({ ...u })),
    ownership: { ...state.ownership },
    orders: Object.fromEntries(
      Object.entries(state.orders).map(([k, v]) => [k, { ...v }]),
    ),
  };
}

export function resolveAdminOrderStage(
  baseSnapshot: AdminBoardSnapshot | null,
  stagedUnits: Unit[],
  order: Order,
): { nextOrder: Order; isExplicitOverride: boolean } {
  const baseUnit = baseSnapshot?.units.find((u) => u.id === order.unit_id);
  const stagedUnit = stagedUnits.find((u) => u.id === order.unit_id);
  const baseOrder = baseSnapshot?.orders[order.unit_id];
  if (
    baseOrder &&
    isUnitUnchangedFromBase(baseUnit, stagedUnit) &&
    ordersHaveSameParameters(baseOrder, order)
  ) {
    return { nextOrder: { ...baseOrder }, isExplicitOverride: false };
  }
  return {
    nextOrder: { ...order, is_explicit: true },
    isExplicitOverride: true,
  };
}

export function buildAdminBoardEditPayload(
  baseRevision: number,
  baseTurn: { season: string; year: number; phase: string },
  units: Unit[],
  ownership: Record<string, Power>,
  stagedOrders: Record<string, Order>,
  stagedOrderIds: ReadonlySet<string>,
  diffLines: string[],
): Record<string, unknown> {
  return {
    expected_revision: baseRevision,
    expected_season: baseTurn.season,
    expected_year: baseTurn.year,
    expected_phase: baseTurn.phase,
    units,
    ownership,
    orders: Object.fromEntries(
      Object.entries(stagedOrders).filter(([uid]) => stagedOrderIds.has(uid)),
    ),
    summary_lines: diffLines.map((line) => `[ADMIN OVERRIDE] ${line}.`),
  };
}

export function mergeBaseSnapshotOrders(
  prev: AdminBoardSnapshot | null,
  gameState: GameState,
  overriddenIds: ReadonlySet<string>,
): AdminBoardSnapshot | null {
  if (!prev) return prev;
  const orders = mergeLiveUnitOrders(
    gameState,
    prev.units,
    prev.orders,
    overriddenIds,
  );
  return orders === prev.orders ? prev : { ...prev, orders };
}

export function hasLiveBoardDiverged(
  gameState: GameState,
  baseRevision: number,
  baseTurn: { season: string; year: number; phase: string },
): boolean {
  const liveRev = gameState.board_revision ?? gameState.state_revision ?? 1;
  if (liveRev > baseRevision) return true;
  if (liveRev < baseRevision) return false;
  return (
    gameState.season !== baseTurn.season ||
    gameState.year !== baseTurn.year ||
    gameState.phase !== baseTurn.phase
  );
}

export function buildBoardConflictConfirmOptions(detail?: string) {
  return {
    title: 'Board State Changed (409 Conflict)',
    message:
      detail ||
      'Board state changed while editing. Please review the latest board state before applying changes.',
    confirmLabel: 'Discard Draft & Reload',
  };
}

export function buildDiscardEditsConfirmOptions(
  count: number,
  actionDescription: string,
) {
  return {
    title: 'Unapplied Edit Board Changes',
    message: `You have ${count} unapplied board edit${count === 1 ? '' : 's'}. Discard your uncommitted changes and ${actionDescription}?`,
    confirmLabel: 'Discard Changes',
  };
}

export function buildClearEditsConfirmOptions(count: number) {
  return {
    title: 'Clear Staged Board Edits?',
    message: `This discards all ${count} unapplied board edit${count === 1 ? '' : 's'} and restores the live board. This cannot be undone.`,
    confirmLabel: 'Clear Changes',
  };
}

export function applyStageDestroy(
  stagedUnits: Unit[],
  stagedOrders: Record<string, Order>,
  unitId: string,
): { units: Unit[]; orders: Record<string, Order> } {
  const orders = { ...stagedOrders };
  delete orders[unitId];
  return {
    units: stagedUnits.filter((u) => u.id !== unitId),
    orders,
  };
}

export function getRevertedOrderUnitId(changeId: string): string | null {
  const sepIdx = changeId.indexOf(':');
  if (sepIdx <= 0 || changeId.slice(0, sepIdx) === 'ownership') return null;
  return changeId.slice(sepIdx + 1);
}

export interface UseAdminDirectEditParams {
  activeGameId: string;
  viewMode?: 'lobby' | 'sandbox' | 'multiplayer';
  lockedPower?: Power | null;
  gameState: GameState | null;
  provinces: Record<string, ProvinceInfo>;
  directEditActive: boolean;
  setDirectEditActive: React.Dispatch<React.SetStateAction<boolean>>;
  authUser: AuthUser | null;
  onUpdateGameState: (newState: GameState) => void;
  showToast: (msg: string) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

export function findDisplacedAndRelocatedIds(
  stagedUnits: Unit[],
  nextUnits: Unit[],
  unitId: string,
): string[] {
  return [
    unitId,
    ...stagedUnits
      .filter((u) => !nextUnits.some((nu) => nu.id === u.id))
      .map((u) => u.id),
  ];
}

export function applyOwnershipChange(
  prev: Record<string, Power>,
  province: string,
  power: Power | null,
): Record<string, Power> {
  const provId = province.toUpperCase();
  const next = { ...prev };
  if (power === null) {
    delete next[provId];
  } else {
    next[provId] = power;
  }
  return next;
}

export type AdminBoardEditCommitResult =
  | { kind: 'ok'; state: GameState }
  | { kind: 'conflict'; detail?: string }
  | { kind: 'error'; message: string };

export async function commitAdminBoardEdit(
  activeGameId: string,
  payload: Record<string, unknown>,
): Promise<AdminBoardEditCommitResult> {
  try {
    const res = await postAdminBoardEditRequest(activeGameId, payload);
    if (res.status === 409) {
      const errData = await res.json().catch(() => ({}));
      return { kind: 'conflict', detail: errData.detail };
    }
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        kind: 'error',
        message: errData.detail || 'Failed to apply admin board edits.',
      };
    }
    return { kind: 'ok', state: (await res.json()) as GameState };
  } catch {
    return {
      kind: 'error',
      message: 'Network error applying admin board edits.',
    };
  }
}

export {
  applyUndoStagedChange,
  computeStagedChanges,
  computeStagedDiffLines,
  type StagedChangeEntry,
  type StagedChangeKind,
} from './adminStagedChanges';
