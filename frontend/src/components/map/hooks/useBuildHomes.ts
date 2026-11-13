import { useMemo } from 'react';
import type { Order, Power } from '../../../types/diplomacy';
import { adjustmentOrdersFor } from '../../../utils/historyHelpers';

export interface UseBuildHomesOptions {
  orders: Record<string, Order>;
  builds: Record<Power, { count: number; homes: string[] }> | null;
  activePower: Power;
  canEditAnyPower: boolean;
  historyView: boolean;
  historyPower: Power | null;
  isAdjustmentPhase: boolean;
  phase?: string;
}

/**
 * The winter build slots drawn on the map, by home centre, with the power that builds there:
 * the slots the player may fill this winter, or on a past winter the builds that were ordered.
 */
export function useBuildHomes({
  orders,
  builds,
  activePower,
  canEditAnyPower,
  historyView,
  historyPower,
  isAdjustmentPhase,
  phase,
}: UseBuildHomesOptions): Record<string, Power> {
  // Build homes map for Adjustments phase (and Admin history snapshots with spawned units)
  return useMemo(() => {
    const homes: Record<string, Power> = {};
    // A past winter or Admin snapshot shows the builds that were ordered, by every power (or the chosen one).
    if (historyView) {
      if (isAdjustmentPhase || phase === 'Admin') {
        for (const o of adjustmentOrdersFor(orders, historyPower)) {
          if (o.order_type === 'BUILD') homes[o.origin] = o.power;
        }
      }
      return homes;
    }
    if (isAdjustmentPhase && builds) {
      for (const [pwrStr, bInfo] of Object.entries(builds)) {
        const pwr = pwrStr as Power;
        if (bInfo.count > 0 && (pwr === activePower || canEditAnyPower)) {
          for (const h of bInfo.homes) {
            homes[h] = pwr;
          }
        }
      }
    }
    return homes;
  }, [
    historyView,
    historyPower,
    orders,
    isAdjustmentPhase,
    phase,
    builds,
    activePower,
    canEditAnyPower,
  ]);
}
