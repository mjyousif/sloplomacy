import type React from 'react';
import { useImperativeHandle, useRef } from 'react';
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
    selectedUnitId,
    hoveredUnitId,
    highlightedProvinces,
    issues,
    simulationResult,
    showSimulationOverlay,
    phase = 'Movement',
    season = 'Spring',
    builds = null,
    retreats = null,
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

  const menuPlacement = useUnitMenuPlacement({
    compact,
    containerRef,
    cameraRef,
    scheduleCameraSync,
    selectedUnitId,
    selectedUnit,
    selectedBuildProv,
    reachableList,
    pendingCoastChoice,
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

  const unitLayerContext: UnitLayerContext = {
    orders,
    provinces,
    ownership,
    unitsByProv,
    controlPower,
    canEditAnyPower,
    activePower,
    selectedUnit,
    hoveredUnitId,
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
    handleSelectUnitOnMap,
    onHoverUnit,
  };

  return {
    provinces,
    units,
    orders,
    ownership,
    activePower,
    sandboxMode,
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
    reachableMap,
    issuesByProvince,
    controllableBuildHomes,
    touchHitRadius,
    interaction,
    interactionMode,
    pendingCoastChoice,
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
