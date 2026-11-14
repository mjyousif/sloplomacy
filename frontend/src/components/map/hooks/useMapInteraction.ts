import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import {
  convoyOrder,
  holdOrder,
  moveOrder,
  retreatOrder,
  supportOrder,
} from '../../../utils/orderBuilders';
import {
  canArmyConvoyMoveTo,
  canPickConvoyArmyAt,
  canPickConvoyTargetAt,
  canPickSupportTargetAt,
  canPickSupportUnitAt,
} from './mapReachabilityHelpers';
import type { MapGestures } from './useMapGestures';
import type { MapSelection } from './useMapSelection';

export type MapInteractionMode =
  | 'MOVE'
  | 'SUPPORT_PICK_UNIT'
  | 'SUPPORT_PICK_TARGET'
  | 'CONVOY_PICK_ARMY'
  | 'CONVOY_PICK_TARGET';

export interface PendingCoastChoice {
  target: string;
  coasts: string[];
}

export interface UseMapInteractionOptions {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  builds: Record<Power, { count: number; homes: string[] }> | null;
  selectedUnitId: string | null;
  /** The selected unit's saved order: an unfinished support or convoy resumes at its next step. */
  selectedOrder?: Order;
  onSelectUnit: (unitId: string | null) => void;
  onUpdateOrder: (order: Order) => void;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  unitsByProv: Record<string, Unit>;
  dislodgedByProv: Record<string, Unit>;
  /** Home centres the player may build in this winter, with the power that would build. */
  controllableBuildHomes: Record<string, Power>;
  selection: MapSelection;
  gestures: Pick<MapGestures, 'isPanningRef' | 'dragMovedRef'>;
}

export interface MapInteraction {
  interactionMode: MapInteractionMode;
  /** True once the player presses Move on this selection, which replaces a saved Hold's highlight. */
  moveModeChosen: boolean;
  /** The unit a support or convoy is for, once it has been picked. */
  pendingAuxOrigin: string | null;
  /** A fleet's move to a split-coast province, waiting for the player to pick the coast. */
  pendingCoastChoice: PendingCoastChoice | null;
  hoveredProv: string | null;
  clearSelection: () => void;
  handleSelectUnitOnMap: (u: Unit, e?: React.MouseEvent) => void;
  commitMoveOrRetreatOrder: (
    unit: Unit,
    targetProv: string,
    targetCoast?: string | null,
  ) => void;
  /** Stable, so the memoized province polygons don't re-render for it. */
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  /** Stable, and ignored while the map is being panned. */
  onHoverProvince: (provId: string | null) => void;
  /** The unit menu's buttons. */
  chooseMove: () => void;
  chooseRetreat: () => void;
  chooseSupport: () => void;
  chooseConvoy: () => void;
  cancelCoastChoice: () => void;
}

/**
 * The map's click state machine. A click on a unit or a province selects, picks the unit a
 * support or convoy is for, picks its target, or gives the selected unit its order, depending
 * on the phase and the step the player is on. Each order goes out through `onUpdateOrder`.
 */
export function useMapInteraction({
  provinces,
  units,
  builds,
  selectedUnitId,
  selectedOrder,
  onSelectUnit,
  onUpdateOrder,
  isAdjustmentPhase,
  isRetreatPhase,
  unitsByProv,
  dislodgedByProv,
  controllableBuildHomes,
  selection,
  gestures,
}: UseMapInteractionOptions): MapInteraction {
  const {
    selectedUnit,
    selectedUnitOptions,
    controlPower,
    canEditAnyPower,
    reachableMap,
  } = selection;
  const { isPanningRef, dragMovedRef } = gestures;

  const [hoveredProv, setHoveredProv] = useState<string | null>(null);
  const [pickedMode, setInteractionMode] = useState<MapInteractionMode>('MOVE');
  // True once the player presses Move on this selection, which replaces a saved Hold's highlight
  const [moveModeChosen, setMoveModeChosen] = useState<boolean>(false);
  const [pickedAuxOrigin, setPendingAuxOrigin] = useState<string | null>(null);
  const [pendingCoastChoice, setPendingCoastChoice] =
    useState<PendingCoastChoice | null>(null);

  // Reset the chosen mode whenever a different unit is selected: during render, not in an
  // effect, so the new unit's menu shows its own saved order on its first paint.
  const [menuUnitId, setMenuUnitId] = useState(selectedUnitId);
  if (menuUnitId !== selectedUnitId) {
    setMenuUnitId(selectedUnitId);
    setMoveModeChosen(false);
  }

  // A support or convoy opened on the sidebar card (or left unfinished) has no map step of its
  // own yet, so the map resumes it: the next click picks the unit, then the target.
  let interactionMode = pickedMode;
  let pendingAuxOrigin = pickedAuxOrigin;
  if (
    pickedMode === 'MOVE' &&
    !moveModeChosen &&
    selectedUnit &&
    selectedOrder &&
    selectedOrder.unit_id === selectedUnit.id &&
    (selectedOrder.order_type === 'SUPPORT' ||
      selectedOrder.order_type === 'CONVOY') &&
    !selectedOrder.target
  ) {
    const isSupport = selectedOrder.order_type === 'SUPPORT';
    if (selectedOrder.aux_unit_origin) {
      interactionMode = isSupport
        ? 'SUPPORT_PICK_TARGET'
        : 'CONVOY_PICK_TARGET';
      pendingAuxOrigin = selectedOrder.aux_unit_origin;
    } else {
      interactionMode = isSupport ? 'SUPPORT_PICK_UNIT' : 'CONVOY_PICK_ARMY';
    }
  }

  const clearSelection = () => {
    onSelectUnit(null);
    setInteractionMode('MOVE');
    setPendingAuxOrigin(null);
    setPendingCoastChoice(null);
  };

  const handleSelectUnitOnMap = (u: Unit, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (dragMovedRef.current) return;

    if (isRetreatPhase) {
      if (!u.is_dislodged) {
        // If there is also a dislodged unit in this province, select the dislodged unit!
        const dis = dislodgedByProv[u.province];
        if (dis && (dis.power === controlPower || canEditAnyPower)) {
          onSelectUnit(dis.id);
          setInteractionMode('MOVE');
          return;
        }
        clearSelection();
        return;
      }
      const canControl = u.power === controlPower || canEditAnyPower;
      if (!canControl) {
        clearSelection();
        return;
      }
      if (selectedUnit && u.id === selectedUnit.id) {
        clearSelection();
      } else {
        onSelectUnit(u.id);
        setInteractionMode('MOVE');
      }
      return;
    }

    if (isAdjustmentPhase) {
      const canControl = u.power === controlPower || canEditAnyPower;
      if (!canControl) {
        clearSelection();
        return;
      }
      const pwrBuildCount = builds?.[u.power]?.count ?? 0;
      if (pwrBuildCount < 0) {
        if (selectedUnit && u.id === selectedUnit.id) {
          clearSelection();
        } else {
          onSelectUnit(u.id);
        }
      } else {
        clearSelection();
      }
      return;
    }

    // 1. SUPPORT_PICK_UNIT: pick another unit in range to support
    if (selectedUnit && interactionMode === 'SUPPORT_PICK_UNIT') {
      if (
        canPickSupportUnitAt(
          u.province,
          selectedUnit,
          unitsByProv,
          selectedUnitOptions,
        )
      ) {
        setPendingAuxOrigin(u.province);
        setInteractionMode('SUPPORT_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    // 2 & 3. SUPPORT_PICK_TARGET: delegate unit clicks to province validation
    if (
      selectedUnit &&
      interactionMode === 'SUPPORT_PICK_TARGET' &&
      pendingAuxOrigin
    ) {
      handleProvinceClick(u.province);
      return;
    }

    // 4. CONVOY_PICK_ARMY: only a convoyable coastal Army can board
    if (selectedUnit && interactionMode === 'CONVOY_PICK_ARMY') {
      if (
        canPickConvoyArmyAt(
          u.province,
          unitsByProv,
          provinces,
          selectedUnitOptions,
        )
      ) {
        setPendingAuxOrigin(u.province);
        setInteractionMode('CONVOY_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    // 4b. CONVOY_PICK_TARGET: clicking a unit delegates to its province
    if (
      selectedUnit &&
      interactionMode === 'CONVOY_PICK_TARGET' &&
      pendingAuxOrigin
    ) {
      handleProvinceClick(u.province);
      return;
    }

    // 5. Clicking the already-selected unit deselects it
    if (selectedUnit && u.id === selectedUnit.id) {
      clearSelection();
      return;
    }

    // 6. Foreign units: in MOVE mode delegate to province click (allows land or convoy attacks)
    const canControlClickedUnit = u.power === controlPower || canEditAnyPower;
    if (!canControlClickedUnit) {
      if (selectedUnit && interactionMode === 'MOVE') {
        handleProvinceClick(u.province);
        return;
      }
      clearSelection();
      return;
    }

    // 7. Select controllable unit
    onSelectUnit(u.id);
    setInteractionMode('MOVE');
    setPendingAuxOrigin(null);
    setPendingCoastChoice(null);
  };

  const commitMoveOrRetreatOrder = (
    unit: Unit,
    targetProv: string,
    targetCoast: string | null = null,
  ) => {
    if (isRetreatPhase && unit.is_dislodged) {
      onUpdateOrder(retreatOrder(unit, targetProv, targetCoast));
      clearSelection();
      return;
    }

    const isDirect = Boolean(reachableMap[targetProv]);
    const isActiveConvoy = Boolean(
      selectedUnitOptions?.active_convoys.includes(targetProv),
    );
    const viaConvoy = unit.unit_type === 'A' && (isActiveConvoy || !isDirect);
    onUpdateOrder(moveOrder(unit, targetProv, targetCoast, viaConvoy));
    clearSelection();
  };

  const dispatchWithCoastChoice = (
    unit: Unit,
    provId: string,
    explicitCoast: string | null,
  ) => {
    const coasts = reachableMap[provId] || [];
    if (
      unit.unit_type === 'F' &&
      explicitCoast &&
      coasts.includes(explicitCoast)
    ) {
      commitMoveOrRetreatOrder(unit, provId, explicitCoast);
      return;
    }
    if (unit.unit_type === 'F' && coasts.length > 1) {
      setPendingCoastChoice({ target: provId, coasts });
      return;
    }
    const singleCoast =
      unit.unit_type === 'F' && coasts.length === 1 ? coasts[0] : null;
    commitMoveOrRetreatOrder(unit, provId, singleCoast);
  };

  const handleProvinceClick = (
    provId: string,
    explicitCoast: string | null = null,
  ) => {
    if (dragMovedRef.current) return;
    if (provinces[provId]?.type === 'IMPASSABLE') {
      clearSelection();
      return;
    }

    if (isAdjustmentPhase) {
      const buildPwr = controllableBuildHomes[provId];
      if (buildPwr) {
        const bId = `BUILD_${buildPwr}_${provId}`;
        onSelectUnit(selectedUnitId === bId ? null : bId);
        return;
      }
      const occ = unitsByProv[provId];
      if (
        occ &&
        (occ.power === controlPower || canEditAnyPower) &&
        (builds?.[occ.power]?.count ?? 0) < 0
      ) {
        onSelectUnit(selectedUnitId === occ.id ? null : occ.id);
        return;
      }
      clearSelection();
      return;
    }

    if (isRetreatPhase) {
      if (!selectedUnit) {
        const dis = dislodgedByProv[provId];
        if (dis && (dis.power === controlPower || canEditAnyPower)) {
          onSelectUnit(dis.id);
          setInteractionMode('MOVE');
        }
        return;
      }
      if (reachableMap[provId]) {
        dispatchWithCoastChoice(selectedUnit, provId, explicitCoast);
        return;
      }
      const dis = dislodgedByProv[provId];
      if (dis && (dis.power === controlPower || canEditAnyPower)) {
        onSelectUnit(dis.id);
        setInteractionMode('MOVE');
      } else {
        clearSelection();
      }
      return;
    }

    if (!selectedUnit) {
      const occupant = unitsByProv[provId];
      if (occupant && (occupant.power === controlPower || canEditAnyPower)) {
        onSelectUnit(occupant.id);
        setInteractionMode('MOVE');
      }
      return;
    }

    if (interactionMode === 'MOVE') {
      if (provId === selectedUnit.province) {
        onUpdateOrder(holdOrder(selectedUnit));
        clearSelection();
        return;
      }

      const isReachable = Boolean(reachableMap[provId]);
      const canConvoyMove = canArmyConvoyMoveTo(
        selectedUnit,
        provId,
        provinces,
        units,
        selectedUnitOptions,
      );

      if (!isReachable && !canConvoyMove) {
        const occupant = unitsByProv[provId];
        if (occupant && (occupant.power === controlPower || canEditAnyPower)) {
          onSelectUnit(occupant.id);
          setInteractionMode('MOVE');
          setPendingAuxOrigin(null);
          setPendingCoastChoice(null);
        } else {
          clearSelection();
        }
        return;
      }

      dispatchWithCoastChoice(selectedUnit, provId, explicitCoast);
      return;
    }

    if (interactionMode === 'SUPPORT_PICK_UNIT') {
      if (
        canPickSupportUnitAt(
          provId,
          selectedUnit,
          unitsByProv,
          selectedUnitOptions,
        )
      ) {
        setPendingAuxOrigin(provId);
        setInteractionMode('SUPPORT_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    if (interactionMode === 'SUPPORT_PICK_TARGET' && pendingAuxOrigin) {
      if (
        canPickSupportTargetAt(provId, pendingAuxOrigin, selectedUnitOptions)
      ) {
        onUpdateOrder(supportOrder(selectedUnit, pendingAuxOrigin, provId));
      }
      clearSelection();
      return;
    }

    if (interactionMode === 'CONVOY_PICK_ARMY') {
      if (
        canPickConvoyArmyAt(provId, unitsByProv, provinces, selectedUnitOptions)
      ) {
        setPendingAuxOrigin(provId);
        setInteractionMode('CONVOY_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    if (interactionMode === 'CONVOY_PICK_TARGET' && pendingAuxOrigin) {
      if (
        canPickConvoyTargetAt(
          provId,
          pendingAuxOrigin,
          provinces,
          selectedUnitOptions,
        )
      ) {
        onUpdateOrder(convoyOrder(selectedUnit, pendingAuxOrigin, provId));
      }
      clearSelection();
      return;
    }
  };

  const handleProvinceClickRef = useRef(handleProvinceClick);
  handleProvinceClickRef.current = handleProvinceClick;

  const stableOnClickProvince = useCallback(
    (provId: string, explicitCoast?: string | null) => {
      handleProvinceClickRef.current(provId, explicitCoast ?? null);
    },
    [],
  );

  const stableOnHoverProvince = useCallback((provId: string | null) => {
    if (isPanningRef.current) return;
    setHoveredProv(provId);
  }, []);

  return {
    interactionMode,
    moveModeChosen,
    pendingAuxOrigin,
    pendingCoastChoice,
    hoveredProv,
    clearSelection,
    handleSelectUnitOnMap,
    commitMoveOrRetreatOrder,
    onClickProvince: stableOnClickProvince,
    onHoverProvince: stableOnHoverProvince,
    chooseMove: () => {
      setInteractionMode('MOVE');
      setMoveModeChosen(true);
      setPendingAuxOrigin(null);
    },
    chooseRetreat: () => setInteractionMode('MOVE'),
    chooseSupport: () => {
      setInteractionMode('SUPPORT_PICK_UNIT');
      setPendingAuxOrigin(null);
    },
    chooseConvoy: () => {
      setInteractionMode('CONVOY_PICK_ARMY');
      setPendingAuxOrigin(null);
    },
    cancelCoastChoice: () => setPendingCoastChoice(null),
  };
}
