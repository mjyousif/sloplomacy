import {
  type GameState,
  type Order,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type Unit,
  type UnitType,
} from '../types/diplomacy';
import {
  buildDefaultHoldOrder,
  mintStagedUnitId,
  resolveUnitPlacement,
} from './adminHelpers';

export type StagedChangeKind =
  | 'destroy'
  | 'spawn'
  | 'update'
  | 'relocate'
  | 'ownership'
  | 'order';

export interface StagedChangeEntry {
  id: string;
  kind: StagedChangeKind;
  label: string;
  unitId?: string;
  province?: string;
}

const formatPowerName = (power: Power): string =>
  POWER_METADATA[power]?.shortName ?? power;

const formatProvinceName = (
  provinceId: string,
  provinces?: Record<string, ProvinceInfo>,
): string => provinces?.[provinceId]?.name ?? provinceId;

const formatUnitTypeName = (unitType: UnitType): string =>
  unitType === 'A' ? 'Army' : 'Fleet';

export function computeStagedChanges(
  baseState: Pick<GameState, 'units' | 'ownership' | 'orders'> | null,
  stagedUnits: Unit[],
  stagedOwnership: Record<string, Power>,
  stagedOrders: Record<string, Order>,
  provinces?: Record<string, ProvinceInfo>,
): StagedChangeEntry[] {
  if (!baseState) return [];
  const entries: StagedChangeEntry[] = [];
  const baseById = new Map(baseState.units.map((u) => [u.id, u]));
  const stagedById = new Map(stagedUnits.map((u) => [u.id, u]));

  for (const bu of baseState.units) {
    if (!stagedById.has(bu.id)) {
      entries.push({
        id: `destroy:${bu.id}`,
        kind: 'destroy',
        label: `Destroyed ${formatPowerName(bu.power)} ${formatUnitTypeName(bu.unit_type)} in ${formatProvinceName(bu.province, provinces)}`,
        unitId: bu.id,
        province: bu.province,
      });
    }
  }

  for (const u of stagedUnits) {
    const bu = baseById.get(u.id);
    if (!bu) {
      entries.push({
        id: `spawn:${u.id}`,
        kind: 'spawn',
        label: `Spawned ${formatPowerName(u.power)} ${formatUnitTypeName(u.unit_type)} at ${formatProvinceName(u.province, provinces)}${u.coast ? ` (${u.coast})` : ''}`,
        unitId: u.id,
        province: u.province,
      });
    } else if (bu.power !== u.power || bu.unit_type !== u.unit_type) {
      entries.push({
        id: `update:${u.id}`,
        kind: 'update',
        label: `Changed ${formatPowerName(bu.power)} ${formatUnitTypeName(bu.unit_type)} in ${formatProvinceName(bu.province, provinces)} to ${formatPowerName(u.power)} ${formatUnitTypeName(u.unit_type)} in ${formatProvinceName(u.province, provinces)}`,
        unitId: u.id,
        province: u.province,
      });
    } else if (
      bu.province !== u.province ||
      (bu.coast ?? null) !== (u.coast ?? null)
    ) {
      entries.push({
        id: `relocate:${u.id}`,
        kind: 'relocate',
        label: `Relocated ${formatPowerName(u.power)} ${formatUnitTypeName(u.unit_type)} from ${formatProvinceName(bu.province, provinces)} to ${formatProvinceName(u.province, provinces)}${u.coast ? ` (${u.coast})` : ''}`,
        unitId: u.id,
        province: u.province,
      });
    }
  }

  const allScs = Array.from(
    new Set([
      ...Object.keys(baseState.ownership),
      ...Object.keys(stagedOwnership),
    ]),
  ).sort();

  for (const prov of allScs) {
    const prevOwner = baseState.ownership[prov] ?? null;
    const nextOwner = stagedOwnership[prov] ?? null;
    if (prevOwner !== nextOwner) {
      const provName = formatProvinceName(prov, provinces);
      entries.push({
        id: `ownership:${prov}`,
        kind: 'ownership',
        label: nextOwner
          ? `Set ownership of ${provName} to ${formatPowerName(nextOwner)}`
          : `Reset ownership of ${provName} to Neutral`,
        province: prov,
      });
    }
  }

  for (const [uid, order] of Object.entries(stagedOrders)) {
    const bu = baseById.get(uid);
    const u = stagedById.get(uid);
    if (
      bu &&
      u &&
      bu.province === u.province &&
      (bu.coast ?? null) === (u.coast ?? null) &&
      bu.power === u.power &&
      bu.unit_type === u.unit_type
    ) {
      const prevOrder = baseState.orders[uid];
      if (
        prevOrder &&
        (prevOrder.order_type !== order.order_type ||
          (prevOrder.target ?? null) !== (order.target ?? null) ||
          (prevOrder.target_coast ?? null) !== (order.target_coast ?? null) ||
          (prevOrder.aux_unit_origin ?? null) !==
            (order.aux_unit_origin ?? null))
      ) {
        entries.push({
          id: `order:${uid}`,
          kind: 'order',
          label: `Updated order for ${formatPowerName(u.power)} ${formatUnitTypeName(u.unit_type)} in ${formatProvinceName(u.province, provinces)}`,
          unitId: uid,
          province: u.province,
        });
      }
    }
  }

  return entries;
}

export function computeStagedDiffLines(
  baseState: Pick<GameState, 'units' | 'ownership' | 'orders'> | null,
  stagedUnits: Unit[],
  stagedOwnership: Record<string, Power>,
  stagedOrders: Record<string, Order>,
  provinces?: Record<string, ProvinceInfo>,
): string[] {
  return computeStagedChanges(
    baseState,
    stagedUnits,
    stagedOwnership,
    stagedOrders,
    provinces,
  ).map((c) => c.label);
}

/** Relocates a staged unit onto `targetProvId`, displacing any existing occupant. */
export function applyStageRelocate(
  stagedUnits: Unit[],
  stagedOrders: Record<string, Order>,
  provinces: Record<string, ProvinceInfo>,
  unitId: string,
  targetProvId: string,
  targetCoast: string | null | undefined,
  showToast: (msg: string) => void,
):
  | { ok: true; provId: string; units: Unit[]; orders: Record<string, Order> }
  | { ok: false } {
  const provId = targetProvId.toUpperCase();
  const unit = stagedUnits.find((u) => u.id === unitId);
  if (!unit) return { ok: false };

  const placement = resolveUnitPlacement(
    unit.unit_type,
    provinces[provId],
    targetCoast,
    showToast,
  );
  if (!placement.ok) return { ok: false };
  const resolvedCoast = placement.coast;

  const displacedIds = stagedUnits
    .filter((u) => u.id !== unitId && !u.is_dislodged && u.province === provId)
    .map((u) => u.id);

  const units = stagedUnits
    .filter((u) => !displacedIds.includes(u.id))
    .map((u) =>
      u.id === unitId ? { ...u, province: provId, coast: resolvedCoast } : u,
    );

  const orders = { ...stagedOrders };
  for (const id of displacedIds) {
    delete orders[id];
  }
  orders[unitId] = buildDefaultHoldOrder(
    unitId,
    unit.power,
    unit.unit_type,
    provId,
    resolvedCoast,
  );

  return { ok: true, provId, units, orders };
}

/** Spawns a new unit or updates power/type/coast of the staged unit on `province`. */
export function applyStageSpawnOrUpdate(
  stagedUnits: Unit[],
  stagedOrders: Record<string, Order>,
  provinces: Record<string, ProvinceInfo>,
  province: string,
  power: Power,
  unitType: UnitType,
  coast: string | null | undefined,
  showToast: (msg: string) => void,
): { ok: true; units: Unit[]; orders: Record<string, Order> } | { ok: false } {
  const provId = province.toUpperCase();
  const placement = resolveUnitPlacement(
    unitType,
    provinces[provId],
    coast,
    showToast,
  );
  if (!placement.ok) return { ok: false };
  const resolvedCoast = placement.coast;

  const existing = stagedUnits.find(
    (u) => !u.is_dislodged && u.province === provId,
  );

  if (existing && existing.power === power && existing.unit_type === unitType) {
    return {
      ok: true,
      units: stagedUnits.map((u) =>
        u.id === existing.id ? { ...u, coast: resolvedCoast } : u,
      ),
      orders: {
        ...stagedOrders,
        [existing.id]: {
          ...(stagedOrders[existing.id] ??
            buildDefaultHoldOrder(
              existing.id,
              power,
              unitType,
              provId,
              resolvedCoast,
            )),
          origin_coast: resolvedCoast,
        },
      },
    };
  }

  const newId = mintStagedUnitId(
    power,
    unitType,
    provId,
    resolvedCoast,
    stagedUnits,
  );
  const newUnit: Unit = {
    id: newId,
    power,
    unit_type: unitType,
    province: provId,
    coast: resolvedCoast,
  };

  const orders = { ...stagedOrders };
  if (existing) delete orders[existing.id];
  orders[newId] = buildDefaultHoldOrder(
    newId,
    power,
    unitType,
    provId,
    resolvedCoast,
  );

  return {
    ok: true,
    units: [
      ...stagedUnits.filter((u) => u.is_dislodged || u.province !== provId),
      newUnit,
    ],
    orders,
  };
}

/** Reverts a single staged edit identified by `changeId` back toward `baseState`. */
export function applyUndoStagedChange(
  baseState: Pick<GameState, 'units' | 'ownership' | 'orders'> | null,
  stagedUnits: Unit[],
  stagedOwnership: Record<string, Power>,
  stagedOrders: Record<string, Order>,
  changeId: string,
): {
  units: Unit[];
  ownership: Record<string, Power>;
  orders: Record<string, Order>;
} {
  const next = {
    units: stagedUnits,
    ownership: stagedOwnership,
    orders: stagedOrders,
  };
  if (!baseState) return next;

  const sepIdx = changeId.indexOf(':');
  if (sepIdx <= 0) return next;
  const kind = changeId.slice(0, sepIdx) as StagedChangeKind;
  const targetId = changeId.slice(sepIdx + 1);
  const baseById = new Map(baseState.units.map((u) => [u.id, u]));

  const clearSpawnedOccupantAt = (
    units: Unit[],
    orders: Record<string, Order>,
    province: string,
    ignoreId?: string,
  ): Unit[] =>
    units.filter((u) => {
      const collides =
        u.id !== ignoreId &&
        !u.is_dislodged &&
        u.province === province &&
        !baseById.has(u.id);
      if (collides) delete orders[u.id];
      return !collides;
    });

  if (kind === 'destroy') {
    const bu = baseById.get(targetId);
    if (!bu || stagedUnits.some((u) => u.id === bu.id)) return next;
    const nextOrders = { ...stagedOrders };
    const cleaned = bu.is_dislodged
      ? [...stagedUnits]
      : clearSpawnedOccupantAt(stagedUnits, nextOrders, bu.province);
    cleaned.push({ ...bu });
    nextOrders[bu.id] = baseState.orders[bu.id]
      ? { ...baseState.orders[bu.id] }
      : buildDefaultHoldOrder(
          bu.id,
          bu.power,
          bu.unit_type,
          bu.province,
          bu.coast ?? null,
        );
    return { units: cleaned, ownership: stagedOwnership, orders: nextOrders };
  }

  if (kind === 'spawn') {
    if (!stagedUnits.some((u) => u.id === targetId)) return next;
    const nextOrders = { ...stagedOrders };
    delete nextOrders[targetId];
    return {
      units: stagedUnits.filter((u) => u.id !== targetId),
      ownership: stagedOwnership,
      orders: nextOrders,
    };
  }

  if (kind === 'update' || kind === 'relocate') {
    const bu = baseById.get(targetId);
    if (!bu) return next;
    const nextOrders = { ...stagedOrders };
    const cleaned =
      kind === 'relocate' && !bu.is_dislodged
        ? clearSpawnedOccupantAt(stagedUnits, nextOrders, bu.province, bu.id)
        : [...stagedUnits];
    const updatedUnits = cleaned.map((u) =>
      u.id === bu.id
        ? {
            ...u,
            power: bu.power,
            unit_type: bu.unit_type,
            province: bu.province,
            coast: bu.coast ?? null,
          }
        : u,
    );
    nextOrders[bu.id] = baseState.orders[bu.id]
      ? { ...baseState.orders[bu.id] }
      : buildDefaultHoldOrder(
          bu.id,
          bu.power,
          bu.unit_type,
          bu.province,
          bu.coast ?? null,
        );
    return {
      units: updatedUnits,
      ownership: stagedOwnership,
      orders: nextOrders,
    };
  }

  if (kind === 'ownership') {
    const nextOwnership = { ...stagedOwnership };
    if (baseState.ownership[targetId]) {
      nextOwnership[targetId] = baseState.ownership[targetId];
    } else {
      delete nextOwnership[targetId];
    }
    return {
      units: stagedUnits,
      ownership: nextOwnership,
      orders: stagedOrders,
    };
  }

  if (kind === 'order') {
    const nextOrders = { ...stagedOrders };
    if (baseState.orders[targetId]) {
      nextOrders[targetId] = { ...baseState.orders[targetId] };
    } else {
      delete nextOrders[targetId];
    }
    return {
      units: stagedUnits,
      ownership: stagedOwnership,
      orders: nextOrders,
    };
  }

  return next;
}
