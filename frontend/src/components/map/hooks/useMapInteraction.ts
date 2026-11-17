import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import {
  holdOrder,
  moveOrder,
  retreatOrder,
} from '../../../utils/orderBuilders';
import {
  canArmyConvoyMoveTo,
  type MapInteractionMode,
  resolveActiveInteractionState,
  resolveCoastDispatch,
  resolveMoveViaConvoy,
  resolveSupportOrConvoyAuxPick,
  resolveSupportOrConvoyTargetOrder,
} from './mapReachabilityHelpers';
import type { MapGestures } from './useMapGestures';
import type { MapSelection } from './useMapSelection';

export type { MapInteractionMode } from './mapReachabilityHelpers';

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
  const { selectedUnit, selectedUnitOptions, canControl, reachableMap } =
    selection;
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

  const { interactionMode, pendingAuxOrigin } = resolveActiveInteractionState({
    pickedMode,
    moveModeChosen,
    pickedAuxOrigin,
    selectedUnit,
    selectedOrder,
  });

  const clearSelection = () => {
    onSelectUnit(null);
    setInteractionMode('MOVE');
    setPendingAuxOrigin(null);
    setPendingCoastChoice(null);
  };

  const selectUnitInMoveMode = (unitId: string) => {
    onSelectUnit(unitId);
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
        if (dis && canControl(dis)) {
          onSelectUnit(dis.id);
          setInteractionMode('MOVE');
          return;
        }
        clearSelection();
        return;
      }
      if (!canControl(u)) {
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
      if (!canControl(u)) {
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

    // 1 & 4. Pick the unit/army for SUPPORT or CONVOY
    if (
      selectedUnit &&
      (interactionMode === 'SUPPORT_PICK_UNIT' ||
        interactionMode === 'CONVOY_PICK_ARMY')
    ) {
      const nextMode = resolveSupportOrConvoyAuxPick({
        interactionMode,
        provId: u.province,
        selectedUnit,
        unitsByProv,
        provinces,
        selectedUnitOptions,
      });
      if (nextMode) {
        setPendingAuxOrigin(u.province);
        setInteractionMode(nextMode);
      } else {
        clearSelection();
      }
      return;
    }

    // 2, 3, & 4b. Picking a target unit delegates to province validation
    if (
      selectedUnit &&
      (interactionMode === 'SUPPORT_PICK_TARGET' ||
        interactionMode === 'CONVOY_PICK_TARGET') &&
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
    if (!canControl(u)) {
      if (selectedUnit && interactionMode === 'MOVE') {
        handleProvinceClick(u.province);
        return;
      }
      clearSelection();
      return;
    }

    // 7. Select controllable unit
    selectUnitInMoveMode(u.id);
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

    const viaConvoy = resolveMoveViaConvoy(
      unit,
      targetProv,
      reachableMap,
      selectedUnitOptions,
    );
    onUpdateOrder(moveOrder(unit, targetProv, targetCoast, viaConvoy));
    clearSelection();
  };

  const dispatchWithCoastChoice = (
    unit: Unit,
    provId: string,
    explicitCoast: string | null,
  ) => {
    const decision = resolveCoastDispatch(
      unit,
      provId,
      explicitCoast,
      reachableMap,
    );
    if (decision.kind === 'pick') {
      setPendingCoastChoice({
        target: decision.target,
        coasts: decision.coasts,
      });
      return;
    }
    commitMoveOrRetreatOrder(unit, provId, decision.coast);
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
      if (occ && canControl(occ) && (builds?.[occ.power]?.count ?? 0) < 0) {
        onSelectUnit(selectedUnitId === occ.id ? null : occ.id);
        return;
      }
      clearSelection();
      return;
    }

    if (isRetreatPhase) {
      if (!selectedUnit) {
        const dis = dislodgedByProv[provId];
        if (dis && canControl(dis)) {
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
      if (dis && canControl(dis)) {
        onSelectUnit(dis.id);
        setInteractionMode('MOVE');
      } else {
        clearSelection();
      }
      return;
    }

    if (!selectedUnit) {
      const occupant = unitsByProv[provId];
      if (occupant && canControl(occupant)) {
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
        if (occupant && canControl(occupant)) {
          selectUnitInMoveMode(occupant.id);
        } else {
          clearSelection();
        }
        return;
      }

      dispatchWithCoastChoice(selectedUnit, provId, explicitCoast);
      return;
    }

    if (
      interactionMode === 'SUPPORT_PICK_UNIT' ||
      interactionMode === 'CONVOY_PICK_ARMY'
    ) {
      const nextMode = resolveSupportOrConvoyAuxPick({
        interactionMode,
        provId,
        selectedUnit,
        unitsByProv,
        provinces,
        selectedUnitOptions,
      });
      if (nextMode) {
        setPendingAuxOrigin(provId);
        setInteractionMode(nextMode);
      } else {
        clearSelection();
      }
      return;
    }

    if (
      (interactionMode === 'SUPPORT_PICK_TARGET' ||
        interactionMode === 'CONVOY_PICK_TARGET') &&
      pendingAuxOrigin
    ) {
      const nextOrder = resolveSupportOrConvoyTargetOrder({
        interactionMode,
        provId,
        pendingAuxOrigin,
        selectedUnit,
        provinces,
        selectedUnitOptions,
      });
      if (nextOrder) {
        onUpdateOrder(nextOrder);
      }
      clearSelection();
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
