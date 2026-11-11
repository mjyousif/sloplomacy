import { useCallback, useMemo } from 'react';
import {
  EUROPE_PROVINCE_GEOMETRY,
  type Point,
} from '../../../data/europeMapGeometry';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
  ValidationIssue,
} from '../../../types/diplomacy';
import { canUnitSupportInto } from '../../../utils/orderHelpers';
import { computeQuadraticCurve } from '../utils/curveGeometry';

export interface UseOrderOverlayOptions {
  units: Unit[];
  orders: Record<string, Order>;
  provinces: Record<string, ProvinceInfo>;
  issues: ValidationIssue[];
  unitsByProv: Record<string, Unit>;
  activePower: Power;
  canEditAnyPower: boolean;
  historyView: boolean;
  historyPower: Power | null;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  getUnitPoint: (unit: Unit) => Point;
  getProvincePoint: (provCode: string, coast?: string | null) => Point;
  /** How far the active piece style pushes arrows off a piece. */
  arrowScale: number;
}

export interface OrderOverlay {
  issuesByUnit: Record<string, ValidationIssue[]>;
  issuesByProvince: Record<string, ValidationIssue[]>;
  /** Whose orders are drawn: the player's own, everyone's in the sandbox, or a past turn's. */
  isUnitOrderVisible: (u: Unit) => boolean;
  /** Valid supports each moving or holding unit receives, among the orders drawn. */
  supportCountByUnitId: Record<string, number>;
  /** The middle of each move arrow, by origin, where a support line points. */
  moveMidpointsByOrigin: Record<string, Point>;
}

/** What the order arrows and unit badges need to know about the orders on the board. */
export function useOrderOverlay({
  units,
  orders,
  provinces,
  issues,
  unitsByProv,
  activePower,
  canEditAnyPower,
  historyView,
  historyPower,
  isRetreatPhase,
  isAdjustmentPhase,
  getUnitPoint,
  getProvincePoint,
  arrowScale,
}: UseOrderOverlayOptions): OrderOverlay {
  const { issuesByUnit, issuesByProvince } = useMemo(() => {
    // Only show issues for activePower unless foreign units can be edited
    const visibleIssues = canEditAnyPower
      ? issues
      : issues.filter((i) => i.power === activePower);

    const byUnit: Record<string, ValidationIssue[]> = {};
    const byProvince: Record<string, ValidationIssue[]> = {};
    for (const iss of visibleIssues) {
      for (const uid of iss.unit_ids) {
        if (!byUnit[uid]) byUnit[uid] = [];
        byUnit[uid].push(iss);
      }
      if (iss.severity !== 'info') {
        for (const pid of iss.provinces) {
          if (!byProvince[pid]) byProvince[pid] = [];
          byProvince[pid].push(iss);
        }
      }
    }
    return { issuesByUnit: byUnit, issuesByProvince: byProvince };
  }, [issues, canEditAnyPower, activePower]);

  // Filter which units' orders are visible on the map:
  const isUnitOrderVisible = useCallback(
    (u: Unit) =>
      historyView
        ? historyPower === null || u.power === historyPower
        : canEditAnyPower || u.power === activePower,
    [historyView, historyPower, canEditAnyPower, activePower],
  );

  // Count how many valid supports each moving/holding unit receives among visible orders
  const supportCountByUnitId = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!isRetreatPhase && !isAdjustmentPhase) {
      for (const u of units) {
        if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
        const o = orders[u.id];
        if (o && o.order_type === 'SUPPORT' && o.aux_unit_origin && o.target) {
          const targetUnit = unitsByProv[o.aux_unit_origin];
          if (targetUnit && isUnitOrderVisible(targetUnit)) {
            const targetOrder = orders[targetUnit.id];
            const isHoldSup = o.aux_unit_origin === o.target;
            if (
              (isHoldSup &&
                (!targetOrder || targetOrder.order_type !== 'MOVE')) ||
              (!isHoldSup &&
                targetOrder?.order_type === 'MOVE' &&
                targetOrder?.target === o.target)
            ) {
              if (canUnitSupportInto(u, o.target, provinces)) {
                counts[targetUnit.id] = (counts[targetUnit.id] || 0) + 1;
              }
            }
          }
        }
      }
    }
    return counts;
  }, [
    units,
    orders,
    unitsByProv,
    provinces,
    isUnitOrderVisible,
    isRetreatPhase,
    isAdjustmentPhase,
  ]);

  // Precompute Move midpoints so Support arrows point directly to the move arrow they support
  const moveMidpointsByOrigin = useMemo(() => {
    const midpoints: Record<string, Point> = {};
    for (const u of units) {
      if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
      const o = orders[u.id];
      if (
        o &&
        o.order_type === 'MOVE' &&
        o.target &&
        EUROPE_PROVINCE_GEOMETRY[o.target]
      ) {
        const p1 = getUnitPoint(u);
        const p2 = getProvincePoint(o.target, o.target_coast);
        const { mid } = computeQuadraticCurve(p1, p2, 0.14, arrowScale);
        midpoints[u.province] = mid;
      }
    }
    return midpoints;
  }, [
    units,
    orders,
    isUnitOrderVisible,
    getUnitPoint,
    getProvincePoint,
    arrowScale,
  ]);

  return {
    issuesByUnit,
    issuesByProvince,
    isUnitOrderVisible,
    supportCountByUnitId,
    moveMidpointsByOrigin,
  };
}
