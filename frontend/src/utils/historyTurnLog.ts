import {
  ALL_POWERS,
  type Order,
  type OrderResolution,
  type Power,
  type ProvinceInfo,
  type TurnRecord,
  type Unit,
  type UnitType,
} from '../types/diplomacy';
import {
  type HistoryActionType,
  matchesHistoryActions,
  matchesHistoryPowers,
} from './historyHelpers';
import {
  collectOwnershipChanges,
  type HistoryOwnershipChange,
} from './historyOwnershipChanges';
import { formatOrderSummary, splitProvinceCode } from './orderHelpers';

export type { HistoryOwnershipChange };

export type HistoryOutcomeTone =
  | 'success'
  | 'danger'
  | 'warning'
  | 'neutral'
  | 'admin';

export interface HistoryOrderEntry {
  id: string;
  power: Power;
  unitType: UnitType | null;
  locationLabel: string;
  verb: string;
  detail: string;
  outcomeLabel: string;
  outcomeTone: HistoryOutcomeTone;
  reason?: string;
  /** Map unit or build id to highlight when hovering/clicking this row. */
  highlightUnitId: string | null;
  /** Map provinces (origin, target, aux origin) to highlight when hovering/clicking this row. */
  highlightProvinces: string[];
}

export interface HistoryPowerGroup {
  power: Power;
  entries: HistoryOrderEntry[];
}

export type HistoryPhaseKind =
  | 'Movement'
  | 'Retreats'
  | 'Adjustments'
  | 'Admin';

export interface HistoryTurnLog {
  phaseKind: HistoryPhaseKind;
  groups: HistoryPowerGroup[];
  ownershipChanges: HistoryOwnershipChange[];
  adminNotes: string[];
  totalCount: number;
}

function provName(
  code: string | null | undefined,
  provinces: Record<string, ProvinceInfo>,
): string {
  if (!code) return '';
  return provinces[code]?.name ?? code;
}

function formatLocationLabel(
  province: string,
  coast: string | null | undefined,
  provinces: Record<string, ProvinceInfo>,
): string {
  const coastSuffix = coast ? ` (${coast})` : '';
  return `${provName(province, provinces)}${coastSuffix}`;
}

function collectProvinces(...codes: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  for (const code of codes) {
    if (!code) continue;
    seen.add(splitProvinceCode(code).base);
  }
  return Array.from(seen);
}

function outcomeForMovement(
  orderType: Order['order_type'],
  res: OrderResolution | undefined,
): { label: string; tone: HistoryOutcomeTone; includeReason: boolean } {
  if (!res) return { label: 'Resolved', tone: 'neutral', includeReason: false };
  if (orderType === 'HOLD') {
    return res.dislodged
      ? { label: 'Dislodged', tone: 'danger', includeReason: true }
      : { label: 'Held', tone: 'neutral', includeReason: false };
  }
  if (orderType === 'MOVE') {
    if (res.bounced)
      return { label: 'Bounced', tone: 'danger', includeReason: true };
    if (res.dislodged)
      return { label: 'Dislodged', tone: 'danger', includeReason: true };
    if (!res.succeeded)
      return { label: 'Failed', tone: 'danger', includeReason: true };
    return { label: 'Succeeded', tone: 'success', includeReason: false };
  }
  if (res.cut) return { label: 'Cut', tone: 'warning', includeReason: true };
  if (res.dislodged)
    return { label: 'Dislodged', tone: 'danger', includeReason: true };
  if (!res.succeeded)
    return { label: 'Failed', tone: 'danger', includeReason: true };
  return { label: 'Succeeded', tone: 'success', includeReason: false };
}

function pushGrouped(
  buckets: Map<Power, HistoryOrderEntry[]>,
  entry: HistoryOrderEntry,
) {
  const list = buckets.get(entry.power);
  if (list) list.push(entry);
  else buckets.set(entry.power, [entry]);
}

function addAdminTurnEntries(
  turn: TurnRecord,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  buckets: Map<Power, HistoryOrderEntry[]>,
  ownershipChangeCount: number,
): string[] {
  for (const order of Object.values(turn.orders)) {
    if (!matchesHistoryPowers(order.power, selectedPowers)) continue;
    if (order.order_type === 'HOLD' && !order.is_explicit) continue;
    const coast = order.origin_coast || order.target_coast;
    const unitWord = order.unit_type === 'A' ? 'Army' : 'Fleet';
    const locationLabel = formatLocationLabel(order.origin, coast, provinces);
    if (order.order_type === 'BUILD') {
      pushGrouped(buckets, {
        id: `adm_${order.unit_id}`,
        power: order.power,
        unitType: order.unit_type,
        locationLabel,
        verb: 'SPAWN',
        detail: `Spawned ${unitWord} in ${provName(order.origin, provinces)}${coast ? ` (${coast})` : ''}`,
        outcomeLabel: 'Added',
        outcomeTone: 'admin',
        highlightUnitId: order.unit_id,
        highlightProvinces: collectProvinces(order.origin),
      });
    } else if (order.order_type === 'DISBAND') {
      pushGrouped(buckets, {
        id: `adm_${order.unit_id}`,
        power: order.power,
        unitType: order.unit_type,
        locationLabel,
        verb: 'REMOVE',
        detail: `Removed ${unitWord} in ${provName(order.origin, provinces)}`,
        outcomeLabel: 'Removed',
        outcomeTone: 'danger',
        highlightUnitId: order.unit_id,
        highlightProvinces: collectProvinces(order.origin),
      });
    } else if (order.order_type === 'MOVE' && order.target) {
      const targetCoast = order.target_coast ? ` (${order.target_coast})` : '';
      pushGrouped(buckets, {
        id: `adm_${order.unit_id}`,
        power: order.power,
        unitType: order.unit_type,
        locationLabel,
        verb: 'RELOCATE',
        detail: `Relocated → ${provName(order.target, provinces)}${targetCoast}`,
        outcomeLabel: 'Moved',
        outcomeTone: 'admin',
        highlightUnitId: order.unit_id,
        highlightProvinces: collectProvinces(order.origin, order.target),
      });
    }
  }

  const summary = turn.resolution?.summary ?? [];
  const matchesSelected = (line: string) =>
    selectedPowers.length === 0 || selectedPowers.some((p) => line.includes(p));
  return buckets.size === 0 && ownershipChangeCount === 0
    ? summary
        .filter(matchesSelected)
        .map((line) => line.replace(/^\[ADMIN OVERRIDE\]\s*/i, ''))
    : summary
        .filter(
          (line) => line.includes('Updated order') && matchesSelected(line),
        )
        .map((line) => line.replace(/^\[ADMIN OVERRIDE\]\s*/i, ''));
}

function addAdjustmentEntries(
  turn: TurnRecord,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  selectedActions: readonly HistoryActionType[],
  buckets: Map<Power, HistoryOrderEntry[]>,
) {
  const resMap = turn.resolution?.resolutions ?? {};
  const seenKeys = new Set<string>();

  for (const order of Object.values(turn.orders)) {
    if (order.order_type !== 'BUILD' && order.order_type !== 'WAIVE') continue;
    seenKeys.add(order.unit_id);
    if (!matchesHistoryPowers(order.power, selectedPowers)) continue;
    if (!matchesHistoryActions(order.order_type, selectedActions)) continue;
    const res = resMap[order.unit_id];
    const coast = order.origin_coast || order.target_coast;
    const unitWord = order.unit_type === 'A' ? 'Army' : 'Fleet';
    if (order.order_type === 'BUILD') {
      const buildCoast = order.unit_type === 'F' ? coast : null;
      pushGrouped(buckets, {
        id: order.unit_id,
        power: order.power,
        unitType: order.unit_type,
        locationLabel: formatLocationLabel(order.origin, buildCoast, provinces),
        verb: 'BUILD',
        detail: `Built ${unitWord} in ${provName(order.origin, provinces)}${
          order.unit_type === 'F' && coast ? ` (${coast})` : ''
        }`,
        outcomeLabel: res && !res.succeeded ? 'Waived' : 'Built',
        outcomeTone: res && !res.succeeded ? 'neutral' : 'success',
        highlightUnitId: order.unit_id,
        highlightProvinces: collectProvinces(order.origin),
      });
    } else {
      const homeLabel = `Home SC (${provName(order.origin, provinces)})`;
      pushGrouped(buckets, {
        id: order.unit_id,
        power: order.power,
        unitType: null,
        locationLabel: homeLabel,
        verb: 'WAIVE',
        detail: `Waived build in ${provName(order.origin, provinces)}`,
        outcomeLabel: 'Waived',
        outcomeTone: 'neutral',
        highlightUnitId: order.unit_id,
        highlightProvinces: collectProvinces(order.origin),
      });
    }
  }

  for (const [key, res] of Object.entries(resMap)) {
    if (seenKeys.has(key) || res.order_type !== 'BUILD') continue;
    const inferredPower = ALL_POWERS.find((p) => key.startsWith(`BUILD_${p}_`));
    if (!inferredPower || !matchesHistoryPowers(inferredPower, selectedPowers))
      continue;
    if (!matchesHistoryActions('BUILD', selectedActions)) continue;
    const inferredType: UnitType = res.reason.toLowerCase().includes('fleet')
      ? 'F'
      : 'A';
    const loc = provName(res.origin, provinces);
    pushGrouped(buckets, {
      id: key,
      power: inferredPower,
      unitType: inferredType,
      locationLabel: loc,
      verb: 'BUILD',
      detail: res.reason || `Built unit in ${provName(res.origin, provinces)}`,
      outcomeLabel: 'Built',
      outcomeTone: 'success',
      highlightUnitId: key,
      highlightProvinces: collectProvinces(res.origin),
    });
  }

  for (const unit of turn.units) {
    if (!matchesHistoryPowers(unit.power, selectedPowers)) continue;
    const order = turn.orders[unit.id];
    const res = resMap[unit.id];
    const isDisband =
      order?.order_type === 'DISBAND' || res?.order_type === 'DISBAND';
    if (!isDisband) continue;
    if (!matchesHistoryActions('DISBAND', selectedActions)) continue;
    const unitWord = unit.unit_type === 'A' ? 'Army' : 'Fleet';
    const wasExplicit = order?.order_type === 'DISBAND';
    pushGrouped(buckets, {
      id: unit.id,
      power: unit.power,
      unitType: unit.unit_type,
      locationLabel: formatLocationLabel(unit.province, unit.coast, provinces),
      verb: 'DISBAND',
      detail: `Disbanded ${unitWord} in ${provName(unit.province, provinces)}`,
      outcomeLabel: wasExplicit ? 'Disbanded' : 'Auto-disband',
      outcomeTone: 'danger',
      reason: !wasExplicit ? res?.reason : undefined,
      highlightUnitId: unit.id,
      highlightProvinces: collectProvinces(unit.province),
    });
  }
}

function addRetreatEntries(
  turn: TurnRecord,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  buckets: Map<Power, HistoryOrderEntry[]>,
) {
  const resMap = turn.resolution?.resolutions ?? {};
  for (const unit of turn.units) {
    if (!matchesHistoryPowers(unit.power, selectedPowers)) continue;
    const order = turn.orders[unit.id];
    const res = resMap[unit.id];
    const activeInRetreats =
      unit.is_dislodged ||
      order?.order_type === 'RETREAT' ||
      order?.order_type === 'DISBAND' ||
      res?.order_type === 'RETREAT' ||
      res?.order_type === 'DISBAND';
    if (!activeInRetreats) continue;

    const locationLabel = formatLocationLabel(
      unit.province,
      unit.coast,
      provinces,
    );
    const target = order?.target ?? res?.target;
    const targetCoast = order?.target_coast ? ` (${order.target_coast})` : '';
    if (order?.order_type === 'RETREAT' && target) {
      const outcomeLabel = res?.succeeded
        ? 'Retreated'
        : res?.bounced
          ? 'Bounced'
          : 'Disbanded';
      pushGrouped(buckets, {
        id: unit.id,
        power: unit.power,
        unitType: unit.unit_type,
        locationLabel,
        verb: 'RETREAT',
        detail: `Retreat → ${provName(target, provinces)}${targetCoast}`,
        outcomeLabel,
        outcomeTone: res?.succeeded ? 'success' : 'danger',
        reason: !res?.succeeded ? res?.reason : undefined,
        highlightUnitId: unit.id,
        highlightProvinces: collectProvinces(unit.province, target),
      });
    } else {
      pushGrouped(buckets, {
        id: unit.id,
        power: unit.power,
        unitType: unit.unit_type,
        locationLabel,
        verb: 'DISBAND',
        detail: `Disbanded in ${provName(unit.province, provinces)}`,
        outcomeLabel: 'Disbanded',
        outcomeTone: 'danger',
        reason:
          res?.reason && res.reason !== 'Disbanded per orders.'
            ? res.reason
            : undefined,
        highlightUnitId: unit.id,
        highlightProvinces: collectProvinces(unit.province),
      });
    }
  }
}

function addMovementEntries(
  turn: TurnRecord,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  selectedActions: readonly HistoryActionType[],
  buckets: Map<Power, HistoryOrderEntry[]>,
) {
  const resMap = turn.resolution?.resolutions ?? {};
  const unitsByProv: Record<string, Unit> = {};
  for (const unit of turn.units) {
    if (!unit.is_dislodged) unitsByProv[unit.province] = unit;
  }

  for (const unit of turn.units) {
    if (!matchesHistoryPowers(unit.power, selectedPowers)) continue;
    const order = turn.orders[unit.id];
    const orderType = order?.order_type ?? 'HOLD';
    if (!matchesHistoryActions(orderType, selectedActions)) continue;
    const summary = formatOrderSummary(
      order ?? {
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'HOLD',
        via_convoy: false,
        is_explicit: false,
      },
      provinces,
      unitsByProv,
    );
    const res = resMap[unit.id];
    const outcome = outcomeForMovement(orderType, res);
    pushGrouped(buckets, {
      id: unit.id,
      power: unit.power,
      unitType: unit.unit_type,
      locationLabel: formatLocationLabel(unit.province, unit.coast, provinces),
      verb: summary.verb,
      detail: summary.targetText,
      outcomeLabel: outcome.label,
      outcomeTone: outcome.tone,
      reason: outcome.includeReason ? res?.reason : undefined,
      highlightUnitId: unit.id,
      highlightProvinces: collectProvinces(
        unit.province,
        order?.aux_unit_origin,
        order?.target,
      ),
    });
  }
}

/**
 * Group everything that happened in a past `TurnRecord` (movements, retreats, winter adjustments,
 * or admin edits) by nation, filtered to `selectedPowers` and `selectedActions` (on Movement phases).
 */
export function buildHistoryTurnLog(
  turn: TurnRecord,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  selectedActions: readonly HistoryActionType[] = [],
): HistoryTurnLog {
  const buckets = new Map<Power, HistoryOrderEntry[]>();
  const phaseKind: HistoryPhaseKind =
    turn.phase === 'Admin'
      ? 'Admin'
      : turn.phase === 'Adjustments' || turn.season === 'Winter'
        ? 'Adjustments'
        : turn.phase === 'Retreats'
          ? 'Retreats'
          : 'Movement';

  const ownershipChanges = collectOwnershipChanges(
    turn,
    provinces,
    selectedPowers,
  );
  let adminNotes: string[] = [];

  if (phaseKind === 'Admin') {
    adminNotes = addAdminTurnEntries(
      turn,
      provinces,
      selectedPowers,
      buckets,
      ownershipChanges.length,
    );
  } else if (phaseKind === 'Adjustments') {
    addAdjustmentEntries(
      turn,
      provinces,
      selectedPowers,
      selectedActions,
      buckets,
    );
  } else if (phaseKind === 'Retreats') {
    addRetreatEntries(turn, provinces, selectedPowers, buckets);
  } else {
    addMovementEntries(
      turn,
      provinces,
      selectedPowers,
      selectedActions,
      buckets,
    );
  }

  const groups: HistoryPowerGroup[] = ALL_POWERS.flatMap((pwr) => {
    const list = buckets.get(pwr);
    return list && list.length > 0 ? [{ power: pwr, entries: list }] : [];
  });

  const groupCount = groups.reduce((sum, g) => sum + g.entries.length, 0);
  return {
    phaseKind,
    groups,
    ownershipChanges,
    adminNotes,
    totalCount: groupCount + ownershipChanges.length + adminNotes.length,
  };
}
