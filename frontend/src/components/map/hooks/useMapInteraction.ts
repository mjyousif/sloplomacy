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
  const { selectedUnit, controlPower, canEditAnyPower, reachableMap } =
    selection;
  const { isPanningRef, dragMovedRef } = gestures;

  const [hoveredProv, setHoveredProv] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] =
    useState<MapInteractionMode>('MOVE');
  // True once the player presses Move on this selection, which replaces a saved Hold's highlight
  const [moveModeChosen, setMoveModeChosen] = useState<boolean>(false);
  const [pendingAuxOrigin, setPendingAuxOrigin] = useState<string | null>(null);
  const [pendingCoastChoice, setPendingCoastChoice] =
    useState<PendingCoastChoice | null>(null);

  // Reset the chosen mode whenever a different unit is selected: during render, not in an
  // effect, so the new unit's menu shows its own saved order on its first paint.
  const [menuUnitId, setMenuUnitId] = useState(selectedUnitId);
  if (menuUnitId !== selectedUnitId) {
    setMenuUnitId(selectedUnitId);
    setMoveModeChosen(false);
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

    // 1. If we are in SUPPORT_PICK_UNIT mode, clicking another unit selects it as the unit to support
    if (
      selectedUnit &&
      interactionMode === 'SUPPORT_PICK_UNIT' &&
      u.id !== selectedUnit.id
    ) {
      setPendingAuxOrigin(u.province);
      setInteractionMode('SUPPORT_PICK_TARGET');
      return;
    }

    // 2. If we are in SUPPORT_PICK_TARGET mode and click the supported unit again -> Support HOLD & deselect!
    if (
      selectedUnit &&
      interactionMode === 'SUPPORT_PICK_TARGET' &&
      pendingAuxOrigin === u.province
    ) {
      onUpdateOrder(supportOrder(selectedUnit, u.province, u.province));
      clearSelection();
      return;
    }

    // 3. If we are in SUPPORT_PICK_TARGET mode and click an adjacent unit's province as the target of support
    if (
      selectedUnit &&
      interactionMode === 'SUPPORT_PICK_TARGET' &&
      pendingAuxOrigin &&
      pendingAuxOrigin !== u.province
    ) {
      onUpdateOrder(supportOrder(selectedUnit, pendingAuxOrigin, u.province));
      clearSelection();
      return;
    }

    // 4. If we are in CONVOY_PICK_ARMY mode, only a coastal Army can board a convoy
    if (selectedUnit && interactionMode === 'CONVOY_PICK_ARMY') {
      if (u.unit_type === 'A' && provinces[u.province]?.type === 'COAST') {
        setPendingAuxOrigin(u.province);
        setInteractionMode('CONVOY_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    // 4b. If we are in CONVOY_PICK_TARGET mode, clicking a unit delegates to its province
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

    // 6. Check if the clicked unit is controllable (belongs to activePower, OR foreign units can be edited)
    const canControlClickedUnit = u.power === controlPower || canEditAnyPower;
    if (!canControlClickedUnit) {
      if (
        selectedUnit &&
        reachableMap[u.province] &&
        interactionMode === 'MOVE'
      ) {
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
    const viaConvoy = unit.unit_type === 'A' && !isDirect;
    onUpdateOrder(moveOrder(unit, targetProv, targetCoast, viaConvoy));
    clearSelection();
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
        const coasts = reachableMap[provId] || [];
        if (
          selectedUnit.unit_type === 'F' &&
          explicitCoast &&
          coasts.includes(explicitCoast)
        ) {
          commitMoveOrRetreatOrder(selectedUnit, provId, explicitCoast);
          return;
        }
        if (selectedUnit.unit_type === 'F' && coasts.length > 1) {
          setPendingCoastChoice({ target: provId, coasts });
          return;
        }
        const singleCoast =
          selectedUnit.unit_type === 'F' && coasts.length === 1
            ? coasts[0]
            : null;
        commitMoveOrRetreatOrder(selectedUnit, provId, singleCoast);
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
      const hasFleetInSea = units.some(
        (u) => u.unit_type === 'F' && provinces[u.province]?.type === 'SEA',
      );
      const canConvoyMove =
        selectedUnit.unit_type === 'A' &&
        provinces[selectedUnit.province]?.type === 'COAST' &&
        provinces[provId]?.type === 'COAST' &&
        hasFleetInSea;

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

      const coasts = reachableMap[provId] || [];
      if (
        selectedUnit.unit_type === 'F' &&
        explicitCoast &&
        coasts.includes(explicitCoast)
      ) {
        commitMoveOrRetreatOrder(selectedUnit, provId, explicitCoast);
        return;
      }
      if (selectedUnit.unit_type === 'F' && coasts.length > 1) {
        setPendingCoastChoice({ target: provId, coasts });
        return;
      }
      const singleCoast =
        selectedUnit.unit_type === 'F' && coasts.length === 1
          ? coasts[0]
          : null;
      commitMoveOrRetreatOrder(selectedUnit, provId, singleCoast);
      return;
    }

    if (interactionMode === 'SUPPORT_PICK_UNIT') {
      const occ = unitsByProv[provId];
      if (occ && occ.id !== selectedUnit.id) {
        setPendingAuxOrigin(provId);
        setInteractionMode('SUPPORT_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    if (interactionMode === 'SUPPORT_PICK_TARGET' && pendingAuxOrigin) {
      onUpdateOrder(supportOrder(selectedUnit, pendingAuxOrigin, provId));
      clearSelection();
      return;
    }

    if (interactionMode === 'CONVOY_PICK_ARMY') {
      const occ = unitsByProv[provId];
      if (occ && occ.unit_type === 'A' && provinces[provId]?.type === 'COAST') {
        setPendingAuxOrigin(provId);
        setInteractionMode('CONVOY_PICK_TARGET');
      } else {
        clearSelection();
      }
      return;
    }

    if (interactionMode === 'CONVOY_PICK_TARGET' && pendingAuxOrigin) {
      if (provinces[provId]?.type === 'COAST' && provId !== pendingAuxOrigin) {
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
