import { useCallback, useMemo } from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import {
  getReachableDestinations,
  getValidRetreatDestinations,
} from '../../../utils/orderHelpers';

export interface UseMapSelectionOptions {
  selectedUnitId: string | null;
  orders: Record<string, Order>;
  unitsById: Record<string, Unit>;
  provinces: Record<string, ProvinceInfo>;
  retreats: Record<Power, Record<string, string[]>> | null;
  unitOptions?: Record<string, UnitMoveOptions> | null;
  activePower: Power;
  sandboxMode: boolean;
  directEditActive: boolean;
  historyView: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  /**
   * While a move suggestion is being written: the powers whose units can be given orders (the
   * player and the thread's other members). Null otherwise. Keep the array stable.
   */
  suggestPowers?: Power[] | null;
}

export interface MapSelection {
  /** The selected winter build slot's order, if a build slot is selected. */
  selectedBuildOrder: Order | null;
  /** The home centre of the selected build slot. */
  selectedBuildProv: string | null;
  /** The selected unit, if the player may command it now. */
  selectedUnit: Unit | null;
  /** Server-computed options for the selected unit, if present. */
  selectedUnitOptions: UnitMoveOptions | null;
  /** True in the sandbox, or for a host with Direct-Edit on. Never on a past turn. */
  canEditAnyPower: boolean;
  /** Whether the player may pick this unit up and order it now. */
  canControl: (unit: Unit) => boolean;
  /** The power the player commands, or null on a past turn. */
  controlPower: Power | null;
  /** Where the selected unit can move or retreat to, with the coasts a fleet can land on. */
  reachableList: { province: string; coasts: string[] }[];
  reachableMap: Record<string, string[]>;
}

/** What is selected on the map, whether the player may command it, and where it can go. */
export function useMapSelection({
  selectedUnitId,
  orders,
  unitsById,
  provinces,
  retreats,
  unitOptions = null,
  activePower,
  sandboxMode,
  directEditActive,
  historyView,
  isAdjustmentPhase,
  isRetreatPhase,
  suggestPowers = null,
}: UseMapSelectionOptions): MapSelection {
  // Check if selectedUnitId refers to a BUILD_ order or an existing Unit
  const canEditAnyPower = !historyView && (sandboxMode || directEditActive);
  const controlPower: Power | null = historyView ? null : activePower;
  const isSelectedBuildOrder = Boolean(
    !historyView &&
      isAdjustmentPhase &&
      selectedUnitId &&
      selectedUnitId.startsWith('BUILD_'),
  );
  const buildSlotPower =
    isSelectedBuildOrder && selectedUnitId
      ? (selectedUnitId.split('_')[1] as Power | undefined)
      : undefined;
  const canControlBuildSlot = Boolean(
    buildSlotPower &&
      (canEditAnyPower ||
        (suggestPowers
          ? suggestPowers.includes(buildSlotPower)
          : buildSlotPower === controlPower)),
  );
  const selectedBuildOrder =
    isSelectedBuildOrder && canControlBuildSlot && selectedUnitId
      ? orders[selectedUnitId]
      : null;
  const selectedBuildProv =
    isSelectedBuildOrder && canControlBuildSlot && selectedUnitId
      ? selectedBuildOrder?.origin || selectedUnitId.split('_')[2] || null
      : null;

  const rawSelectedUnit =
    selectedUnitId && !isSelectedBuildOrder ? unitsById[selectedUnitId] : null;
  // A player may only command foreign units in the sandbox, or as host with Direct-Edit on
  // A past turn is read-only: no power's units can be picked up, not even the player's own.
  // Strictly disallow controlling or showing the menu for foreign units otherwise. A move
  // suggestion is written for the units of the thread's members, the player's own included.
  const canControl = useCallback(
    (unit: Unit) =>
      canEditAnyPower ||
      (suggestPowers
        ? !historyView && suggestPowers.includes(unit.power)
        : unit.power === controlPower),
    [canEditAnyPower, suggestPowers, historyView, controlPower],
  );
  const selectedUnit =
    rawSelectedUnit &&
    canControl(rawSelectedUnit) &&
    (!isRetreatPhase || rawSelectedUnit.is_dislodged)
      ? rawSelectedUnit
      : null;

  const selectedUnitOptions =
    selectedUnit && unitOptions ? (unitOptions[selectedUnit.id] ?? null) : null;

  const { reachableList, reachableMap } = useMemo(() => {
    if (directEditActive) {
      return { reachableList: [], reachableMap: {} };
    }
    const list = selectedUnit
      ? isRetreatPhase
        ? getValidRetreatDestinations(
            selectedUnit,
            retreats,
            provinces,
            selectedUnitOptions,
          )
        : isAdjustmentPhase
          ? []
          : getReachableDestinations(
              selectedUnit,
              provinces,
              selectedUnitOptions,
            )
      : [];
    const map: Record<string, string[]> = {};
    for (const r of list) {
      map[r.province] = r.coasts;
    }
    return { reachableList: list, reachableMap: map };
  }, [
    directEditActive,
    selectedUnit,
    selectedUnitOptions,
    isRetreatPhase,
    isAdjustmentPhase,
    retreats,
    provinces,
  ]);

  return {
    selectedBuildOrder,
    selectedBuildProv,
    selectedUnit,
    selectedUnitOptions,
    canEditAnyPower,
    canControl,
    controlPower,
    reachableList,
    reachableMap,
  };
}
