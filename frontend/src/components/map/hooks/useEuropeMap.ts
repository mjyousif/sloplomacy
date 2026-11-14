import type React from 'react';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Unit } from '../../../types/diplomacy';
import { canPlaceUnitTypeInProvince } from '../../../utils/adminHelpers';
import type { EuropeMapHandle, EuropeMapProps } from '../../EuropeMap';
import type { OrderLayerContext } from '../layers/orders/orderLayerContext';
import type { UnitLayerContext } from '../layers/units/unitLayerContext';
import { useBuildHomes } from './useBuildHomes';
import { useKeepSelectionInView, useMapCamera } from './useMapCamera';
import { useMapGestures } from './useMapGestures';
import { useMapInteraction } from './useMapInteraction';
import { useMapSelection } from './useMapSelection';
import { useOrderOverlay } from './useOrderOverlay';
import { usePieceGeometry } from './usePieceGeometry';
import { useTouchHitRadius } from './useTouchHitRadius';
import { useUnitMenuPlacement } from './useUnitMenuPlacement';

/**
 * The map's view model: every hook EuropeMap uses, wired together in one place, with the
 * props' defaults applied. EuropeMap only lays out what this returns.
 */
export function useEuropeMap(
  {
    provinces,
    units,
    orders,
    ownership,
    activePower,
    sandboxMode,
    directEditActive = false,
    directEdit,
    selectedUnitId,
    suppressUnitMenu = false,
    hoveredUnitId,
    highlightedProvinces,
    issues,
    simulationResult,
    showSimulationOverlay,
    phase = 'Movement',
    season = 'Spring',
    builds = null,
    retreats = null,
    unitOptions = null,
    onSelectUnit,
    onHoverUnit,
    onUpdateOrder,
    onClearSimulationOverlay,
    onAdjudicateTurn,
    overlay,
    onZoomChange,
    pieceStyle,
    unitMark,
    compact = false,
    onDockedBarChange,
    historyView = false,
    historyPower = null,
  }: EuropeMapProps,
  ref: React.ForwardedRef<EuropeMapHandle>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cameraGroupRef = useRef<SVGGElement | null>(null);

  const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
  const isRetreatPhase = phase === 'Retreats';

  const {
    unitsByProv,
    dislodgedByProv,
    unitsById,
    layout,
    arrowScale,
    pieceRingScale,
    getProvincePoint,
    describePiece,
    getUnitPoint,
    ownUnitsCentre,
    occupiedProvinces,
  } = usePieceGeometry({ units, provinces, pieceStyle, activePower });

  const camera = useMapCamera({
    svgRef,
    cameraGroupRef,
    compact,
    activePower,
    ownUnitsCentre,
    onZoomChange,
    // The floating menu sits in screen space, so it follows every camera write. The camera
    // only calls this after render, by which time the menu's placement exists.
    onCameraSync: () => menuPlacement.syncFloatingMenu(),
  });
  const {
    cameraRef,
    touchPxPerUnit,
    scheduleCameraSync,
    zoomAboutCentre,
    stepZoom,
    resetCamera,
  } = camera;
  const gestures = useMapGestures(svgRef, camera);
  const { dragMovedRef } = gestures;

  const selection = useMapSelection({
    selectedUnitId,
    orders,
    unitsById,
    provinces,
    retreats,
    unitOptions,
    activePower,
    sandboxMode,
    directEditActive,
    historyView,
    isAdjustmentPhase,
    isRetreatPhase,
  });
  const {
    selectedBuildOrder,
    selectedBuildProv,
    selectedUnit,
    selectedUnitOptions,
    canEditAnyPower,
    controlPower,
    reachableList,
    reachableMap,
  } = selection;

  const orderOverlay = useOrderOverlay({
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
  });
  const {
    issuesByUnit,
    issuesByProvince,
    isUnitOrderVisible,
    supportCountByUnitId,
  } = orderOverlay;

  const controllableBuildHomes = useBuildHomes({
    orders,
    builds,
    activePower,
    canEditAnyPower,
    historyView,
    historyPower,
    isAdjustmentPhase,
    phase,
  });

  const touchHitRadius = useTouchHitRadius({
    compact,
    units,
    controllableBuildHomes,
    getUnitPoint,
    getProvincePoint,
    touchPxPerUnit,
  });

  const interaction = useMapInteraction({
    provinces,
    units,
    builds,
    selectedUnitId,
    selectedOrder: selectedUnitId ? orders[selectedUnitId] : undefined,
    onSelectUnit,
    onUpdateOrder,
    isAdjustmentPhase,
    isRetreatPhase,
    unitsByProv,
    dislodgedByProv,
    controllableBuildHomes,
    selection,
    gestures,
  });
  const {
    interactionMode,
    pendingAuxOrigin,
    pendingCoastChoice,
    hoveredProv,
    clearSelection,
    handleSelectUnitOnMap,
    commitMoveOrRetreatOrder,
  } = interaction;

  useImperativeHandle(
    ref,
    () => ({
      stepZoom,
      resetCamera,
      getZoom: () => cameraRef.current.zoom,
    }),
    [stepZoom, resetCamera],
  );

  const [directEditCoastChoice, setDirectEditCoastChoice] = useState<{
    unitId: string;
    target: string;
    coasts: string[];
  } | null>(null);

  useEffect(() => {
    if (!directEditActive) {
      setDirectEditCoastChoice(null);
    }
  }, [directEditActive]);

  const inspectedProvince =
    directEditActive && directEdit ? directEdit.inspectedProvince : null;
  const inspectedUnit = inspectedProvince
    ? (unitsByProv[inspectedProvince] ?? null)
    : null;
  const relocatingUnit =
    directEditActive && directEdit?.relocatingUnitId
      ? (unitsById[directEdit.relocatingUnitId] ?? null)
      : null;

  const handleDirectEditSelectUnit = (unit: Unit, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (dragMovedRef.current || !directEdit) return;
    setDirectEditCoastChoice(null);
    // While moving a piece, every other piece's square is occupied and so not a legal target.
    // Clicking the moving piece itself just cancels the move.
    if (relocatingUnit) {
      if (unit.id === relocatingUnit.id) directEdit.setRelocatingUnitId(null);
      return;
    }
    if (directEdit.inspectedProvince === unit.province) {
      directEdit.setInspectedProvince(null);
      directEdit.setRelocatingUnitId(null);
      onSelectUnit(null);
    } else {
      directEdit.setInspectedProvince(unit.province);
      directEdit.setRelocatingUnitId(null);
      onSelectUnit(unit.id);
    }
  };

  const handleDirectEditClickProvince = (
    provId: string,
    explicitCoast?: string | null,
  ) => {
    if (dragMovedRef.current || !directEdit) return;
    setDirectEditCoastChoice(null);
    const relocId = directEdit.relocatingUnitId;
    const relocUnit = relocId ? unitsById[relocId] : null;
    const occupant = unitsByProv[provId] ?? null;

    if (relocUnit) {
      // Moving a piece: only legal targets react, and incompatible or occupied squares ignore clicks.
      const provInfo = provinces[provId];
      if (
        provId === relocUnit.province ||
        occupant ||
        !provInfo ||
        !canPlaceUnitTypeInProvince(relocUnit.unit_type, provInfo.type)
      ) {
        return;
      }
      if (
        relocUnit.unit_type === 'F' &&
        provInfo &&
        provInfo.coasts?.length > 1 &&
        !explicitCoast
      ) {
        setDirectEditCoastChoice({
          unitId: relocUnit.id,
          target: provId,
          coasts: provInfo.coasts,
        });
        return;
      }
      directEdit.onStageRelocateUnit(relocUnit.id, provId, explicitCoast);
      onSelectUnit(relocUnit.id);
      return;
    }

    if (directEdit.inspectedProvince === provId) {
      directEdit.setInspectedProvince(null);
      directEdit.setRelocatingUnitId(null);
      onSelectUnit(null);
    } else {
      directEdit.setInspectedProvince(provId);
      directEdit.setRelocatingUnitId(null);
      onSelectUnit(occupant ? occupant.id : null);
    }
  };

  const menuPlacement = useUnitMenuPlacement({
    compact,
    containerRef,
    cameraRef,
    scheduleCameraSync,
    selectedUnitId,
    selectedUnit: directEditActive ? inspectedUnit : selectedUnit,
    selectedBuildProv,
    suppressUnitMenu,
    inspectedProvince,
    reachableList,
    pendingCoastChoice: directEditActive
      ? directEditCoastChoice
      : pendingCoastChoice,
    getUnitPoint,
    getProvincePoint,
    onDockedBarChange,
  });
  const { dockRef, showBuildMenu, showUnitMenu } = menuPlacement;

  useKeepSelectionInView(camera, {
    svgRef,
    containerRef,
    compact,
    anchor: selectedUnit
      ? getUnitPoint(selectedUnit)
      : selectedBuildProv
        ? getProvincePoint(selectedBuildProv)
        : null,
    selectedUnitId,
    selectedBuildProv,
  });

  const orderLayerContext: OrderLayerContext = {
    orders,
    provinces,
    isUnitOrderVisible,
    issuesByUnit,
    supportCountByUnitId,
    moveMidpointsByOrigin: orderOverlay.moveMidpointsByOrigin,
    getUnitPoint,
    getProvincePoint,
    describePiece,
    pieceStyle,
    unitMark,
    pieceRingScale,
    arrowScale,
    selectedUnitId,
    hoveredUnitId,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
  };

  const displayOwnership =
    historyView && phase === 'Admin' && simulationResult?.new_ownership
      ? simulationResult.new_ownership
      : ownership;

  const unitLayerContext: UnitLayerContext = {
    orders,
    provinces,
    ownership: displayOwnership,
    unitsByProv,
    controlPower,
    canEditAnyPower,
    activePower,
    selectedUnit,
    interactionMode,
    hoveredUnitId: relocatingUnit ? null : hoveredUnitId,
    isUnitOrderVisible,
    issuesByUnit,
    supportCountByUnitId,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
    pieceStyle,
    unitMark,
    getUnitPoint,
    describePiece,
    touchHitRadius,
    handleSelectUnitOnMap:
      directEditActive && directEdit
        ? handleDirectEditSelectUnit
        : handleSelectUnitOnMap,
    onHoverUnit: relocatingUnit ? () => {} : onHoverUnit,
  };

  return {
    provinces,
    units,
    orders,
    ownership,
    displayOwnership,
    activePower,
    sandboxMode,
    directEditActive,
    directEdit,
    phase,
    selectedUnitId,
    hoveredUnitId,
    highlightedProvinces,
    simulationResult,
    showSimulationOverlay,
    onSelectUnit,
    onHoverUnit,
    onUpdateOrder,
    onClearSimulationOverlay,
    onAdjudicateTurn,
    overlay,
    pieceStyle,
    unitMark,
    compact,
    historyView,
    historyPower,
    unitsByProv,
    containerRef,
    svgRef,
    cameraGroupRef,
    isAdjustmentPhase,
    isRetreatPhase,
    layout,
    getProvincePoint,
    describePiece,
    occupiedProvinces,
    cameraRef,
    zoomAboutCentre,
    resetCamera,
    gestures,
    dragMovedRef,
    selectedBuildOrder,
    selectedBuildProv,
    selectedUnit,
    selectedUnitOptions,
    reachableMap,
    issuesByProvince,
    controllableBuildHomes,
    touchHitRadius,
    interaction,
    interactionMode,
    pendingAuxOrigin,
    pendingCoastChoice,
    directEditCoastChoice,
    setDirectEditCoastChoice,
    inspectedProvince,
    inspectedUnit,
    relocatingUnit,
    handleDirectEditClickProvince,
    hoveredProv,
    clearSelection,
    commitMoveOrRetreatOrder,
    menuPlacement,
    dockRef,
    showBuildMenu,
    showUnitMenu,
    orderLayerContext,
    unitLayerContext,
  };
}
