import type React from 'react';
import { forwardRef } from 'react';
import {
  EUROPE_PROVINCE_GEOMETRY,
  MAP_VIEWBOX,
} from '../data/europeMapGeometry';
import type {
  Order,
  Power,
  ProvinceInfo,
  SimulationResult,
  Unit,
  UnitMoveOptions,
  UnitType,
  ValidationIssue,
} from '../types/diplomacy';
import type { StagedChangeEntry } from '../utils/adminHelpers';
import type { PieceStyle, UnitMark } from '../utils/displayPrefs';
import styles from './EuropeMap.module.css';
import { useEuropeMap } from './map/hooks/useEuropeMap';
import { BuildMenu } from './map/hud/BuildMenu';
import { CoastPicker } from './map/hud/CoastPicker';
import { MapZoomControls } from './map/hud/MapZoomControls';
import { SimulationBanner } from './map/hud/SimulationBanner';
import { UnitMenu } from './map/hud/UnitMenu';
import { AdminOwnershipChangesLayer } from './map/layers/AdminOwnershipChangesLayer';
import { ArrowMarkerDefs } from './map/layers/ArrowMarkerDefs';
import { BuildTokensLayer } from './map/layers/BuildTokensLayer';
import { MapNamesLayer } from './map/layers/MapNamesLayer';
import { OrderArrowsLayer } from './map/layers/OrderArrowsLayer';
import { ProvincesLayer } from './map/layers/ProvincesLayer';
import {
  StaticBackgroundLayer,
  StaticDefsLayer,
  StaticForegroundLayer,
} from './map/layers/StaticLayers';
import { SupplyCentersLayer } from './map/layers/SupplyCentersLayer';
import { UnitsLayer } from './map/layers/UnitsLayer';

export interface EuropeMapHandle {
  stepZoom: (delta: number) => void;
  resetCamera: () => void;
  getZoom: () => number;
}

export interface DirectEditMapHandlers {
  inspectedProvince: string | null;
  setInspectedProvince: (prov: string | null) => void;
  relocatingUnitId: string | null;
  setRelocatingUnitId: (unitId: string | null) => void;
  stagedChanges?: StagedChangeEntry[];
  diffLines?: string[];
  committing?: boolean;
  discardChanges?: () => void;
  /** Asks for confirmation, then discards every staged (unapplied) board edit. */
  clearStagedChanges?: () => void | Promise<void>;
  onUndoStagedChange?: (changeId: string) => void;
  applyChanges?: () => void | Promise<boolean>;
  handleToggleDirectEdit?: () => void | Promise<void>;
  onStageRelocateUnit: (
    unitId: string,
    targetProv: string,
    targetCoast?: string | null,
  ) => boolean;
  onStageSpawnOrUpdateUnit: (
    province: string,
    power: Power,
    unitType: UnitType,
    coast?: string | null,
  ) => boolean;
  onStageDestroyUnit: (unitId: string) => void;
  onStageOwnership: (province: string, power: Power | null) => void;
  onStageUnitOrder: (order: Order) => void;
}

export interface EuropeMapProps {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  activePower: Power;
  sandboxMode: boolean;
  directEditActive?: boolean;
  directEdit?: DirectEditMapHandlers;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  highlightedProvinces: string[];
  issues: ValidationIssue[];
  simulationResult: SimulationResult | null;
  showSimulationOverlay: boolean;
  phase?: string;
  season?: string;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  unitOptions?: Record<string, UnitMoveOptions> | null;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onUpdateOrder: (order: Order) => void;
  onClearSimulationOverlay: () => void;
  onAdjudicateTurn: () => void;
  onZoomChange?: (zoomPercent: number) => void;
  /** This player's own display choice. It changes nothing for anyone else. */
  pieceStyle: PieceStyle;
  unitMark: UnitMark;
  overlay?: React.ReactNode;
  /**
   * The phone layout. It raises the zoom ceiling, starts the camera filling the screen's height
   * around the player's own units, and puts zoom buttons on the map.
   */
  compact?: boolean;
  /**
   * Phone only: told when the docked unit bar appears or goes, so App can lower the order sheet
   * out of its way. The bar sits at the bottom of the map, just above the sheet's peek.
   */
  onDockedBarChange?: (visible: boolean) => void;
  /**
   * A past turn from the turn selector. Every power's orders are drawn with how they resolved,
   * nothing can be selected or edited, and the hypothetical banner stays hidden.
   */
  historyView?: boolean;
  /** History only: draw just this power's orders. Null draws everyone's. */
  historyPower?: Power | null;
}

export const EuropeMap = forwardRef<EuropeMapHandle, EuropeMapProps>(
  function EuropeMap(props, ref) {
    const {
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
    } = useEuropeMap(props, ref);

    return (
      <div
        ref={containerRef}
        className={styles.mapViewportContainer}
        data-testid="map-viewport-container"
        data-map-viewport=""
      >
        {/* Live Hypothetical / Simulation Active Banner */}
        {(showSimulationOverlay || sandboxMode) &&
          simulationResult &&
          !historyView && (
            <SimulationBanner
              compact={compact}
              sandboxMode={sandboxMode}
              showSimulationOverlay={showSimulationOverlay}
              onAdjudicateTurn={onAdjudicateTurn}
              onClearSimulationOverlay={onClearSimulationOverlay}
            />
          )}

        {overlay}

        {/* Coast Disambiguation Popup */}
        {!directEditActive && selectedUnit && pendingCoastChoice && (
          <CoastPicker
            compact={compact}
            dockRef={dockRef}
            provinces={provinces}
            choice={pendingCoastChoice}
            onPick={(c) =>
              commitMoveOrRetreatOrder(
                selectedUnit,
                pendingCoastChoice.target,
                c,
              )
            }
            onCancel={interaction.cancelCoastChoice}
          />
        )}

        {/* Direct-Edit Coast Disambiguation Popup */}
        {directEditActive && directEdit && directEditCoastChoice && (
          <CoastPicker
            compact={compact}
            dockRef={dockRef}
            provinces={provinces}
            choice={{
              target: directEditCoastChoice.target,
              coasts: directEditCoastChoice.coasts,
            }}
            onPick={(c) => {
              directEdit.onStageRelocateUnit(
                directEditCoastChoice.unitId,
                directEditCoastChoice.target,
                c,
              );
              onSelectUnit(directEditCoastChoice.unitId);
              setDirectEditCoastChoice(null);
            }}
            onCancel={() => setDirectEditCoastChoice(null)}
          />
        )}

        {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR BUILD SLOTS IN WINTER ADJUSTMENTS) */}
        {!directEditActive &&
          showBuildMenu &&
          selectedBuildProv &&
          selectedUnitId && (
            <BuildMenu
              compact={compact}
              placement={menuPlacement}
              provinces={provinces}
              slotId={selectedUnitId}
              home={selectedBuildProv}
              order={selectedBuildOrder}
              power={controllableBuildHomes[selectedBuildProv] || activePower}
              onUpdateOrder={onUpdateOrder}
              onClose={clearSelection}
            />
          )}

        {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR UNITS) */}
        {!directEditActive && showUnitMenu && selectedUnit && (
          <UnitMenu
            compact={compact}
            placement={menuPlacement}
            provinces={provinces}
            unit={selectedUnit}
            order={orders[selectedUnit.id]}
            isRetreatPhase={isRetreatPhase}
            isAdjustmentPhase={isAdjustmentPhase}
            interaction={interaction}
            onUpdateOrder={onUpdateOrder}
          />
        )}

        {/* Main Interactive SVG Map */}
        <svg
          ref={svgRef}
          viewBox={MAP_VIEWBOX}
          className={styles.europeSvgCanvas}
          data-map-relocating={relocatingUnit ? 'true' : undefined}
          {...gestures.pointerHandlers}
        >
          <defs>
            <StaticDefsLayer />

            <ArrowMarkerDefs />
          </defs>

          <g
            ref={cameraGroupRef}
            className={styles.cameraSceneGroup}
            transform={`translate(${cameraRef.current.x}, ${cameraRef.current.y}) scale(${cameraRef.current.zoom})`}
            style={{ transformOrigin: '762px 678px' }}
          >
            {/* 1. AUTHENTIC OCEAN & EUROPEAN CONTINENT SILHOUETTE BACKDROP */}
            <StaticBackgroundLayer />

            {/* 2. INTERACTIVE PROVINCE POLYGONS (Sea, Land, Coastal & Split Coasts) */}
            <ProvincesLayer
              provinces={provinces}
              ownership={displayOwnership}
              layout={layout}
              isAdjustmentPhase={isAdjustmentPhase}
              directEditActive={directEditActive}
              relocatingUnit={relocatingUnit}
              buildHomes={controllableBuildHomes}
              selectedUnit={selectedUnit}
              selectedUnitOptions={selectedUnitOptions}
              selectedBuildProv={selectedBuildProv}
              reachableMap={reachableMap}
              interactionMode={interactionMode}
              units={units}
              pendingAuxOrigin={pendingAuxOrigin}
              hoveredProv={hoveredProv}
              highlightedProvinces={highlightedProvinces}
              issuesByProvince={issuesByProvince}
              onClickProvince={
                directEditActive && directEdit
                  ? handleDirectEditClickProvince
                  : interaction.onClickProvince
              }
              onHoverProvince={interaction.onHoverProvince}
            />

            {/* 3. AUTHENTIC FOREGROUND BORDERS, COASTLINES, ISLANDS, SWITZERLAND & COMPASS ROSE */}
            <StaticForegroundLayer />

            {/* 3B. ADMIN DIRECT-EDIT SELECTED PROVINCE OUTLINE (preserves owner fill inside) */}
            {directEditActive &&
              inspectedProvince &&
              EUROPE_PROVINCE_GEOMETRY[inspectedProvince] && (
                <g
                  className="admin-inspected-province-outline"
                  data-testid="admin-inspected-province-outline"
                  data-province-id={inspectedProvince}
                  pointerEvents="none"
                >
                  <path
                    d={EUROPE_PROVINCE_GEOMETRY[inspectedProvince].path}
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth={7}
                    strokeOpacity={0.65}
                    strokeLinejoin="round"
                  />
                  <path
                    d={EUROPE_PROVINCE_GEOMETRY[inspectedProvince].path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={3.5}
                    strokeLinejoin="round"
                  />
                </g>
              )}

            {/* 4. AUTHENTIC HAND-TYPESET PROVINCE & SEA ZONE NAMES */}
            <MapNamesLayer
              pieceStyle={pieceStyle}
              provinces={provinces}
              ownership={displayOwnership}
              occupied={occupiedProvinces}
            />

            {/* 5. SUPPLY CENTER STAR EMBLEMS (34 Supply Centers) */}
            <SupplyCentersLayer
              provinces={provinces}
              ownership={displayOwnership}
              pieceStyle={pieceStyle}
              occupied={occupiedProvinces}
            />

            {/* 6. TACTICAL ORDER VECTORS LAYER */}
            <OrderArrowsLayer units={units} ctx={orderLayerContext} />

            {/* 6D. WINTER ADJUSTMENTS BUILD TOKENS LAYER */}
            {(isAdjustmentPhase || (historyView && phase === 'Admin')) &&
              !directEditActive && (
                <BuildTokensLayer
                  buildHomes={controllableBuildHomes}
                  orders={orders}
                  provinces={provinces}
                  selectedUnitId={selectedUnitId}
                  hoveredUnitId={hoveredUnitId}
                  pieceStyle={pieceStyle}
                  unitMark={unitMark}
                  getProvincePoint={getProvincePoint}
                  describePiece={describePiece}
                  touchHitRadius={touchHitRadius}
                  dragMovedRef={dragMovedRef}
                  onSelectUnit={onSelectUnit}
                  onHoverUnit={onHoverUnit}
                />
              )}

            {/* 7. UNITS LAYER (Armies & Fleets + Hold Halos + Warning Badges + Dislodged/Disband Tags) */}
            <UnitsLayer units={units} ctx={unitLayerContext} />

            {/* 7B. ADMIN OWNERSHIP OVERRIDE BADGES (Turn History "Admin" Phase) */}
            {historyView &&
              phase === 'Admin' &&
              simulationResult?.new_ownership &&
              !directEditActive && (
                <AdminOwnershipChangesLayer
                  beforeOwnership={ownership}
                  afterOwnership={simulationResult.new_ownership}
                  provinces={provinces}
                  historyPower={historyPower ?? null}
                  occupiedProvinces={
                    new Set([
                      ...Object.keys(unitsByProv),
                      ...Object.keys(controllableBuildHomes),
                    ])
                  }
                  getProvincePoint={getProvincePoint}
                  describePiece={describePiece}
                />
              )}
          </g>
        </svg>

        {/* Phones have no wheel and the tools rail is out of reach, so zoom lives on the map. */}
        {compact && (
          <MapZoomControls
            onZoomIn={() => zoomAboutCentre(cameraRef.current.zoom * 1.5)}
            onZoomOut={() => zoomAboutCentre(cameraRef.current.zoom / 1.5)}
            onReset={resetCamera}
          />
        )}
      </div>
    );
  },
);
