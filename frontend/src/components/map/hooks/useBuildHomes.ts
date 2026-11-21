import { useMemo } from 'react';
import type { Order, Power } from '../../../types/diplomacy';
import {
  adjustmentOrdersFor,
  type HistoryActionType,
} from '../../../utils/historyHelpers';

export interface UseBuildHomesOptions {
  orders: Record<string, Order>;
  builds: Record<Power, { count: number; homes: string[] }> | null;
  activePower: Power;
  canEditAnyPower: boolean;
  historyView: boolean;
  historyPowers: readonly Power[];
  historyActions?: readonly HistoryActionType[];
  isAdjustmentPhase: boolean;
  phase?: string;
  /** While an order suggestion is being drafted: powers whose build slots may be staged. */
  suggestPowers?: Power[] | null;
}

const NO_HISTORY_ACTIONS: readonly HistoryActionType[] = [];

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
  historyPowers,
  historyActions = NO_HISTORY_ACTIONS,
  isAdjustmentPhase,
  phase,
  suggestPowers = null,
}: UseBuildHomesOptions): Record<string, Power> {
  // Build homes map for Adjustments phase (and Admin history snapshots with spawned units)
  return useMemo(() => {
    const homes: Record<string, Power> = {};
    // A past winter or Admin snapshot shows the builds that were ordered, by selected powers/actions (or all).
    if (historyView) {
      if (isAdjustmentPhase || phase === 'Admin') {
        const actions = isAdjustmentPhase ? historyActions : NO_HISTORY_ACTIONS;
        for (const o of adjustmentOrdersFor(orders, historyPowers, actions)) {
          if (o.order_type === 'BUILD') homes[o.origin] = o.power;
        }
      }
      return homes;
    }
    if (isAdjustmentPhase && builds) {
      for (const [pwrStr, bInfo] of Object.entries(builds)) {
        const pwr = pwrStr as Power;
        const canBuild = suggestPowers
          ? suggestPowers.includes(pwr)
          : pwr === activePower || canEditAnyPower;
        if (bInfo.count > 0 && canBuild) {
          for (const h of bInfo.homes) {
            homes[h] = pwr;
          }
        }
      }
    }
    return homes;
  }, [
    historyView,
    historyPowers,
    historyActions,
    orders,
    isAdjustmentPhase,
    phase,
    builds,
    activePower,
    canEditAnyPower,
    suggestPowers,
  ]);
}
