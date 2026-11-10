import type React from 'react';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  ALL_PROVINCE_GEOMETRIES,
  EUROPE_PROVINCE_GEOMETRY,
  MAP_VIEWBOX,
  type Point,
} from '../data/europeMapGeometry';
import { getMapLayout, SEA_SHORT_NAMES } from '../data/mapLayouts';
import {
  type IssueSeverity,
  type Order,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type SimulationResult,
  type Unit,
  type ValidationIssue,
} from '../types/diplomacy';
import type { PieceStyle, UnitMark } from '../utils/displayPrefs';
import { adjustmentOrdersFor } from '../utils/historyHelpers';
import {
  compactHitRadius,
  halfNearestDistances,
} from '../utils/mapCameraHelpers';
import { canUnitSupportInto } from '../utils/orderHelpers';
import {
  getPieceArrowScale,
  getPieceFrame,
  MapPiece,
  makePiecePill,
  type PieceFrame,
  PieceHitArea,
  PieceHoldOutline,
  PieceOutline,
} from './MapPiece';
import { useKeepSelectionInView, useMapCamera } from './map/hooks/useMapCamera';
import { useMapGestures } from './map/hooks/useMapGestures';
import { useMapInteraction } from './map/hooks/useMapInteraction';
import { useMapSelection } from './map/hooks/useMapSelection';
import { useUnitMenuPlacement } from './map/hooks/useUnitMenuPlacement';
import { BuildMenu } from './map/hud/BuildMenu';
import { CoastPicker } from './map/hud/CoastPicker';
import { MapZoomControls } from './map/hud/MapZoomControls';
import { SimulationBanner } from './map/hud/SimulationBanner';
import { UnitMenu } from './map/hud/UnitMenu';
import { MapNamesLayer } from './map/layers/MapNamesLayer';
import { ProvincePolygon } from './map/layers/ProvincePolygon';
import {
  StaticBackgroundLayer,
  StaticDefsLayer,
  StaticForegroundLayer,
} from './map/layers/StaticLayers';
import { SupplyCentersLayer } from './map/layers/SupplyCentersLayer';
import { computeQuadraticCurve } from './map/utils/curveGeometry';

export interface EuropeMapHandle {
  stepZoom: (delta: number) => void;
  resetCamera: () => void;
  getZoom: () => number;
}

export interface EuropeMapProps {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  activePower: Power;
  sandboxMode: boolean;
  directEditActive?: boolean;
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
  function EuropeMap(
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
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const cameraGroupRef = useRef<SVGGElement | null>(null);

    const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
    const isRetreatPhase = phase === 'Retreats';

    const { unitsByProv, dislodgedByProv, unitsById } = useMemo(() => {
      const byProv: Record<string, Unit> = {};
      const dislodged: Record<string, Unit> = {};
      const byId: Record<string, Unit> = {};
      for (const u of units) {
        if (u.is_dislodged) {
          dislodged[u.province] = u;
        } else {
          byProv[u.province] = u;
        }
        byId[u.id] = u;
      }
      return {
        unitsByProv: byProv,
        dislodgedByProv: dislodged,
        unitsById: byId,
      };
    }, [units]);

    const layout = getMapLayout(pieceStyle);
    const arrowScale = getPieceArrowScale(pieceStyle);
    const pieceRingScale = getPieceFrame(pieceStyle).ringScale;

    const getProvincePoint = useCallback(
      (provCode: string, coast?: string | null): Point => {
        const geom = EUROPE_PROVINCE_GEOMETRY[provCode];
        if (!geom) return { x: 760, y: 680 };
        if (coast && geom.coastPositions && geom.coastPositions[coast]) {
          return geom.coastPositions[coast];
        }
        return layout[provCode]?.unit ?? geom.unitPos;
      },
      [layout],
    );

    /** How a piece standing in this province is drawn in the active style. */
    const describePiece = useCallback(
      (
        province: string,
        coast: string | null | undefined,
        showStar: boolean,
      ) => {
        const entry = layout[province];
        const flagDirection = entry?.flagDirection ?? 1;
        if (pieceStyle !== 'nameplate') {
          return {
            flagDirection,
            frame: getPieceFrame(pieceStyle, flagDirection),
          };
        }
        const baseName =
          SEA_SHORT_NAMES[province] ?? provinces[province]?.name ?? province;
        const pill = makePiecePill(
          coast ? `${baseName} ${coast}` : baseName,
          entry?.name?.size ?? 12.5,
          coast ? 0 : (entry?.name?.angle ?? 0),
          showStar,
        );
        return {
          flagDirection,
          frame: getPieceFrame(pieceStyle, flagDirection, pill),
        };
      },
      [layout, pieceStyle, provinces],
    );

    const getUnitPoint = useCallback(
      (unit: Unit): Point => {
        const basePt = getProvincePoint(unit.province, unit.coast);
        if (unit.is_dislodged && unitsByProv[unit.province]) {
          const { dislodgeOffset } = describePiece(
            unit.province,
            unit.coast,
            false,
          ).frame;
          return {
            x: basePt.x + dislodgeOffset.x,
            y: basePt.y + dislodgeOffset.y,
          };
        }
        return basePt;
      },
      [unitsByProv, getProvincePoint, describePiece],
    );

    // Where a phone's camera starts: the middle of the player's own units, if they have any.
    const ownUnitsCentre = useMemo((): Point | null => {
      const own = units.filter(
        (u) => u.power === activePower && !u.is_dislodged,
      );
      if (own.length === 0) return null;
      const pts = own.map((u) => getUnitPoint(u));
      return {
        x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
        y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
      };
    }, [units, activePower, getUnitPoint]);

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

    const getStarOwnerColor = (province: string): string | undefined => {
      const owner = ownership[province] || provinces[province]?.home_power;
      return owner ? POWER_METADATA[owner].color : undefined;
    };

    // Provinces whose star or name a unit is standing on, as a string so the static layers can skip re-rendering
    const occupiedProvinces = Object.keys({
      ...unitsByProv,
      ...dislodgedByProv,
    })
      .sort()
      .join(',');

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
        for (const pid of iss.provinces) {
          if (!byProvince[pid]) byProvince[pid] = [];
          byProvince[pid].push(iss);
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

    // Build homes map for Adjustments phase
    const controllableBuildHomes = useMemo(() => {
      const homes: Record<string, Power> = {};
      // A past winter shows the builds that were ordered, by every power (or the chosen one).
      if (historyView) {
        if (isAdjustmentPhase) {
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
      builds,
      activePower,
      canEditAnyPower,
    ]);

    // Phone: how far each piece's tap target may grow before it would reach a neighbour's.
    const touchHitCaps = useMemo(() => {
      if (!compact) return null;
      const points: Record<string, Point> = {};
      for (const u of units) points[u.id] = getUnitPoint(u);
      for (const [homeProv, pwr] of Object.entries(controllableBuildHomes)) {
        points[`BUILD_${pwr}_${homeProv}`] = getProvincePoint(homeProv);
      }
      return halfNearestDistances(points);
    }, [
      compact,
      units,
      controllableBuildHomes,
      getUnitPoint,
      getProvincePoint,
    ]);

    /** The extra tap radius a piece gets on a phone, or 0 on a wide screen. */
    const touchHitRadius = (pieceId: string, frame: PieceFrame): number =>
      touchHitCaps
        ? compactHitRadius(
            frame.hitRadius,
            touchPxPerUnit,
            touchHitCaps[pieceId] ?? Infinity,
          )
        : 0;

    // Count how many valid supports each moving/holding unit receives among visible orders
    const supportCountByUnitId = useMemo(() => {
      const counts: Record<string, number> = {};
      if (!isRetreatPhase && !isAdjustmentPhase) {
        for (const u of units) {
          if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
          const o = orders[u.id];
          if (
            o &&
            o.order_type === 'SUPPORT' &&
            o.aux_unit_origin &&
            o.target
          ) {
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

    return (
      <div
        ref={containerRef}
        className="map-viewport-container"
        data-testid="map-viewport-container"
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
        {selectedUnit && pendingCoastChoice && (
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

        {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR BUILD SLOTS IN WINTER ADJUSTMENTS) */}
        {showBuildMenu && selectedBuildProv && selectedUnitId && (
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
        {showUnitMenu && selectedUnit && (
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
          className="europe-svg-canvas"
          {...gestures.pointerHandlers}
        >
          <defs>
            <StaticDefsLayer />

            <marker
              id="arrow-valid"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5.5"
              markerHeight="5.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 L 2.2 5 z" fill="#1e293b" />
            </marker>

            <marker
              id="arrow-warning"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#d97706" />
            </marker>

            <marker
              id="arrow-error"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#dc2626" />
            </marker>

            <marker
              id="arrow-sim-ok"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#059669" />
            </marker>

            <marker
              id="arrow-sim-bounce"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9.5 5 L 0 9 L 2.2 5 z" fill="#e11d48" />
            </marker>
          </defs>

          <g
            ref={cameraGroupRef}
            className="camera-scene-group"
            transform={`translate(${cameraRef.current.x}, ${cameraRef.current.y}) scale(${cameraRef.current.zoom})`}
            style={{ transformOrigin: '762px 678px' }}
          >
            {/* 1. AUTHENTIC OCEAN & EUROPEAN CONTINENT SILHOUETTE BACKDROP */}
            <StaticBackgroundLayer />

            {/* 2. INTERACTIVE PROVINCE POLYGONS (Sea, Land, Coastal & Split Coasts) */}
            <g className="interactive-provinces-layer">
              {ALL_PROVINCE_GEOMETRIES.map((geom) => {
                const pInfo = provinces[geom.id];
                if (!pInfo || geom.id === 'SWI') return null;

                const isSea = pInfo.type === 'SEA';
                const owner = ownership[geom.id] || pInfo.home_power || null;
                const isBuildableHome = Boolean(
                  isAdjustmentPhase && controllableBuildHomes[geom.id],
                );
                const isReachable =
                  Boolean(selectedUnit && reachableMap[geom.id]) ||
                  isBuildableHome;
                const allowedCoastsStr =
                  selectedUnit && reachableMap[geom.id]
                    ? (reachableMap[geom.id] || []).join(',')
                    : '';
                const showFleetCoasts = Boolean(
                  selectedUnit &&
                    selectedUnit.unit_type === 'F' &&
                    reachableMap[geom.id],
                );
                const showMoveReticle = Boolean(
                  selectedUnit &&
                    reachableMap[geom.id] &&
                    interactionMode === 'MOVE',
                );
                const isHovered = hoveredProv === geom.id;
                const isHighlighted =
                  highlightedProvinces.includes(geom.id) ||
                  selectedBuildProv === geom.id;
                const hasWarning = Boolean(issuesByProvince[geom.id]?.length);

                return (
                  <ProvincePolygon
                    key={geom.id}
                    geom={geom}
                    isSea={isSea}
                    owner={owner}
                    isReachable={isReachable}
                    allowedCoastsStr={allowedCoastsStr}
                    showFleetCoasts={showFleetCoasts}
                    showMoveReticle={showMoveReticle}
                    reticlePoint={layout[geom.id]?.unit ?? geom.unitPos}
                    isHovered={isHovered}
                    isHighlighted={isHighlighted}
                    hasWarning={hasWarning}
                    onClickProvince={interaction.onClickProvince}
                    onHoverProvince={interaction.onHoverProvince}
                  />
                );
              })}
            </g>

            {/* 3. AUTHENTIC FOREGROUND BORDERS, COASTLINES, ISLANDS, SWITZERLAND & COMPASS ROSE */}
            <StaticForegroundLayer />

            {/* 4. AUTHENTIC HAND-TYPESET PROVINCE & SEA ZONE NAMES */}
            <MapNamesLayer
              pieceStyle={pieceStyle}
              provinces={provinces}
              ownership={ownership}
              occupied={occupiedProvinces}
            />

            {/* 5. SUPPLY CENTER STAR EMBLEMS (34 Supply Centers) */}
            <SupplyCentersLayer
              provinces={provinces}
              ownership={ownership}
              pieceStyle={pieceStyle}
              occupied={occupiedProvinces}
            />

            {/* 6. TACTICAL ORDER VECTORS LAYER */}
            <g className="tactical-vectors-layer">
              {/* 6A. CONVOY CHAINS */}
              {units.map((u) => {
                if (!isUnitOrderVisible(u) || u.is_dislodged) return null;
                const o = orders[u.id];
                if (
                  !o ||
                  o.order_type !== 'CONVOY' ||
                  !o.aux_unit_origin ||
                  !o.target
                )
                  return null;
                const fleetPt = getUnitPoint(u);
                const armyPt = getProvincePoint(o.aux_unit_origin);
                const destPt = getProvincePoint(o.target);
                const hasIssue = Boolean(issuesByUnit[u.id]?.length);

                return (
                  <g
                    key={`convoy_${u.id}`}
                    pointerEvents="none"
                    data-testid="order-arrow"
                    data-order-unit={u.id}
                    data-order-type="CONVOY"
                    data-order-target={o.target || ''}
                  >
                    <path
                      d={`M ${armyPt.x},${armyPt.y} L ${fleetPt.x},${fleetPt.y} L ${destPt.x},${destPt.y}`}
                      fill="none"
                      stroke={hasIssue ? '#f59e0b' : '#0284c7'}
                      strokeWidth="4.2"
                      strokeDasharray="9 6"
                    />
                    <circle
                      cx={fleetPt.x}
                      cy={fleetPt.y}
                      r={26 * pieceRingScale}
                      fill="none"
                      stroke={hasIssue ? '#f59e0b' : '#0284c7'}
                      strokeWidth="2.5"
                      strokeDasharray="5 4"
                    />
                  </g>
                );
              })}

              {/* 6B. SUPPORT VECTORS */}
              {units.map((u) => {
                if (!isUnitOrderVisible(u) || u.is_dislodged) return null;
                const o = orders[u.id];
                if (
                  !o ||
                  o.order_type !== 'SUPPORT' ||
                  !o.aux_unit_origin ||
                  !o.target
                )
                  return null;

                const supporterPt = getUnitPoint(u);
                const isSupportHold = o.aux_unit_origin === o.target;
                const targetPoint =
                  !isSupportHold && moveMidpointsByOrigin[o.aux_unit_origin]
                    ? moveMidpointsByOrigin[o.aux_unit_origin]
                    : getProvincePoint(o.target);

                const unitIssues = issuesByUnit[u.id] || [];
                const hasError = unitIssues.some((i) => i.severity === 'error');
                const hasWarn = unitIssues.some(
                  (i) => i.severity === 'warning',
                );
                const simActive = showSimulationOverlay || sandboxMode;
                const simRes = simActive
                  ? simulationResult?.resolutions[u.id]
                  : null;

                const strokeColor = hasError
                  ? '#dc2626'
                  : simRes?.cut
                    ? '#e11d48'
                    : hasWarn
                      ? '#f59e0b'
                      : '#0d9488';

                return (
                  <g
                    key={`support_${u.id}`}
                    pointerEvents="none"
                    data-testid="order-arrow"
                    data-order-unit={u.id}
                    data-order-type="SUPPORT"
                    data-order-target={o.target || ''}
                  >
                    <line
                      x1={supporterPt.x}
                      y1={supporterPt.y}
                      x2={targetPoint.x}
                      y2={targetPoint.y}
                      stroke="#ffffff"
                      strokeWidth="6"
                      strokeOpacity="0.7"
                      strokeDasharray="8 5"
                    />
                    <line
                      x1={supporterPt.x}
                      y1={supporterPt.y}
                      x2={targetPoint.x}
                      y2={targetPoint.y}
                      stroke={strokeColor}
                      strokeWidth="3.6"
                      strokeDasharray="8 5"
                    />
                    <circle
                      cx={targetPoint.x}
                      cy={targetPoint.y}
                      r={isSupportHold ? 24 * pieceRingScale : 8}
                      fill={isSupportHold ? 'none' : strokeColor}
                      stroke={strokeColor}
                      strokeWidth="2.8"
                    />
                    {simActive && simRes?.cut && (
                      <g
                        transform={`translate(${(supporterPt.x + targetPoint.x) / 2}, ${
                          (supporterPt.y + targetPoint.y) / 2
                        })`}
                      >
                        <rect
                          x="-26"
                          y="-9"
                          width="52"
                          height="18"
                          rx="4"
                          fill="#be123c"
                          stroke="#fff"
                          strokeWidth="1.2"
                        />
                        <text
                          y="3.5"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="9.5"
                          fontWeight="800"
                        >
                          CUT
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* 6C. MOVE & RETREAT ARROWS + GHOST DESTINATION TOKENS */}
              {units.map((u) => {
                if (!isUnitOrderVisible(u)) return null;
                const o = orders[u.id];
                if (
                  !o ||
                  (o.order_type !== 'MOVE' && o.order_type !== 'RETREAT') ||
                  !o.target ||
                  !EUROPE_PROVINCE_GEOMETRY[o.target]
                )
                  return null;

                const p1 = getUnitPoint(u);
                const p2 = getProvincePoint(o.target, o.target_coast);
                const { path, mid } = computeQuadraticCurve(
                  p1,
                  p2,
                  0.14,
                  arrowScale,
                );

                const unitIssues = issuesByUnit[u.id] || [];
                const hasError = unitIssues.some((i) => i.severity === 'error');
                const hasWarn = unitIssues.some(
                  (i) => i.severity === 'warning',
                );
                const supCount = supportCountByUnitId[u.id] || 0;
                const isSelectedOrHovered =
                  u.id === selectedUnitId || u.id === hoveredUnitId;

                const simActive = showSimulationOverlay || sandboxMode;
                const simRes = simActive
                  ? simulationResult?.resolutions[u.id]
                  : null;

                let strokeColor =
                  o.order_type === 'RETREAT'
                    ? '#ea580c'
                    : POWER_METADATA[u.power].color;
                let markerId =
                  o.order_type === 'RETREAT'
                    ? 'url(#arrow-warning)'
                    : 'url(#arrow-valid)';
                let dashArray: string | undefined =
                  o.order_type === 'RETREAT'
                    ? '8 4'
                    : o.via_convoy
                      ? '10 5'
                      : undefined;

                if (hasError) {
                  strokeColor = '#dc2626';
                  markerId = 'url(#arrow-error)';
                  dashArray = '6 5';
                } else if (hasWarn) {
                  strokeColor = '#d97706';
                  markerId = 'url(#arrow-warning)';
                } else if (simActive && simRes) {
                  if (simRes.succeeded) {
                    strokeColor = '#059669';
                    markerId = 'url(#arrow-sim-ok)';
                  } else {
                    strokeColor = '#e11d48';
                    markerId = 'url(#arrow-sim-bounce)';
                    dashArray = '7 5';
                  }
                }

                const strokeWidth =
                  4.5 + supCount * 1.8 + (isSelectedOrHovered ? 1.2 : 0);
                const meta = POWER_METADATA[u.power];
                const ghostPiece = describePiece(
                  o.target,
                  o.target_coast,
                  false,
                );

                return (
                  <g
                    key={`move_${u.id}`}
                    pointerEvents="none"
                    data-testid="order-arrow"
                    data-order-unit={u.id}
                    data-order-type={o.order_type}
                    data-order-target={o.target || ''}
                  >
                    <path
                      d={path}
                      fill="none"
                      stroke="#fef3c7"
                      strokeWidth={strokeWidth + 3.5}
                      strokeOpacity="0.9"
                      strokeLinecap="round"
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray}
                      strokeLinecap="round"
                      markerEnd={markerId}
                    />

                    {supCount > 0 && (
                      <g transform={`translate(${mid.x}, ${mid.y})`}>
                        <rect
                          x="-16"
                          y="-11"
                          width="32"
                          height="22"
                          rx="11"
                          fill="#0f766e"
                          stroke="#fef3c7"
                          strokeWidth="1.8"
                        />
                        <text
                          y="5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="12"
                          fontWeight="800"
                        >
                          +{supCount}
                        </text>
                      </g>
                    )}

                    {simActive && simRes && simRes.bounced && (
                      <g transform={`translate(${mid.x}, ${mid.y - 16})`}>
                        <rect
                          x="-36"
                          y="-10"
                          width="72"
                          height="20"
                          rx="5"
                          fill="#be123c"
                          stroke="#fff"
                          strokeWidth="1.4"
                        />
                        <text
                          y="4"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="10"
                          fontWeight="800"
                        >
                          ✕ BOUNCED
                        </text>
                      </g>
                    )}

                    {/* GHOST PREVIEW UNIT TOKEN AT DESTINATION WHEN MOVE SUCCEEDS */}
                    {simActive && simRes && simRes.succeeded && (
                      <g
                        transform={`translate(${p2.x}, ${p2.y})`}
                        opacity="0.88"
                      >
                        <PieceOutline
                          frame={ghostPiece.frame}
                          radius={22}
                          fill="rgba(16, 185, 129, 0.22)"
                          stroke="#10b981"
                          strokeWidth="2.5"
                          strokeDasharray="4 3"
                        />
                        <MapPiece
                          style={pieceStyle}
                          mark={unitMark}
                          unitType={u.unit_type}
                          color={meta.color}
                          variant="ghost"
                          rim="#34d399"
                          frame={ghostPiece.frame}
                          flagDirection={ghostPiece.flagDirection}
                          hasStar={Boolean(
                            provinces[o.target]?.is_supply_center,
                          )}
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>

            {/* 6D. WINTER ADJUSTMENTS BUILD TOKENS LAYER */}
            {isAdjustmentPhase && (
              <g className="build-tokens-layer">
                {Object.entries(controllableBuildHomes).map(
                  ([homeProv, pwr]) => {
                    const bId = `BUILD_${pwr}_${homeProv}`;
                    const bOrder = orders[bId];
                    const isSelected = selectedUnitId === bId;
                    const isHovered = hoveredUnitId === bId;
                    const isWaived = bOrder?.order_type === 'WAIVE';
                    const uType = bOrder?.unit_type || 'A';
                    const cst = uType === 'F' ? bOrder?.origin_coast : null;
                    const pt = getProvincePoint(homeProv, cst);
                    const meta = POWER_METADATA[pwr];
                    const buildPiece = describePiece(homeProv, cst, false);

                    return (
                      <g
                        key={bId}
                        transform={`translate(${pt.x}, ${pt.y})`}
                        className="map-unit-token"
                        data-testid="build-token"
                        data-build-id={bId}
                        data-home-province={homeProv}
                        data-power={pwr}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dragMovedRef.current) return;
                          onSelectUnit(isSelected ? null : bId);
                        }}
                        onPointerEnter={(e) => {
                          if (e.pointerType !== 'touch') onHoverUnit(bId);
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType !== 'touch') onHoverUnit(null);
                        }}
                      >
                        <PieceHitArea
                          frame={buildPiece.frame}
                          minRadius={touchHitRadius(bId, buildPiece.frame)}
                        />
                        {(isSelected || isHovered) && (
                          <PieceOutline
                            frame={buildPiece.frame}
                            radius={28}
                            fill="rgba(34, 197, 94, 0.25)"
                            stroke="#22c55e"
                            strokeWidth="3.5"
                          />
                        )}
                        <PieceOutline
                          frame={buildPiece.frame}
                          radius={23}
                          fill={
                            isWaived
                              ? 'rgba(100, 116, 139, 0.2)'
                              : 'rgba(22, 163, 74, 0.22)'
                          }
                          stroke={isWaived ? '#64748b' : '#16a34a'}
                          strokeWidth="2.6"
                          strokeDasharray="5 3"
                        />
                        {!isWaived ? (
                          <>
                            <MapPiece
                              style={pieceStyle}
                              mark={unitMark}
                              unitType={uType}
                              color={meta.color}
                              variant="build"
                              rim="#4ade80"
                              frame={buildPiece.frame}
                              flagDirection={buildPiece.flagDirection}
                              hasStar={Boolean(
                                provinces[homeProv]?.is_supply_center,
                              )}
                            />
                            <g
                              transform={`translate(0, ${buildPiece.frame.bannerY})`}
                            >
                              <rect
                                x="-34"
                                y="-8"
                                width="68"
                                height="16"
                                rx="4"
                                fill="#15803d"
                                stroke="#fef3c7"
                                strokeWidth="1.2"
                              />
                              <text
                                y="3.5"
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="8.5"
                                fontWeight="800"
                              >
                                BUILD {uType}
                                {cst ? `/${cst}` : ''}
                              </text>
                            </g>
                          </>
                        ) : (
                          <g
                            transform={`translate(0, ${buildPiece.frame.bannerY})`}
                          >
                            <rect
                              x="-36"
                              y="-8"
                              width="72"
                              height="16"
                              rx="4"
                              fill="#334155"
                              stroke="#cbd5e1"
                              strokeWidth="1.2"
                            />
                            <text
                              y="3.5"
                              textAnchor="middle"
                              fill="#e2e8f0"
                              fontSize="8.5"
                              fontWeight="800"
                            >
                              + BUILD HERE
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  },
                )}
              </g>
            )}

            {/* 7. UNITS LAYER (Armies & Fleets + Hold Halos + Warning Badges + Dislodged/Disband Tags) */}
            <g className="units-layer">
              {units.map((u) => {
                const pt = getUnitPoint(u);
                const meta = POWER_METADATA[u.power];
                const order = orders[u.id];
                const isControllable =
                  u.power === controlPower || canEditAnyPower;
                const isSelected = Boolean(
                  selectedUnit && u.id === selectedUnit.id,
                );
                const isHovered = u.id === hoveredUnitId && isControllable;
                const unitIssues = isUnitOrderVisible(u)
                  ? issuesByUnit[u.id] || []
                  : [];
                const topSeverity: IssueSeverity | null = unitIssues.some(
                  (i) => i.severity === 'error',
                )
                  ? 'error'
                  : unitIssues.some((i) => i.severity === 'warning')
                    ? 'warning'
                    : null;

                const isHold = !order || order.order_type === 'HOLD';
                const isDisbanding = order?.order_type === 'DISBAND';
                const isExplicitHold = Boolean(
                  isUnitOrderVisible(u) &&
                    order &&
                    order.order_type === 'HOLD' &&
                    order.is_explicit,
                );
                const holdSupCount = isHold
                  ? supportCountByUnitId[u.id] || 0
                  : 0;

                const simActive = showSimulationOverlay || sandboxMode;
                const simRes =
                  simActive && isUnitOrderVisible(u)
                    ? simulationResult?.resolutions[u.id]
                    : null;
                const isAdvancingInSim = Boolean(
                  simActive &&
                    isUnitOrderVisible(u) &&
                    order?.order_type === 'MOVE' &&
                    simRes?.succeeded,
                );

                // A dislodged unit stepped aside, so the star stays with the unit holding the province
                const carriesStar =
                  (pieceStyle === 'seated' || pieceStyle === 'nameplate') &&
                  Boolean(provinces[u.province]?.is_supply_center) &&
                  !(u.is_dislodged && unitsByProv[u.province]);
                const { frame, flagDirection } = describePiece(
                  u.province,
                  u.coast,
                  carriesStar,
                );
                const steppedAside = Boolean(
                  u.is_dislodged && unitsByProv[u.province],
                );
                const bannerY = steppedAside
                  ? frame.steppedAsideBannerY
                  : frame.bannerY;

                return (
                  <g
                    key={u.id}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    className={`map-unit-token ${isSelected ? 'selected' : ''} ${
                      isHovered ? 'hovered' : ''
                    } ${!isControllable ? 'foreign-locked' : ''}`}
                    data-testid="unit-token"
                    data-unit-id={u.id}
                    data-unit-power={u.power}
                    data-unit-type={u.unit_type}
                    data-province={u.province}
                    data-controllable={isControllable ? 'true' : 'false'}
                    opacity={isAdvancingInSim && !isSelected ? 0.62 : 1}
                    onClick={(e) => handleSelectUnitOnMap(u, e)}
                    onPointerEnter={(e) => {
                      if (isControllable && e.pointerType !== 'touch')
                        onHoverUnit(u.id);
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== 'touch') onHoverUnit(null);
                    }}
                  >
                    <PieceHitArea
                      frame={frame}
                      minRadius={touchHitRadius(u.id, frame)}
                    />

                    {(isSelected || isHovered) && (
                      <PieceOutline
                        frame={frame}
                        radius={27}
                        fill="rgba(245, 158, 11, 0.22)"
                        stroke="#f59e0b"
                        strokeWidth="3.5"
                        strokeDasharray={isSelected ? undefined : '5 3'}
                      />
                    )}

                    {u.is_dislodged && (
                      <g
                        data-testid="dislodged-unit-indicator"
                        data-unit-id={u.id}
                      >
                        <PieceOutline
                          frame={frame}
                          radius={24}
                          fill="rgba(234, 88, 12, 0.28)"
                          stroke="#ea580c"
                          strokeWidth="3"
                          strokeDasharray="5 3"
                        />
                      </g>
                    )}

                    {isDisbanding && (
                      <PieceOutline
                        frame={frame}
                        radius={24}
                        fill="rgba(220, 38, 38, 0.28)"
                        stroke="#dc2626"
                        strokeWidth="3"
                        strokeDasharray="4 3"
                      />
                    )}

                    {/* Active Power Subtle Ring so your own units stand out clearly */}
                    {u.power === activePower &&
                      !isSelected &&
                      !u.is_dislodged && (
                        <PieceOutline
                          frame={frame}
                          radius={21}
                          fill="none"
                          stroke="#fef08a"
                          strokeWidth="2"
                          opacity="0.75"
                        />
                      )}

                    {isHold && !u.is_dislodged && isUnitOrderVisible(u) && (
                      <PieceHoldOutline
                        frame={frame}
                        fill="none"
                        stroke={isExplicitHold ? '#eab308' : '#1e293b'}
                        strokeWidth={isExplicitHold ? '2.8' : '1.6'}
                        strokeDasharray={isExplicitHold ? undefined : '4 3'}
                        opacity={isExplicitHold ? 0.95 : 0.65}
                      />
                    )}

                    <MapPiece
                      style={pieceStyle}
                      mark={unitMark}
                      unitType={u.unit_type}
                      color={meta.color}
                      rim={
                        u.is_dislodged
                          ? '#fdba74'
                          : isDisbanding
                            ? '#fca5a5'
                            : '#fef3c7'
                      }
                      frame={frame}
                      flagDirection={flagDirection}
                      hasStar={Boolean(provinces[u.province]?.is_supply_center)}
                      showStar={carriesStar}
                      starOwnerColor={getStarOwnerColor(u.province)}
                    />

                    {holdSupCount > 0 && (
                      <g
                        transform={`translate(${frame.badgeLeft.x}, ${frame.badgeLeft.y})`}
                      >
                        <circle
                          r="9"
                          fill="#0f766e"
                          stroke="#fef3c7"
                          strokeWidth="1.5"
                        />
                        <text
                          y="3.5"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="10"
                          fontWeight="800"
                        >
                          +{holdSupCount}
                        </text>
                      </g>
                    )}

                    {topSeverity && (
                      <g
                        transform={`translate(${frame.badgeRight.x}, ${frame.badgeRight.y})`}
                      >
                        <circle
                          r="10.5"
                          fill={topSeverity === 'error' ? '#dc2626' : '#f59e0b'}
                          stroke="#1e293b"
                          strokeWidth="1.8"
                        />
                        <text
                          y="4"
                          textAnchor="middle"
                          fill="#1e293b"
                          fontSize="13"
                          fontWeight="900"
                        >
                          !
                        </text>
                      </g>
                    )}

                    {(u.is_dislodged || (simActive && simRes?.dislodged)) &&
                      !isDisbanding && (
                        <g transform={`translate(0, ${bannerY})`}>
                          <rect
                            x="-38"
                            y="-8"
                            width="76"
                            height="16"
                            rx="4"
                            fill="#ea580c"
                            stroke="#fff"
                            strokeWidth="1.2"
                          />
                          <text
                            y="3.5"
                            textAnchor="middle"
                            fill="#fff"
                            fontSize="8.5"
                            fontWeight="800"
                          >
                            DISLODGED!
                          </text>
                        </g>
                      )}

                    {isDisbanding && (
                      <g transform={`translate(0, ${bannerY})`}>
                        <rect
                          x="-36"
                          y="-8"
                          width="72"
                          height="16"
                          rx="4"
                          fill="#dc2626"
                          stroke="#fff"
                          strokeWidth="1.2"
                        />
                        <text
                          y="3.5"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="8.5"
                          fontWeight="800"
                        >
                          ✕ DISBAND
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
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
