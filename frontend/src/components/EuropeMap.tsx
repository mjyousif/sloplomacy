import {
  Anchor,
  Crosshair,
  Eye,
  GripHorizontal,
  Maximize2,
  MoveRight,
  Play,
  PlusCircle,
  Shield,
  Swords,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type React from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  type CameraBoundsOptions,
  COMPACT_MAX_ZOOM,
  clampCamera,
  compactHitRadius,
  DEFAULT_CAMERA,
  elementPointToViewBox,
  getPhoneDefaultCamera,
  getViewportFit,
  halfNearestDistances,
  keepPointInView,
  MAP_CENTER_X,
  MAP_CENTER_Y,
  pinchStep,
  zoomAtPoint,
} from '../utils/mapCameraHelpers';
import {
  canUnitSupportInto,
  getActiveOrderButton,
  getReachableDestinations,
  getValidRetreatDestinations,
} from '../utils/orderHelpers';
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

/** How far the docked unit bar sits above the bottom of the map (`.unit-docked-bar` in compact.css). */
const DOCKED_BAR_INSET = 8;

/** On a phone, a selected unit is kept at least this far (px) from the edges of the uncovered map. */
const SELECTION_VIEW_MARGIN = 80;

/** How long the zoom must stay still before a phone's tap targets are resized for it. */
const TOUCH_TARGET_SETTLE_MS = 150;

type MapInteractionMode =
  | 'MOVE'
  | 'SUPPORT_PICK_UNIT'
  | 'SUPPORT_PICK_TARGET'
  | 'CONVOY_PICK_ARMY'
  | 'CONVOY_PICK_TARGET';

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
    const floatingMenuRef = useRef<HTMLDivElement | null>(null);

    // On a phone the unit menu, build menu and coast picker dock as one bar at the bottom of the
    // map instead of floating beside the unit. The space the bar takes (its height plus the 8px
    // it sits above the map's edge, see compact.css) goes on the map as --docked-bar-h, so the
    // zoom buttons can sit above it.
    const dockObserverRef = useRef<ResizeObserver | null>(null);
    const dockRef = useCallback((el: HTMLDivElement | null) => {
      dockObserverRef.current?.disconnect();
      dockObserverRef.current = null;
      const container = containerRef.current;
      if (!el) {
        container?.style.removeProperty('--docked-bar-h');
        return;
      }
      const apply = () =>
        container?.style.setProperty(
          '--docked-bar-h',
          `${Math.ceil(el.getBoundingClientRect().height) + DOCKED_BAR_INSET}px`,
        );
      apply();
      if (typeof ResizeObserver === 'undefined') return;
      dockObserverRef.current = new ResizeObserver(apply);
      dockObserverRef.current.observe(el);
    }, []);

    // Camera state stored in a mutable ref for zero-re-render 60fps+ pan & zoom via requestAnimationFrame
    const cameraRef = useRef<{ x: number; y: number; zoom: number }>({
      ...DEFAULT_CAMERA,
    });
    const isPanningRef = useRef<boolean>(false);
    const dragMovedRef = useRef<boolean>(false);
    const mouseDownClientRef = useRef<Point>({ x: 0, y: 0 });
    // Pointers pressed on the map, by id, at the client position last applied to the camera.
    // One pointer pans, and two pinch.
    const activePointersRef = useRef<Map<number, Point>>(new Map());
    const rafIdRef = useRef<number | null>(null);

    // Read through refs so the wheel listener and the rAF callback always see the current values.
    const cameraOptions = useMemo<CameraBoundsOptions | undefined>(
      () => (compact ? { maxZoom: COMPACT_MAX_ZOOM } : undefined),
      [compact],
    );
    const cameraOptionsRef = useRef(cameraOptions);
    cameraOptionsRef.current = cameraOptions;
    const onZoomChangeRef = useRef(onZoomChange);
    onZoomChangeRef.current = onZoomChange;
    const reportedZoomRef = useRef<number | null>(null);

    // Draggable Floating Menu State (also updated via ref during drag)
    const menuDragOffsetRef = useRef<Point>({ x: 0, y: 0 });
    const menuDragStartRef = useRef<Point>({ x: 0, y: 0 });

    const [hoveredProv, setHoveredProv] = useState<string | null>(null);
    const [interactionMode, setInteractionMode] =
      useState<MapInteractionMode>('MOVE');
    // True once the player presses Move on this selection, which replaces a saved Hold's highlight
    const [moveModeChosen, setMoveModeChosen] = useState<boolean>(false);
    const [pendingAuxOrigin, setPendingAuxOrigin] = useState<string | null>(
      null,
    );
    const [pendingCoastChoice, setPendingCoastChoice] = useState<{
      target: string;
      coasts: string[];
    } | null>(null);

    // Reset menu drag offset and chosen mode whenever a different unit is selected
    useEffect(() => {
      menuDragOffsetRef.current = { x: 0, y: 0 };
      setMoveModeChosen(false);
    }, []);

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

    // Check if selectedUnitId refers to a BUILD_ order or an existing Unit
    const isSelectedBuildOrder = Boolean(
      isAdjustmentPhase &&
        selectedUnitId &&
        selectedUnitId.startsWith('BUILD_'),
    );
    const selectedBuildOrder =
      isSelectedBuildOrder && selectedUnitId ? orders[selectedUnitId] : null;
    const selectedBuildProv =
      isSelectedBuildOrder && selectedUnitId
        ? selectedBuildOrder?.origin || selectedUnitId.split('_')[2] || null
        : null;

    const rawSelectedUnit =
      selectedUnitId && !isSelectedBuildOrder
        ? unitsById[selectedUnitId]
        : null;
    // A player may only command foreign units in the sandbox, or as host with Direct-Edit on
    // A past turn is read-only: no power's units can be picked up, not even the player's own.
    const canEditAnyPower = !historyView && (sandboxMode || directEditActive);
    const controlPower: Power | null = historyView ? null : activePower;
    // Strictly disallow controlling or showing the menu for foreign units otherwise
    const selectedUnit =
      rawSelectedUnit &&
      (rawSelectedUnit.power === controlPower || canEditAnyPower) &&
      (!isRetreatPhase || rawSelectedUnit.is_dislodged)
        ? rawSelectedUnit
        : null;

    const { reachableList, reachableMap } = useMemo(() => {
      const list = selectedUnit
        ? isRetreatPhase
          ? getValidRetreatDestinations(selectedUnit, retreats, provinces)
          : isAdjustmentPhase
            ? []
            : getReachableDestinations(selectedUnit, provinces)
        : [];
      const map: Record<string, string[]> = {};
      for (const r of list) {
        map[r.province] = r.coasts;
      }
      return { reachableList: list, reachableMap: map };
    }, [selectedUnit, isRetreatPhase, isAdjustmentPhase, retreats, provinces]);

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
        onUpdateOrder({
          unit_id: selectedUnit.id,
          power: selectedUnit.power,
          unit_type: selectedUnit.unit_type,
          origin: selectedUnit.province,
          origin_coast: selectedUnit.coast,
          order_type: 'SUPPORT',
          aux_unit_origin: u.province,
          target: u.province,
          via_convoy: false,
          is_explicit: true,
        });
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
        onUpdateOrder({
          unit_id: selectedUnit.id,
          power: selectedUnit.power,
          unit_type: selectedUnit.unit_type,
          origin: selectedUnit.province,
          origin_coast: selectedUnit.coast,
          order_type: 'SUPPORT',
          aux_unit_origin: pendingAuxOrigin,
          target: u.province,
          via_convoy: false,
          is_explicit: true,
        });
        clearSelection();
        return;
      }

      // 4. If we are in CONVOY_PICK_ARMY mode and click an Army
      if (
        selectedUnit &&
        interactionMode === 'CONVOY_PICK_ARMY' &&
        u.unit_type === 'A'
      ) {
        setPendingAuxOrigin(u.province);
        setInteractionMode('CONVOY_PICK_TARGET');
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
        onUpdateOrder({
          unit_id: unit.id,
          power: unit.power,
          unit_type: unit.unit_type,
          origin: unit.province,
          origin_coast: unit.coast,
          order_type: 'RETREAT',
          target: targetProv,
          target_coast: targetCoast,
          aux_unit_origin: null,
          via_convoy: false,
          is_explicit: true,
        });
        clearSelection();
        return;
      }

      const isDirect = Boolean(reachableMap[targetProv]);
      const viaConvoy = unit.unit_type === 'A' && !isDirect;
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'MOVE',
        target: targetProv,
        target_coast: targetCoast,
        aux_unit_origin: null,
        via_convoy: viaConvoy,
        is_explicit: true,
      });
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
          onUpdateOrder({
            unit_id: selectedUnit.id,
            power: selectedUnit.power,
            unit_type: selectedUnit.unit_type,
            origin: selectedUnit.province,
            origin_coast: selectedUnit.coast,
            order_type: 'HOLD',
            target: null,
            target_coast: null,
            aux_unit_origin: null,
            via_convoy: false,
            is_explicit: true,
          });
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
          if (
            occupant &&
            (occupant.power === controlPower || canEditAnyPower)
          ) {
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
        onUpdateOrder({
          unit_id: selectedUnit.id,
          power: selectedUnit.power,
          unit_type: selectedUnit.unit_type,
          origin: selectedUnit.province,
          origin_coast: selectedUnit.coast,
          order_type: 'SUPPORT',
          aux_unit_origin: pendingAuxOrigin,
          target: provId,
          via_convoy: false,
          is_explicit: true,
        });
        clearSelection();
        return;
      }

      if (interactionMode === 'CONVOY_PICK_ARMY') {
        const occ = unitsByProv[provId];
        if (occ && occ.unit_type === 'A') {
          setPendingAuxOrigin(provId);
          setInteractionMode('CONVOY_PICK_TARGET');
        } else {
          clearSelection();
        }
        return;
      }

      if (interactionMode === 'CONVOY_PICK_TARGET' && pendingAuxOrigin) {
        onUpdateOrder({
          unit_id: selectedUnit.id,
          power: selectedUnit.power,
          unit_type: selectedUnit.unit_type,
          origin: selectedUnit.province,
          origin_coast: selectedUnit.coast,
          order_type: 'CONVOY',
          aux_unit_origin: pendingAuxOrigin,
          target: provId,
          via_convoy: false,
          is_explicit: true,
        });
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

    // Convert SVG (1524x1357) point to container screen coordinates using current cameraRef
    const svgPointToScreen = useCallback(
      (pt: Point, W: number, H: number): Point => {
        const { x: panX, y: panY, zoom: z } = cameraRef.current;
        const svgX = 762 + (pt.x - 762) * z + panX;
        const svgY = 678 + (pt.y - 678) * z + panY;
        const scale = Math.min(W / 1524, H / 1357);
        const offsetX = (W - 1524 * scale) / 2;
        const offsetY = (H - 1357 * scale) / 2;
        return {
          x: offsetX + svgX * scale,
          y: offsetY + svgY * scale,
        };
      },
      [],
    );

    // Smart placement for the floating menu
    const getSelectedUnitFloatingPosition = useCallback((): {
      left: number;
      top: number;
      anchorLeft: number;
      anchorTop: number;
    } | null => {
      const anchorPt = selectedUnit
        ? getUnitPoint(selectedUnit)
        : selectedBuildProv
          ? getProvincePoint(selectedBuildProv)
          : null;
      if (!anchorPt) return null;

      const W = containerRef.current?.clientWidth || 980;
      const H = containerRef.current?.clientHeight || 860;
      const unitScreen = svgPointToScreen(anchorPt, W, H);
      const neighborScreens = reachableList.map((r) =>
        svgPointToScreen(getProvincePoint(r.province), W, H),
      );

      const menuW = 256;
      const menuH = 98;

      const candidates: Point[] = [
        { x: unitScreen.x - menuW / 2, y: unitScreen.y - menuH - 95 }, // Above
        { x: unitScreen.x - menuW / 2, y: unitScreen.y + 95 }, // Below
        { x: unitScreen.x - menuW - 95, y: unitScreen.y - menuH / 2 }, // Left
        { x: unitScreen.x + 95, y: unitScreen.y - menuH / 2 }, // Right
        { x: unitScreen.x - menuW - 75, y: unitScreen.y - menuH - 75 }, // Top-Left
        { x: unitScreen.x + 75, y: unitScreen.y - menuH - 75 }, // Top-Right
        { x: unitScreen.x - menuW - 75, y: unitScreen.y + 75 }, // Bottom-Left
        { x: unitScreen.x + 75, y: unitScreen.y + 75 }, // Bottom-Right
      ];

      let bestCandidate = candidates[0];
      let bestScore = -Infinity;

      for (const cand of candidates) {
        const clampedX = Math.max(14, Math.min(W - menuW - 14, cand.x));
        const clampedY = Math.max(64, Math.min(H - menuH - 14, cand.y));
        const centerX = clampedX + menuW / 2;
        const centerY = clampedY + menuH / 2;

        let minNeighborDist = 9999;
        for (const ns of neighborScreens) {
          const d = Math.hypot(centerX - ns.x, centerY - ns.y);
          if (d < minNeighborDist) minNeighborDist = d;
        }
        const distToUnit = Math.hypot(
          centerX - unitScreen.x,
          centerY - unitScreen.y,
        );
        const score = Math.min(minNeighborDist, distToUnit);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = { x: clampedX, y: clampedY };
        }
      }

      return {
        left: Math.max(
          10,
          Math.min(
            W - menuW - 10,
            bestCandidate.x + menuDragOffsetRef.current.x,
          ),
        ),
        top: Math.max(
          10,
          Math.min(
            H - menuH - 10,
            bestCandidate.y + menuDragOffsetRef.current.y,
          ),
        ),
        anchorLeft: bestCandidate.x,
        anchorTop: bestCandidate.y,
      };
    }, [
      selectedUnit,
      selectedBuildProv,
      reachableList,
      svgPointToScreen,
      getUnitPoint,
      getProvincePoint,
    ]);

    // Apply camera transform & floating menu position directly to DOM
    const syncCameraDOM = useCallback(() => {
      const { x, y, zoom: z } = cameraRef.current;
      if (cameraGroupRef.current) {
        cameraGroupRef.current.setAttribute(
          'transform',
          `translate(${x}, ${y}) scale(${z})`,
        );
      }
      if (floatingMenuRef.current) {
        const pos = getSelectedUnitFloatingPosition();
        if (pos) {
          floatingMenuRef.current.style.left = `${pos.left}px`;
          floatingMenuRef.current.style.top = `${pos.top}px`;
        }
      }
    }, [getSelectedUnitFloatingPosition]);

    // Tells App the zoom, but only when the rounded figure changes, so a wheel spin or a pinch
    // doesn't re-render the whole app on every frame.
    // Phone: screen pixels per board unit once the zoom settles, which sizes the tap targets.
    // It updates after the zoom stops changing, not on every frame of a pinch.
    const [touchPxPerUnit, setTouchPxPerUnit] = useState(0);
    const touchSettleTimerRef = useRef<number | null>(null);
    const compactRef = useRef(compact);
    compactRef.current = compact;
    const settleTouchTargets = useCallback(() => {
      if (!compactRef.current) return;
      if (touchSettleTimerRef.current !== null)
        window.clearTimeout(touchSettleTimerRef.current);
      touchSettleTimerRef.current = window.setTimeout(() => {
        touchSettleTimerRef.current = null;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        setTouchPxPerUnit(
          getViewportFit(rect.width, rect.height).scale *
            cameraRef.current.zoom,
        );
      }, TOUCH_TARGET_SETTLE_MS);
    }, []);

    useEffect(() => {
      if (!compact) return;
      settleTouchTargets();
      window.addEventListener('resize', settleTouchTargets);
      return () => {
        window.removeEventListener('resize', settleTouchTargets);
        if (touchSettleTimerRef.current !== null)
          window.clearTimeout(touchSettleTimerRef.current);
      };
    }, [compact, settleTouchTargets]);

    const reportZoom = useCallback(() => {
      const percent = Math.round(cameraRef.current.zoom * 100);
      if (percent === reportedZoomRef.current) return;
      reportedZoomRef.current = percent;
      onZoomChangeRef.current?.(percent);
      settleTouchTargets();
    }, [settleTouchTargets]);

    const scheduleCameraSync = useCallback(() => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        syncCameraDOM();
        // A pinch reports once the fingers lift.
        if (activePointersRef.current.size < 2) reportZoom();
      });
    }, [syncCameraDOM, reportZoom]);

    useEffect(() => {
      return () => {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }
      };
    }, []);

    /** A client-space point in viewBox units, allowing for the letterbox around the board. */
    const clientToViewBox = useCallback((pt: Point): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const W = rect?.width || 980;
      const H = rect?.height || 860;
      return elementPointToViewBox(
        { x: pt.x - (rect?.left ?? 0), y: pt.y - (rect?.top ?? 0) },
        W,
        H,
      );
    }, []);

    // Native non-passive wheel listener for smooth cursor-anchored zooming
    useEffect(() => {
      const svgEl = svgRef.current;
      if (!svgEl) return;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const current = cameraRef.current;
        const factor = Math.exp(-e.deltaY * 0.0014);
        const next = zoomAtPoint(
          current,
          clientToViewBox({ x: e.clientX, y: e.clientY }),
          Number((current.zoom * factor).toFixed(3)),
          cameraOptionsRef.current,
        );
        if (next.zoom === current.zoom) return;
        cameraRef.current = next;
        scheduleCameraSync();
      };

      svgEl.addEventListener('wheel', onWheel, { passive: false });
      return () => svgEl.removeEventListener('wheel', onWheel);
    }, [scheduleCameraSync, clientToViewBox]);

    // Pointer Events cover the mouse, a finger and a pen alike. The map takes the pointer only
    // once a drag passes the threshold: capturing on press would send the click to the map
    // instead of the unit or province under it.
    const endPanning = () => {
      isPanningRef.current = false;
      svgRef.current?.classList.remove('panning', 'actively-dragging');
      reportZoom();
    };

    const markDragging = () => {
      dragMovedRef.current = true;
      svgRef.current?.classList.add('actively-dragging');
    };

    const capturePointer = (pointerId: number) => {
      try {
        svgRef.current?.setPointerCapture(pointerId);
      } catch {
        // The pointer is already gone, for example lifted in the same frame.
      }
    };

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pointers = activePointersRef.current;
      const client = { x: e.clientX, y: e.clientY };
      if (pointers.size === 0) {
        isPanningRef.current = true;
        svgRef.current?.classList.add('panning');
        dragMovedRef.current = false;
        mouseDownClientRef.current = client;
      }
      pointers.set(e.pointerId, client);
      if (pointers.size === 2) {
        // A second finger turns the gesture into a pinch, and a pinch is never a tap.
        markDragging();
        pointers.forEach((_, id) => capturePointer(id));
      }
    };

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
      const pointers = activePointersRef.current;
      const last = pointers.get(e.pointerId);
      if (!last) return;
      const client = { x: e.clientX, y: e.clientY };

      if (pointers.size >= 2) {
        const [idA, idB] = Array.from(pointers.keys());
        if (e.pointerId !== idA && e.pointerId !== idB) return;
        const prev: [Point, Point] = [
          clientToViewBox(pointers.get(idA)!),
          clientToViewBox(pointers.get(idB)!),
        ];
        pointers.set(e.pointerId, client);
        const next: [Point, Point] = [
          clientToViewBox(pointers.get(idA)!),
          clientToViewBox(pointers.get(idB)!),
        ];
        cameraRef.current = pinchStep(
          cameraRef.current,
          prev,
          next,
          cameraOptionsRef.current,
        );
        scheduleCameraSync();
        return;
      }

      if (!dragMovedRef.current) {
        // A finger wobbles more than a mouse, so a tap allows more movement before it pans.
        const threshold = e.pointerType === 'mouse' ? 4 : 10;
        const dist = Math.hypot(
          client.x - mouseDownClientRef.current.x,
          client.y - mouseDownClientRef.current.y,
        );
        if (dist <= threshold) return;
        markDragging();
        capturePointer(e.pointerId);
      }

      const rect = svgRef.current?.getBoundingClientRect();
      const { scale } = getViewportFit(rect?.width || 980, rect?.height || 860);
      cameraRef.current = clampCamera(
        {
          x: cameraRef.current.x + (client.x - last.x) / scale,
          y: cameraRef.current.y + (client.y - last.y) / scale,
          zoom: cameraRef.current.zoom,
        },
        cameraOptionsRef.current,
      );
      pointers.set(e.pointerId, client);
      scheduleCameraSync();
    };

    const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
      const pointers = activePointersRef.current;
      if (!pointers.delete(e.pointerId)) return;
      if (svgRef.current?.hasPointerCapture(e.pointerId)) {
        svgRef.current.releasePointerCapture(e.pointerId);
      }
      // With one finger left after a pinch, carrying on pans from where that finger is.
      if (pointers.size === 0) endPanning();
    };

    // A captured pointer keeps the drag going off the map. Before the threshold, leaving the map
    // ends the press, as it always has for the mouse.
    const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
      if (svgRef.current?.hasPointerCapture(e.pointerId)) return;
      handlePointerUp(e);
    };

    // The cursor stays over the menu during a drag, so the map's own handlers never see it.
    // Capturing the pointer sends every move and the release to the header instead, wherever
    // the cursor goes. A capture also takes the click, so buttons in the header must not start one.
    const handleMenuDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as Element).closest('button')) return;
      const pos = getSelectedUnitFloatingPosition();
      if (pos) {
        // Start from where the menu is, since an earlier drag may have run past the map edge
        menuDragOffsetRef.current = {
          x: pos.left - pos.anchorLeft,
          y: pos.top - pos.anchorTop,
        };
      }
      menuDragStartRef.current = {
        x: e.clientX - menuDragOffsetRef.current.x,
        y: e.clientY - menuDragOffsetRef.current.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      floatingMenuRef.current?.classList.add('dragging');
    };

    const handleMenuDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      menuDragOffsetRef.current = {
        x: e.clientX - menuDragStartRef.current.x,
        y: e.clientY - menuDragStartRef.current.y,
      };
      scheduleCameraSync();
    };

    const handleMenuDragEnd = () => {
      floatingMenuRef.current?.classList.remove('dragging');
    };

    /** Zooms about the middle of the view, so whatever is in the middle stays there. */
    const zoomAboutCentre = useCallback(
      (newZoom: number) => {
        cameraRef.current = zoomAtPoint(
          cameraRef.current,
          { x: MAP_CENTER_X, y: MAP_CENTER_Y },
          newZoom,
          cameraOptionsRef.current,
        );
        syncCameraDOM();
        reportZoom();
      },
      [syncCameraDOM, reportZoom],
    );

    const stepZoom = useCallback(
      (delta: number) => {
        zoomAboutCentre(Number((cameraRef.current.zoom + delta).toFixed(2)));
      },
      [zoomAboutCentre],
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
    const ownUnitsCentreRef = useRef(ownUnitsCentre);
    ownUnitsCentreRef.current = ownUnitsCentre;

    const getHomeCamera = useCallback(() => {
      if (!compact) return clampCamera({ ...DEFAULT_CAMERA });
      const rect = svgRef.current?.getBoundingClientRect();
      return getPhoneDefaultCamera(
        rect?.width ?? 0,
        rect?.height ?? 0,
        ownUnitsCentreRef.current,
        cameraOptionsRef.current,
      );
    }, [compact]);

    const resetCamera = useCallback(() => {
      cameraRef.current = getHomeCamera();
      syncCameraDOM();
      reportZoom();
    }, [getHomeCamera, syncCameraDOM, reportZoom]);

    // Entering or leaving the phone layout, or switching powers on a phone, moves the camera
    // home. The wide layout starts on DEFAULT_CAMERA already, so its first render is untouched.
    const cameraHomeKeyRef = useRef<string>('wide');
    useLayoutEffect(() => {
      const key = compact ? `compact:${activePower}` : 'wide';
      if (key === cameraHomeKeyRef.current) return;
      cameraHomeKeyRef.current = key;
      resetCamera();
    }, [compact, activePower, resetCamera]);

    useImperativeHandle(
      ref,
      () => ({
        stepZoom,
        resetCamera,
        getZoom: () => cameraRef.current.zoom,
      }),
      [stepZoom, resetCamera],
    );

    useEffect(() => {
      // App gave a new callback, so tell it the zoom even if the figure hasn't changed.
      reportedZoomRef.current = null;
      reportZoom();
    }, [reportZoom]);

    // Phones dock the menus instead, so they skip the placement math.
    const floatingPos = compact ? null : getSelectedUnitFloatingPosition();
    const floatingStyle = floatingPos
      ? { left: floatingPos.left, top: floatingPos.top }
      : undefined;
    const menuRef = compact ? dockRef : floatingMenuRef;
    const menuClassName = compact
      ? 'unit-floating-menu unit-docked-bar'
      : 'unit-floating-menu';
    // Only the floating menu can be dragged. A docked bar stays put.
    const dragHeaderProps = compact
      ? {}
      : {
          title: 'Drag to move this menu anywhere',
          onPointerDown: handleMenuDragStart,
          onPointerMove: handleMenuDragMove,
          onLostPointerCapture: handleMenuDragEnd,
        };
    const tap = compact ? 'Tap' : 'Click';
    const tapLower = tap.toLowerCase();
    const showBuildMenu = Boolean(
      selectedBuildProv && selectedUnitId && (compact || floatingPos),
    );
    // A phone shows the coast picker in the bar's place while it is open.
    const showUnitMenu = Boolean(
      selectedUnit && (compact ? !pendingCoastChoice : floatingPos),
    );
    const dockedBarVisible =
      compact && (showBuildMenu || Boolean(selectedUnit));

    const onDockedBarChangeRef = useRef(onDockedBarChange);
    onDockedBarChangeRef.current = onDockedBarChange;
    useEffect(() => {
      if (compact) onDockedBarChangeRef.current?.(dockedBarVisible);
    }, [compact, dockedBarVisible]);

    // Phone: whatever was just selected, from the map or from its card in the order sheet, is
    // panned clear of the docked bar with room around it for the provinces to tap. It only runs
    // when the selection changes, so panning away afterwards is left alone.
    const selectionAnchorRef = useRef<Point | null>(null);
    selectionAnchorRef.current = selectedUnit
      ? getUnitPoint(selectedUnit)
      : selectedBuildProv
        ? getProvincePoint(selectedBuildProv)
        : null;
    // Through a ref, so a re-render that changes syncCameraDOM can't re-run this and undo a pan.
    const syncCameraDOMRef = useRef(syncCameraDOM);
    syncCameraDOMRef.current = syncCameraDOM;
    useEffect(() => {
      if (!compact) return;
      const anchor = selectionAnchorRef.current;
      const svg = svgRef.current;
      if (!anchor || !svg) return;
      const rect = svg.getBoundingClientRect();
      // The dock ref has already put the bar's space on the map by the time effects run.
      const barSpace =
        parseFloat(
          containerRef.current?.style.getPropertyValue('--docked-bar-h') ?? '',
        ) || 0;
      const next = keepPointInView(
        cameraRef.current,
        anchor,
        rect.width,
        rect.height,
        { top: 0, bottom: rect.height - barSpace },
        SELECTION_VIEW_MARGIN,
        cameraOptionsRef.current,
      );
      if (next === cameraRef.current) return;
      cameraRef.current = next;
      syncCameraDOMRef.current();
    }, [compact, selectedUnitId, selectedBuildProv]);
    const activeOrderButton = getActiveOrderButton(
      interactionMode,
      selectedUnit ? orders[selectedUnit.id] : undefined,
      moveModeChosen,
    );

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
            <div className="simulation-map-banner">
              <Eye size={16} />
              <span>
                {compact ? (
                  // A phone has room for one short line here.
                  <>
                    <strong>HYPOTHETICAL</strong> · guesses are discarded on
                    exit
                  </>
                ) : (
                  <>
                    <strong>HYPOTHETICAL PLANNING &amp; OUTCOME PREVIEW</strong>{' '}
                    — Foreign guesses are discarded upon exit
                  </>
                )}
              </span>
              <button
                className="sim-advance-btn"
                onClick={onAdjudicateTurn}
                title="Step forward one phase in Sandbox to plan follow-up turns"
              >
                <Play size={12} /> Step Turn Forward
              </button>
              {showSimulationOverlay && !sandboxMode && (
                <button
                  className="sim-close-btn"
                  onClick={onClearSimulationOverlay}
                >
                  Hide Preview
                </button>
              )}
            </div>
          )}

        {overlay}

        {/* Coast Disambiguation Popup */}
        {selectedUnit && pendingCoastChoice && (
          <div
            ref={compact ? dockRef : undefined}
            className={
              compact
                ? 'coast-picker-modal unit-docked-bar'
                : 'coast-picker-modal'
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="coast-picker-title">
              Select Coast for {provinces[pendingCoastChoice.target]?.name}:
            </div>
            <div className="coast-picker-buttons">
              {pendingCoastChoice.coasts.map((c) => (
                <button
                  key={c}
                  className="coast-btn"
                  onClick={() =>
                    commitMoveOrRetreatOrder(
                      selectedUnit,
                      pendingCoastChoice.target,
                      c,
                    )
                  }
                >
                  {pendingCoastChoice.target}/{c} Coast
                </button>
              ))}
              <button
                className="coast-cancel-btn"
                onClick={() => setPendingCoastChoice(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR BUILD SLOTS IN WINTER ADJUSTMENTS) */}
        {showBuildMenu && selectedBuildProv && selectedUnitId && (
          <div
            ref={menuRef}
            className={menuClassName}
            data-testid={compact ? 'unit-docked-bar' : undefined}
            style={{
              ...floatingStyle,
              borderColor: '#22c55e',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="floating-menu-header" {...dragHeaderProps}>
              <div className="floating-unit-title">
                <GripHorizontal size={13} className="floating-drag-grip" />
                <PlusCircle size={13} style={{ color: '#4ade80' }} />
                <strong>Build in {provinces[selectedBuildProv]?.name}</strong>
              </div>
              <button
                className="floating-close-btn"
                onClick={clearSelection}
                title="Close (Esc)"
              >
                <X size={14} />
                {compact && <span>Cancel</span>}
              </button>
            </div>

            <div className="floating-menu-buttons">
              <button
                className={`tactical-mode-btn ${
                  selectedBuildOrder?.order_type === 'BUILD' &&
                  selectedBuildOrder?.unit_type === 'A'
                    ? 'active-hold'
                    : ''
                }`}
                onClick={() => {
                  const buildPwr =
                    controllableBuildHomes[selectedBuildProv] || activePower;
                  onUpdateOrder({
                    unit_id: selectedUnitId,
                    power: buildPwr,
                    unit_type: 'A',
                    origin: selectedBuildProv,
                    origin_coast: null,
                    order_type: 'BUILD',
                    via_convoy: false,
                    is_explicit: true,
                  });
                  clearSelection();
                }}
              >
                <Swords size={13} />+ Army
              </button>

              {provinces[selectedBuildProv]?.type === 'COAST' &&
                (provinces[selectedBuildProv]?.coasts?.length > 0 ? (
                  provinces[selectedBuildProv].coasts.map((cst) => (
                    <button
                      key={cst}
                      className={`tactical-mode-btn ${
                        selectedBuildOrder?.order_type === 'BUILD' &&
                        selectedBuildOrder?.unit_type === 'F' &&
                        selectedBuildOrder?.origin_coast === cst
                          ? 'active-hold'
                          : ''
                      }`}
                      onClick={() => {
                        const buildPwr =
                          controllableBuildHomes[selectedBuildProv] ||
                          activePower;
                        onUpdateOrder({
                          unit_id: selectedUnitId,
                          power: buildPwr,
                          unit_type: 'F',
                          origin: selectedBuildProv,
                          origin_coast: cst,
                          order_type: 'BUILD',
                          via_convoy: false,
                          is_explicit: true,
                        });
                        clearSelection();
                      }}
                    >
                      <Anchor size={13} />+ F ({cst})
                    </button>
                  ))
                ) : (
                  <button
                    className={`tactical-mode-btn ${
                      selectedBuildOrder?.order_type === 'BUILD' &&
                      selectedBuildOrder?.unit_type === 'F'
                        ? 'active-hold'
                        : ''
                    }`}
                    onClick={() => {
                      const buildPwr =
                        controllableBuildHomes[selectedBuildProv] ||
                        activePower;
                      onUpdateOrder({
                        unit_id: selectedUnitId,
                        power: buildPwr,
                        unit_type: 'F',
                        origin: selectedBuildProv,
                        origin_coast: null,
                        order_type: 'BUILD',
                        via_convoy: false,
                        is_explicit: true,
                      });
                      clearSelection();
                    }}
                  >
                    <Anchor size={13} />+ Fleet
                  </button>
                ))}

              <button
                className={`tactical-mode-btn ${
                  selectedBuildOrder?.order_type === 'WAIVE' ? 'active' : ''
                }`}
                onClick={() => {
                  const buildPwr =
                    controllableBuildHomes[selectedBuildProv] || activePower;
                  onUpdateOrder({
                    unit_id: selectedUnitId,
                    power: buildPwr,
                    unit_type: 'A',
                    origin: selectedBuildProv,
                    origin_coast: null,
                    order_type: 'WAIVE',
                    via_convoy: false,
                    is_explicit: true,
                  });
                  clearSelection();
                }}
              >
                <X size={13} />
                Waive
              </button>
            </div>
            <div className="floating-menu-hint">
              Choose unit type to build in {provinces[selectedBuildProv]?.name}{' '}
              or Waive
            </div>
          </div>
        )}

        {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR UNITS) */}
        {showUnitMenu && selectedUnit && (
          <div
            ref={menuRef}
            className={menuClassName}
            data-testid={compact ? 'unit-docked-bar' : undefined}
            style={floatingStyle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="floating-menu-header" {...dragHeaderProps}>
              <div className="floating-unit-title">
                <GripHorizontal size={13} className="floating-drag-grip" />
                <span
                  className="tactical-power-dot"
                  style={{
                    backgroundColor: POWER_METADATA[selectedUnit.power].color,
                  }}
                />
                <strong>
                  {selectedUnit.is_dislodged ? 'Dislodged ' : ''}
                  {selectedUnit.unit_type === 'A' ? 'Army' : 'Fleet'}{' '}
                  {provinces[selectedUnit.province]?.name}
                </strong>
              </div>
              <button
                className="floating-close-btn"
                onClick={clearSelection}
                title="Close (Esc)"
              >
                <X size={14} />
                {compact && <span>Cancel</span>}
              </button>
            </div>

            {isRetreatPhase ? (
              <>
                <div
                  className="floating-menu-buttons"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <button
                    className={`tactical-mode-btn ${
                      orders[selectedUnit.id]?.order_type === 'RETREAT'
                        ? 'active'
                        : ''
                    }`}
                    onClick={() => setInteractionMode('MOVE')}
                  >
                    <MoveRight size={13} />
                    Retreat
                  </button>
                  <button
                    className={`tactical-mode-btn ${
                      orders[selectedUnit.id]?.order_type === 'DISBAND'
                        ? 'active'
                        : ''
                    }`}
                    style={{ borderColor: '#ef4444', color: '#fca5a5' }}
                    onClick={() => {
                      onUpdateOrder({
                        unit_id: selectedUnit.id,
                        power: selectedUnit.power,
                        unit_type: selectedUnit.unit_type,
                        origin: selectedUnit.province,
                        origin_coast: selectedUnit.coast,
                        order_type: 'DISBAND',
                        target: null,
                        target_coast: null,
                        aux_unit_origin: null,
                        via_convoy: false,
                        is_explicit: true,
                      });
                      clearSelection();
                    }}
                  >
                    <Trash2 size={13} />
                    Disband
                  </button>
                </div>
                <div className="floating-menu-hint">
                  {`${tap} a green province on the map to Retreat, or ${tapLower} Disband`}
                </div>
              </>
            ) : isAdjustmentPhase ? (
              <>
                <div
                  className="floating-menu-buttons"
                  style={{ gridTemplateColumns: '1fr 1fr' }}
                >
                  <button
                    className={`tactical-mode-btn ${
                      orders[selectedUnit.id]?.order_type !== 'DISBAND'
                        ? 'active-hold'
                        : ''
                    }`}
                    onClick={() => {
                      onUpdateOrder({
                        unit_id: selectedUnit.id,
                        power: selectedUnit.power,
                        unit_type: selectedUnit.unit_type,
                        origin: selectedUnit.province,
                        origin_coast: selectedUnit.coast,
                        order_type: 'HOLD',
                        target: null,
                        target_coast: null,
                        aux_unit_origin: null,
                        via_convoy: false,
                        is_explicit: true,
                      });
                      clearSelection();
                    }}
                  >
                    <Shield size={13} />
                    Keep Unit
                  </button>
                  <button
                    className={`tactical-mode-btn ${
                      orders[selectedUnit.id]?.order_type === 'DISBAND'
                        ? 'active'
                        : ''
                    }`}
                    style={{ borderColor: '#ef4444', color: '#fca5a5' }}
                    onClick={() => {
                      onUpdateOrder({
                        unit_id: selectedUnit.id,
                        power: selectedUnit.power,
                        unit_type: selectedUnit.unit_type,
                        origin: selectedUnit.province,
                        origin_coast: selectedUnit.coast,
                        order_type: 'DISBAND',
                        target: null,
                        target_coast: null,
                        aux_unit_origin: null,
                        via_convoy: false,
                        is_explicit: true,
                      });
                      clearSelection();
                    }}
                  >
                    <Trash2 size={13} />
                    Disband
                  </button>
                </div>
                <div className="floating-menu-hint">
                  Choose whether to Keep or Disband this unit for Winter
                  Adjustments
                </div>
              </>
            ) : (
              <>
                <div className="floating-menu-buttons">
                  <button
                    className={`tactical-mode-btn ${activeOrderButton === 'MOVE' ? 'active' : ''}`}
                    onClick={() => {
                      setInteractionMode('MOVE');
                      setMoveModeChosen(true);
                      setPendingAuxOrigin(null);
                    }}
                  >
                    <MoveRight size={13} />
                    Move
                  </button>

                  <button
                    className={`tactical-mode-btn ${
                      activeOrderButton === 'HOLD' ? 'active-hold' : ''
                    }`}
                    onClick={() => {
                      onUpdateOrder({
                        unit_id: selectedUnit.id,
                        power: selectedUnit.power,
                        unit_type: selectedUnit.unit_type,
                        origin: selectedUnit.province,
                        origin_coast: selectedUnit.coast,
                        order_type: 'HOLD',
                        target: null,
                        target_coast: null,
                        aux_unit_origin: null,
                        via_convoy: false,
                        is_explicit: true,
                      });
                      clearSelection();
                    }}
                  >
                    <Shield size={13} />
                    Hold
                  </button>

                  <button
                    className={`tactical-mode-btn ${
                      activeOrderButton === 'SUPPORT' ? 'active' : ''
                    }`}
                    onClick={() => {
                      setInteractionMode('SUPPORT_PICK_UNIT');
                      setPendingAuxOrigin(null);
                    }}
                  >
                    <Crosshair size={13} />
                    Support
                  </button>

                  {selectedUnit.unit_type === 'F' &&
                    provinces[selectedUnit.province]?.type === 'SEA' && (
                      <button
                        className={`tactical-mode-btn ${
                          activeOrderButton === 'CONVOY' ? 'active' : ''
                        }`}
                        onClick={() => {
                          setInteractionMode('CONVOY_PICK_ARMY');
                          setPendingAuxOrigin(null);
                        }}
                      >
                        <Anchor size={13} />
                        Convoy
                      </button>
                    )}
                </div>

                <div className="floating-menu-hint">
                  {interactionMode === 'MOVE' &&
                    (compact
                      ? 'Tap a green province to Move'
                      : 'Click a green province to Move • Drag header to move')}
                  {interactionMode === 'SUPPORT_PICK_UNIT' &&
                    `Step 1/2: ${tap} unit to Support`}
                  {interactionMode === 'SUPPORT_PICK_TARGET' &&
                    `Step 2/2: ${tap} destination for ${pendingAuxOrigin} (or ${tapLower} ${pendingAuxOrigin} to Hold)`}
                  {interactionMode === 'CONVOY_PICK_ARMY' &&
                    `Step 1/2: ${tap} coastal Army to Convoy`}
                  {interactionMode === 'CONVOY_PICK_TARGET' &&
                    `Step 2/2: ${tap} destination coast for Army ${pendingAuxOrigin}`}
                </div>
              </>
            )}
          </div>
        )}

        {/* Main Interactive SVG Map */}
        <svg
          ref={svgRef}
          viewBox={MAP_VIEWBOX}
          className="europe-svg-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
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
                    onClickProvince={stableOnClickProvince}
                    onHoverProvince={stableOnHoverProvince}
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
          <div className="map-zoom-controls" role="group" aria-label="Map zoom">
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Zoom in"
              onClick={() => zoomAboutCentre(cameraRef.current.zoom * 1.5)}
            >
              <ZoomIn size={20} />
            </button>
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Zoom out"
              onClick={() => zoomAboutCentre(cameraRef.current.zoom / 1.5)}
            >
              <ZoomOut size={20} />
            </button>
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Back to my units"
              onClick={resetCamera}
            >
              <Maximize2 size={18} />
            </button>
          </div>
        )}
      </div>
    );
  },
);
