import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  AUTHENTIC_BACKGROUND_SVG,
  AUTHENTIC_DEFS_SVG,
  AUTHENTIC_FOREGROUND_SVG,
  AUTHENTIC_NAMES_SVG,
  EUROPE_PROVINCE_GEOMETRY,
  MAP_VIEWBOX,
  Point,
  ProvinceGeometry,
} from '../data/europeMapGeometry';
import { getMapLayout, SEA_SHORT_NAMES, SHARED_MAP_NAMES_SVG } from '../data/mapLayouts';
import { MAP_NAME_FONT, measureMapName } from '../data/mapTextMetrics';
import {
  IssueSeverity,
  Order,
  POWER_METADATA,
  Power,
  ProvinceInfo,
  SimulationResult,
  Unit,
  ValidationIssue,
} from '../types/diplomacy';
import {
  canUnitSupportInto,
  getReachableDestinations,
  getValidRetreatDestinations,
  getActiveOrderButton,
} from '../utils/orderHelpers';
import {
  clampCamera,
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../utils/mapCameraHelpers';
import { PieceStyle, UnitMark } from '../utils/displayPrefs';
import {
  getPieceArrowScale,
  getPieceFrame,
  makePiecePill,
  MapPiece,
  PieceHitArea,
  PieceHoldOutline,
  PieceOutline,
  SupplyStar,
} from './MapPiece';
import {
  AlertTriangle,
  Anchor,
  Compass,
  Crosshair,
  Eye,
  GripHorizontal,
  MoveRight,
  Play,
  PlusCircle,
  Shield,
  Swords,
  Trash2,
  X,
} from 'lucide-react';

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
}

type MapInteractionMode =
  | 'MOVE'
  | 'SUPPORT_PICK_UNIT'
  | 'SUPPORT_PICK_TARGET'
  | 'CONVOY_PICK_ARMY'
  | 'CONVOY_PICK_TARGET';

const StaticBackgroundLayer = memo(() => (
  <g
    className="authentic-background-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_BACKGROUND_SVG }}
  />
));

const StaticForegroundLayer = memo(() => (
  <g
    className="authentic-foreground-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_FOREGROUND_SVG }}
  />
));

const StaticNamesLayer = memo(() => (
  <g
    className="authentic-names-layer"
    pointerEvents="none"
    dangerouslySetInnerHTML={{ __html: AUTHENTIC_NAMES_SVG }}
  />
));

// Room kept beside a name for its star in the Name as piece style
const NAME_STAR_ROOM = 6;

/**
 * Province names, fitted around the active piece style. Classic keeps the original
 * typesetting. The other styles share its sea names and place land names themselves.
 */
const MapNamesLayer = memo<{
  pieceStyle: PieceStyle;
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  occupied: string;
}>(({ pieceStyle, provinces, ownership, occupied }) => {
  if (pieceStyle === 'classic') return <StaticNamesLayer />;

  const layout = getMapLayout(pieceStyle);
  const isNameplate = pieceStyle === 'nameplate';
  const hidden = isNameplate ? new Set(occupied.split(',')) : null;

  return (
    <g className="authentic-names-layer" pointerEvents="none">
      <g dangerouslySetInnerHTML={{ __html: SHARED_MAP_NAMES_SVG }} />
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const placement = layout[geom.id]?.name;
        const pInfo = provinces[geom.id];
        if (!placement || !pInfo || hidden?.has(geom.id)) return null;

        const hasStar = isNameplate && pInfo.is_supply_center;
        const owner = ownership[geom.id] || pInfo.home_power;
        const nameWidth = measureMapName(pInfo.name, placement.size);
        return (
          <g
            key={`name_${geom.id}`}
            transform={`translate(${placement.x}, ${placement.y}) rotate(${placement.angle})`}
          >
            <text
              className="map-province-name"
              x={hasStar ? NAME_STAR_ROOM : 0}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={MAP_NAME_FONT}
              fontWeight="700"
              fontSize={placement.size}
            >
              {pInfo.name}
            </text>
            {hasStar && (
              <g transform={`translate(${NAME_STAR_ROOM - nameWidth / 2 - 8}, 0)`}>
                <SupplyStar
                  ownerColor={owner ? POWER_METADATA[owner].color : undefined}
                  scale={0.5}
                />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});

const StaticDefsLayer = memo(() => (
  <g dangerouslySetInnerHTML={{ __html: AUTHENTIC_DEFS_SVG }} />
));

const ALL_PROVINCE_GEOMETRIES: ProvinceGeometry[] = Object.values(EUROPE_PROVINCE_GEOMETRY);

interface ProvincePolygonProps {
  geom: ProvinceGeometry;
  isSea: boolean;
  owner: Power | null;
  isReachable: boolean;
  allowedCoastsStr: string;
  showFleetCoasts: boolean;
  showMoveReticle: boolean;
  reticlePoint: Point;
  isHovered: boolean;
  isHighlighted: boolean;
  hasWarning: boolean;
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  onHoverProvince: (provId: string | null) => void;
}

const ProvincePolygon = memo<ProvincePolygonProps>(
  ({
    geom,
    isSea,
    owner,
    isReachable,
    allowedCoastsStr,
    showFleetCoasts,
    showMoveReticle,
    reticlePoint,
    isHovered,
    isHighlighted,
    hasWarning,
    onClickProvince,
    onHoverProvince,
  }) => {
    let fill = 'transparent';
    let fillOpacity = 0;

    if (isSea) {
      if (isHighlighted) {
        fill = '#fde047';
        fillOpacity = 0.45;
      } else if (isReachable && isHovered) {
        fill = '#22c55e';
        fillOpacity = 0.42;
      } else if (isReachable) {
        fill = '#4ade80';
        fillOpacity = 0.25;
      } else if (isHovered) {
        fill = '#ffffff';
        fillOpacity = 0.22;
      } else {
        fill = '#9ec5d6';
        fillOpacity = 0.28;
      }
    } else {
      if (owner && POWER_METADATA[owner]) {
        fill = POWER_METADATA[owner].fillColor;
        fillOpacity = isHovered ? 0.68 : 0.48;
      } else {
        fill = isHovered ? '#fffbeb' : '#f4d7b5';
        fillOpacity = isHovered ? 0.55 : 0.15;
      }

      if (isHighlighted) {
        fill = '#facc15';
        fillOpacity = 0.58;
      } else if (isReachable && isHovered) {
        fill = '#22c55e';
        fillOpacity = 0.55;
      } else if (isReachable) {
        fill = '#4ade80';
        fillOpacity = 0.32;
      }
    }

    const allowedCoasts = allowedCoastsStr ? allowedCoastsStr.split(',') : [];

    return (
      <g>
        <path
          d={geom.path}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={
            isHighlighted
              ? '#eab308'
              : isReachable
              ? '#15803d'
              : hasWarning
              ? '#d97706'
              : 'none'
          }
          strokeWidth={isHighlighted || isReachable || hasWarning ? 3.5 : 0}
          className="province-interactive-path"
          onClick={() => onClickProvince(geom.id)}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'touch') onHoverProvince(geom.id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch') onHoverProvince(null);
          }}
        />

        {/* Split-coast interactive sub-polygons for Fleets */}
        {showFleetCoasts &&
          isReachable &&
          geom.coastPaths &&
          Object.entries(geom.coastPaths).map(([coastKey, cPath]) => {
            if (!allowedCoasts.includes(coastKey)) return null;
            return (
              <path
                key={`${geom.id}/${coastKey}`}
                d={cPath}
                fill="#22c55e"
                fillOpacity={0.42}
                stroke="#15803d"
                strokeWidth="3"
                className="coast-interactive-path"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickProvince(geom.id, coastKey);
                }}
              />
            );
          })}

        {/* Reachable Target Reticle */}
        {showMoveReticle && (
          <g
            className="reachable-target-reticle"
            onClick={(e) => {
              e.stopPropagation();
              onClickProvince(geom.id);
            }}
          >
            <circle
              cx={reticlePoint.x}
              cy={reticlePoint.y}
              r={24}
              fill="rgba(22, 163, 74, 0.22)"
              stroke="#15803d"
              strokeWidth="2.8"
              strokeDasharray="6 3"
            />
          </g>
        )}
      </g>
    );
  }
);

const STAR_SCALE: Record<PieceStyle, number> = {
  classic: 1,
  seated: 0.85,
  compact: 0.65,
  flags: 0.72,
  nameplate: 0.5,
};

const SupplyCentersLayer = memo<{
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  pieceStyle: PieceStyle;
  occupied: string;
}>(({ provinces, ownership, pieceStyle, occupied }) => {
  // Name as piece draws each star beside its name or inside the pill instead
  if (pieceStyle === 'nameplate') return null;

  const layout = getMapLayout(pieceStyle);
  const sharesUnitPoint = pieceStyle === 'seated' || pieceStyle === 'flags';
  // In Star seat the unit carries the star, so only empty centers are drawn here
  const carried = pieceStyle === 'seated' ? new Set(occupied.split(',')) : null;

  return (
    <g className="supply-centers-layer" pointerEvents="none">
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const pInfo = provinces[geom.id];
        const entry = layout[geom.id];
        const point = sharesUnitPoint ? entry?.unit : entry?.star;
        if (!pInfo || !pInfo.is_supply_center || !point || carried?.has(geom.id)) return null;
        const owner = ownership[geom.id] || pInfo.home_power;
        return (
          <g key={`sc_${geom.id}`} transform={`translate(${point.x}, ${point.y})`}>
            <SupplyStar
              ownerColor={owner ? POWER_METADATA[owner].color : undefined}
              scale={STAR_SCALE[pieceStyle]}
            />
          </g>
        );
      })}
    </g>
  );
});

function computeQuadraticCurve(
  p1: Point,
  p2: Point,
  curvature = 0.14,
  insetScale = 1
): { path: string; mid: Point } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const shrink = Math.min(26 * insetScale, dist * 0.22);
  const startShrink = Math.min(18 * insetScale, dist * 0.15);
  const sx = p1.x + (dx / dist) * startShrink;
  const sy = p1.y + (dy / dist) * startShrink;
  const ex = p2.x - (dx / dist) * shrink;
  const ey = p2.y - (dy / dist) * shrink;

  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = dist * curvature;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;

  const qx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
  const qy = 0.25 * sy + 0.5 * cy + 0.25 * ey;

  return {
    path: `M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(
      1
    )},${ey.toFixed(1)}`,
    mid: { x: qx, y: qy },
  };
}

export const EuropeMap = forwardRef<EuropeMapHandle, EuropeMapProps>(function EuropeMap(
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
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cameraGroupRef = useRef<SVGGElement | null>(null);
  const floatingMenuRef = useRef<HTMLDivElement | null>(null);

  // Camera state stored in a mutable ref for zero-re-render 60fps+ pan & zoom via requestAnimationFrame
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({
    ...DEFAULT_CAMERA,
  });
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const dragMovedRef = useRef<boolean>(false);
  const mouseDownClientRef = useRef<Point>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);

  // Draggable Floating Menu State (also updated via ref during drag)
  const menuDragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const menuDragStartRef = useRef<Point>({ x: 0, y: 0 });

  const [hoveredProv, setHoveredProv] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('MOVE');
  // True once the player presses Move on this selection, which replaces a saved Hold's highlight
  const [moveModeChosen, setMoveModeChosen] = useState<boolean>(false);
  const [pendingAuxOrigin, setPendingAuxOrigin] = useState<string | null>(null);
  const [pendingCoastChoice, setPendingCoastChoice] = useState<{
    target: string;
    coasts: string[];
  } | null>(null);

  // Reset menu drag offset and chosen mode whenever a different unit is selected
  useEffect(() => {
    menuDragOffsetRef.current = { x: 0, y: 0 };
    setMoveModeChosen(false);
  }, [selectedUnitId]);

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
    return { unitsByProv: byProv, dislodgedByProv: dislodged, unitsById: byId };
  }, [units]);

  const layout = useMemo(() => getMapLayout(pieceStyle), [pieceStyle]);
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
    [layout]
  );

  /** How a piece standing in this province is drawn in the active style. */
  const describePiece = useCallback(
    (province: string, coast: string | null | undefined, showStar: boolean) => {
      const entry = layout[province];
      const flagDirection = entry?.flagDirection ?? 1;
      if (pieceStyle !== 'nameplate') {
        return { flagDirection, frame: getPieceFrame(pieceStyle, flagDirection) };
      }
      const baseName = SEA_SHORT_NAMES[province] ?? provinces[province]?.name ?? province;
      const pill = makePiecePill(
        coast ? `${baseName} ${coast}` : baseName,
        entry?.name?.size ?? 12.5,
        coast ? 0 : entry?.name?.angle ?? 0,
        showStar
      );
      return { flagDirection, frame: getPieceFrame(pieceStyle, flagDirection, pill) };
    },
    [layout, pieceStyle, provinces]
  );

  const getUnitPoint = useCallback(
    (unit: Unit): Point => {
      const basePt = getProvincePoint(unit.province, unit.coast);
      if (unit.is_dislodged && unitsByProv[unit.province]) {
        const { dislodgeOffset } = describePiece(unit.province, unit.coast, false).frame;
        return { x: basePt.x + dislodgeOffset.x, y: basePt.y + dislodgeOffset.y };
      }
      return basePt;
    },
    [unitsByProv, getProvincePoint, describePiece]
  );

  const getStarOwnerColor = (province: string): string | undefined => {
    const owner = ownership[province] || provinces[province]?.home_power;
    return owner ? POWER_METADATA[owner].color : undefined;
  };

  // Provinces whose star or name a unit is standing on, as a string so the static layers can skip re-rendering
  const occupiedProvinces = Object.keys({ ...unitsByProv, ...dislodgedByProv })
    .sort()
    .join(',');

  // Check if selectedUnitId refers to a BUILD_ order or an existing Unit
  const isSelectedBuildOrder = Boolean(
    isAdjustmentPhase && selectedUnitId && selectedUnitId.startsWith('BUILD_')
  );
  const selectedBuildOrder = isSelectedBuildOrder && selectedUnitId ? orders[selectedUnitId] : null;
  const selectedBuildProv =
    isSelectedBuildOrder && selectedUnitId
      ? selectedBuildOrder?.origin || selectedUnitId.split('_')[2] || null
      : null;

  const rawSelectedUnit = selectedUnitId && !isSelectedBuildOrder ? unitsById[selectedUnitId] : null;
  // A player may only command foreign units in the sandbox, or as host with Direct-Edit on
  const canEditAnyPower = sandboxMode || directEditActive;
  // Strictly disallow controlling or showing the menu for foreign units otherwise
  const selectedUnit =
    rawSelectedUnit &&
    (rawSelectedUnit.power === activePower || canEditAnyPower) &&
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
    (u: Unit) => canEditAnyPower || u.power === activePower,
    [canEditAnyPower, activePower]
  );

  // Build homes map for Adjustments phase
  const controllableBuildHomes = useMemo(() => {
    const homes: Record<string, Power> = {};
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
  }, [isAdjustmentPhase, builds, activePower, canEditAnyPower]);

  // Count how many valid supports each moving/holding unit receives among visible orders
  const supportCountByUnitId = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!isRetreatPhase && !isAdjustmentPhase) {
      for (const u of units) {
        if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
        const o = orders[u.id];
        if (o && o.order_type === 'SUPPORT' && o.aux_unit_origin && o.target) {
          const targetUnit = unitsByProv[o.aux_unit_origin];
          if (targetUnit && isUnitOrderVisible(targetUnit)) {
            const targetOrder = orders[targetUnit.id];
            const isHoldSup = o.aux_unit_origin === o.target;
            if (
              (isHoldSup && (!targetOrder || targetOrder.order_type !== 'MOVE')) ||
              (!isHoldSup && targetOrder?.order_type === 'MOVE' && targetOrder?.target === o.target)
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
  }, [units, orders, unitsByProv, provinces, isUnitOrderVisible, isRetreatPhase, isAdjustmentPhase]);

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
        if (dis && (dis.power === activePower || canEditAnyPower)) {
          onSelectUnit(dis.id);
          setInteractionMode('MOVE');
          return;
        }
        clearSelection();
        return;
      }
      const canControl = u.power === activePower || canEditAnyPower;
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
      const canControl = u.power === activePower || canEditAnyPower;
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
    if (selectedUnit && interactionMode === 'SUPPORT_PICK_UNIT' && u.id !== selectedUnit.id) {
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
    if (selectedUnit && interactionMode === 'CONVOY_PICK_ARMY' && u.unit_type === 'A') {
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
    const canControlClickedUnit = u.power === activePower || canEditAnyPower;
    if (!canControlClickedUnit) {
      if (selectedUnit && reachableMap[u.province] && interactionMode === 'MOVE') {
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
    targetCoast: string | null = null
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

  const handleProvinceClick = (provId: string, explicitCoast: string | null = null) => {
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
      if (occ && (occ.power === activePower || canEditAnyPower) && (builds?.[occ.power]?.count ?? 0) < 0) {
        onSelectUnit(selectedUnitId === occ.id ? null : occ.id);
        return;
      }
      clearSelection();
      return;
    }

    if (isRetreatPhase) {
      if (!selectedUnit) {
        const dis = dislodgedByProv[provId];
        if (dis && (dis.power === activePower || canEditAnyPower)) {
          onSelectUnit(dis.id);
          setInteractionMode('MOVE');
        }
        return;
      }
      if (reachableMap[provId]) {
        const coasts = reachableMap[provId] || [];
        if (selectedUnit.unit_type === 'F' && explicitCoast && coasts.includes(explicitCoast)) {
          commitMoveOrRetreatOrder(selectedUnit, provId, explicitCoast);
          return;
        }
        if (selectedUnit.unit_type === 'F' && coasts.length > 1) {
          setPendingCoastChoice({ target: provId, coasts });
          return;
        }
        const singleCoast =
          selectedUnit.unit_type === 'F' && coasts.length === 1 ? coasts[0] : null;
        commitMoveOrRetreatOrder(selectedUnit, provId, singleCoast);
        return;
      }
      const dis = dislodgedByProv[provId];
      if (dis && (dis.power === activePower || canEditAnyPower)) {
        onSelectUnit(dis.id);
        setInteractionMode('MOVE');
      } else {
        clearSelection();
      }
      return;
    }

    if (!selectedUnit) {
      const occupant = unitsByProv[provId];
      if (occupant && (occupant.power === activePower || canEditAnyPower)) {
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
        (u) => u.unit_type === 'F' && provinces[u.province]?.type === 'SEA'
      );
      const canConvoyMove =
        selectedUnit.unit_type === 'A' &&
        provinces[selectedUnit.province]?.type === 'COAST' &&
        provinces[provId]?.type === 'COAST' &&
        hasFleetInSea;

      if (!isReachable && !canConvoyMove) {
        const occupant = unitsByProv[provId];
        if (occupant && (occupant.power === activePower || canEditAnyPower)) {
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
      if (selectedUnit.unit_type === 'F' && explicitCoast && coasts.includes(explicitCoast)) {
        commitMoveOrRetreatOrder(selectedUnit, provId, explicitCoast);
        return;
      }
      if (selectedUnit.unit_type === 'F' && coasts.length > 1) {
        setPendingCoastChoice({ target: provId, coasts });
        return;
      }
      const singleCoast =
        selectedUnit.unit_type === 'F' && coasts.length === 1 ? coasts[0] : null;
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

  const stableOnClickProvince = useCallback((provId: string, explicitCoast?: string | null) => {
    handleProvinceClickRef.current(provId, explicitCoast ?? null);
  }, []);

  const stableOnHoverProvince = useCallback((provId: string | null) => {
    if (isPanningRef.current) return;
    setHoveredProv(provId);
  }, []);

  // Convert SVG (1524x1357) point to container screen coordinates using current cameraRef
  const svgPointToScreen = useCallback((pt: Point, W: number, H: number): Point => {
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
  }, []);

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
      svgPointToScreen(getProvincePoint(r.province), W, H)
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
      const distToUnit = Math.hypot(centerX - unitScreen.x, centerY - unitScreen.y);
      const score = Math.min(minNeighborDist, distToUnit);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = { x: clampedX, y: clampedY };
      }
    }

    return {
      left: Math.max(10, Math.min(W - menuW - 10, bestCandidate.x + menuDragOffsetRef.current.x)),
      top: Math.max(10, Math.min(H - menuH - 10, bestCandidate.y + menuDragOffsetRef.current.y)),
      anchorLeft: bestCandidate.x,
      anchorTop: bestCandidate.y,
    };
  }, [selectedUnit, selectedBuildProv, reachableList, svgPointToScreen, getUnitPoint, getProvincePoint]);

  // Apply camera transform & floating menu position directly to DOM
  const syncCameraDOM = useCallback(() => {
    const { x, y, zoom: z } = cameraRef.current;
    if (cameraGroupRef.current) {
      cameraGroupRef.current.setAttribute('transform', `translate(${x}, ${y}) scale(${z})`);
    }
    if (floatingMenuRef.current) {
      const pos = getSelectedUnitFloatingPosition();
      if (pos) {
        floatingMenuRef.current.style.left = `${pos.left}px`;
        floatingMenuRef.current.style.top = `${pos.top}px`;
      }
    }
  }, [getSelectedUnitFloatingPosition]);

  const scheduleCameraSync = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncCameraDOM();
    });
  }, [syncCameraDOM]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Native non-passive wheel listener for smooth cursor-anchored zooming
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { x: oldPanX, y: oldPanY, zoom: oldZoom } = cameraRef.current;
      const factor = Math.exp(-e.deltaY * 0.0014);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((oldZoom * factor).toFixed(3))));
      if (newZoom === oldZoom) return;

      const rect = svgEl.getBoundingClientRect();
      const W = rect.width || 980;
      const H = rect.height || 860;
      const scale = Math.min(W / 1524, H / 1357);
      const offsetX = (W - 1524 * scale) / 2;
      const offsetY = (H - 1357 * scale) / 2;

      const cursorSvgX = (e.clientX - rect.left - offsetX) / scale;
      const cursorSvgY = (e.clientY - rect.top - offsetY) / scale;

      const mapPtX = 762 + (cursorSvgX - 762 - oldPanX) / oldZoom;
      const mapPtY = 678 + (cursorSvgY - 678 - oldPanY) / oldZoom;

      const newPanX = cursorSvgX - 762 - (mapPtX - 762) * newZoom;
      const newPanY = cursorSvgY - 678 - (mapPtY - 678) * newZoom;

      cameraRef.current = clampCamera({ x: newPanX, y: newPanY, zoom: newZoom });
      scheduleCameraSync();
      onZoomChange?.(Math.round(cameraRef.current.zoom * 100));
    };

    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', onWheel);
  }, [scheduleCameraSync]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanningRef.current = true;
    svgRef.current?.classList.add('panning');
    dragMovedRef.current = false;
    mouseDownClientRef.current = { x: e.clientX, y: e.clientY };

    const rect = svgRef.current?.getBoundingClientRect();
    const W = rect?.width || 980;
    const H = rect?.height || 860;
    const scale = Math.min(W / 1524, H / 1357) || 1;

    panStartRef.current = {
      x: e.clientX / scale - cameraRef.current.x,
      y: e.clientY / scale - cameraRef.current.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    const dist = Math.hypot(
      e.clientX - mouseDownClientRef.current.x,
      e.clientY - mouseDownClientRef.current.y
    );
    if (dist > 4 && !dragMovedRef.current) {
      dragMovedRef.current = true;
      svgRef.current?.classList.add('actively-dragging');
    }
    if (!dragMovedRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const W = rect?.width || 980;
    const H = rect?.height || 860;
    const scale = Math.min(W / 1524, H / 1357) || 1;

    const rawX = e.clientX / scale - panStartRef.current.x;
    const rawY = e.clientY / scale - panStartRef.current.y;
    const clamped = clampCamera({
      x: rawX,
      y: rawY,
      zoom: cameraRef.current.zoom,
    });

    if (rawX !== clamped.x) {
      panStartRef.current.x = e.clientX / scale - clamped.x;
    }
    if (rawY !== clamped.y) {
      panStartRef.current.y = e.clientY / scale - clamped.y;
    }

    cameraRef.current.x = clamped.x;
    cameraRef.current.y = clamped.y;
    scheduleCameraSync();
  };

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      svgRef.current?.classList.remove('panning', 'actively-dragging');
    }
  };

  // The cursor stays over the menu during a drag, so the map's own handlers never see it.
  // Capturing the pointer sends every move and the release to the header instead, wherever
  // the cursor goes. A capture also takes the click, so buttons in the header must not start one.
  const handleMenuDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const pos = getSelectedUnitFloatingPosition();
    if (pos) {
      // Start from where the menu is, since an earlier drag may have run past the map edge
      menuDragOffsetRef.current = { x: pos.left - pos.anchorLeft, y: pos.top - pos.anchorTop };
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

  const stepZoom = useCallback((delta: number) => {
    const oldZoom = cameraRef.current.zoom;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((oldZoom + delta).toFixed(2))));
    cameraRef.current = clampCamera({
      x: cameraRef.current.x,
      y: cameraRef.current.y,
      zoom: newZoom,
    });
    syncCameraDOM();
    onZoomChange?.(Math.round(cameraRef.current.zoom * 100));
  }, [syncCameraDOM, onZoomChange]);

  const resetCamera = useCallback(() => {
    cameraRef.current = clampCamera({ ...DEFAULT_CAMERA });
    syncCameraDOM();
    onZoomChange?.(Math.round(DEFAULT_CAMERA.zoom * 100));
  }, [syncCameraDOM, onZoomChange]);

  useImperativeHandle(
    ref,
    () => ({
      stepZoom,
      resetCamera,
      getZoom: () => cameraRef.current.zoom,
    }),
    [stepZoom, resetCamera]
  );

  useEffect(() => {
    onZoomChange?.(Math.round(cameraRef.current.zoom * 100));
  }, [onZoomChange]);

  const floatingPos = getSelectedUnitFloatingPosition();
  const activeOrderButton = getActiveOrderButton(
    interactionMode,
    selectedUnit ? orders[selectedUnit.id] : undefined,
    moveModeChosen
  );

  // Precompute Move midpoints so Support arrows point directly to the move arrow they support
  const moveMidpointsByOrigin = useMemo(() => {
    const midpoints: Record<string, Point> = {};
    for (const u of units) {
      if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
      const o = orders[u.id];
      if (o && o.order_type === 'MOVE' && o.target && EUROPE_PROVINCE_GEOMETRY[o.target]) {
        const p1 = getUnitPoint(u);
        const p2 = getProvincePoint(o.target, o.target_coast);
        const { mid } = computeQuadraticCurve(p1, p2, 0.14, arrowScale);
        midpoints[u.province] = mid;
      }
    }
    return midpoints;
  }, [units, orders, isUnitOrderVisible, getUnitPoint, getProvincePoint, arrowScale]);

  return (
    <div ref={containerRef} className="map-viewport-container">
      {/* Live Hypothetical / Simulation Active Banner */}
      {(showSimulationOverlay || sandboxMode) && simulationResult && (
        <div className="simulation-map-banner">
          <Eye size={16} />
          <span>
            <strong>HYPOTHETICAL PLANNING &amp; OUTCOME PREVIEW</strong> — Foreign guesses are discarded upon exit
          </span>
          <button
            className="sim-advance-btn"
            onClick={onAdjudicateTurn}
            title="Step forward one phase in Sandbox to plan follow-up turns"
          >
            <Play size={12} /> Step Turn Forward
          </button>
          {showSimulationOverlay && !sandboxMode && (
            <button className="sim-close-btn" onClick={onClearSimulationOverlay}>
              Hide Preview
            </button>
          )}
        </div>
      )}

      {overlay}

      {/* Coast Disambiguation Popup */}
      {selectedUnit && pendingCoastChoice && (
        <div
          className="coast-picker-modal"
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
                onClick={() => commitMoveOrRetreatOrder(selectedUnit, pendingCoastChoice.target, c)}
              >
                {pendingCoastChoice.target}/{c} Coast
              </button>
            ))}
            <button className="coast-cancel-btn" onClick={() => setPendingCoastChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR BUILD SLOTS IN WINTER ADJUSTMENTS) */}
      {selectedBuildProv && selectedUnitId && floatingPos && (
        <div
          ref={floatingMenuRef}
          className="unit-floating-menu"
          style={{
            left: floatingPos.left,
            top: floatingPos.top,
            borderColor: '#22c55e',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="floating-menu-header"
            title="Drag to move this menu anywhere"
            onPointerDown={handleMenuDragStart}
            onPointerMove={handleMenuDragMove}
            onLostPointerCapture={handleMenuDragEnd}
          >
            <div className="floating-unit-title">
              <GripHorizontal size={13} className="floating-drag-grip" />
              <PlusCircle size={13} style={{ color: '#4ade80' }} />
              <strong>Build in {provinces[selectedBuildProv]?.name}</strong>
            </div>
            <button className="floating-close-btn" onClick={clearSelection} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>

          <div className="floating-menu-buttons">
            <button
              className={`tactical-mode-btn ${
                selectedBuildOrder?.order_type === 'BUILD' && selectedBuildOrder?.unit_type === 'A'
                  ? 'active-hold'
                  : ''
              }`}
              onClick={() => {
                const buildPwr = controllableBuildHomes[selectedBuildProv] || activePower;
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
              <Swords size={13} />
              + Army
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
                      const buildPwr = controllableBuildHomes[selectedBuildProv] || activePower;
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
                    <Anchor size={13} />
                    + F ({cst})
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
                    const buildPwr = controllableBuildHomes[selectedBuildProv] || activePower;
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
                  <Anchor size={13} />
                  + Fleet
                </button>
              ))}

            <button
              className={`tactical-mode-btn ${
                selectedBuildOrder?.order_type === 'WAIVE' ? 'active' : ''
              }`}
              onClick={() => {
                const buildPwr = controllableBuildHomes[selectedBuildProv] || activePower;
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
            Choose unit type to build in {provinces[selectedBuildProv]?.name} or Waive
          </div>
        </div>
      )}

      {/* DRAGGABLE COMPACT FLOATING TACTICAL MENU (FOR UNITS) */}
      {selectedUnit && floatingPos && (
        <div
          ref={floatingMenuRef}
          className="unit-floating-menu"
          style={{
            left: floatingPos.left,
            top: floatingPos.top,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="floating-menu-header"
            title="Drag to move this menu anywhere"
            onPointerDown={handleMenuDragStart}
            onPointerMove={handleMenuDragMove}
            onLostPointerCapture={handleMenuDragEnd}
          >
            <div className="floating-unit-title">
              <GripHorizontal size={13} className="floating-drag-grip" />
              <span
                className="tactical-power-dot"
                style={{ backgroundColor: POWER_METADATA[selectedUnit.power].color }}
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
            </button>
          </div>

          {isRetreatPhase ? (
            <>
              <div className="floating-menu-buttons" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  className={`tactical-mode-btn ${
                    orders[selectedUnit.id]?.order_type === 'RETREAT' ? 'active' : ''
                  }`}
                  onClick={() => setInteractionMode('MOVE')}
                >
                  <MoveRight size={13} />
                  Retreat
                </button>
                <button
                  className={`tactical-mode-btn ${
                    orders[selectedUnit.id]?.order_type === 'DISBAND' ? 'active' : ''
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
                Click a green province on the map to Retreat, or click Disband
              </div>
            </>
          ) : isAdjustmentPhase ? (
            <>
              <div className="floating-menu-buttons" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  className={`tactical-mode-btn ${
                    orders[selectedUnit.id]?.order_type !== 'DISBAND' ? 'active-hold' : ''
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
                    orders[selectedUnit.id]?.order_type === 'DISBAND' ? 'active' : ''
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
                Choose whether to Keep or Disband this unit for Winter Adjustments
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
                {interactionMode === 'MOVE' && 'Click a green province to Move • Drag header to move'}
                {interactionMode === 'SUPPORT_PICK_UNIT' && 'Step 1/2: Click unit to Support'}
                {interactionMode === 'SUPPORT_PICK_TARGET' &&
                  `Step 2/2: Click destination for ${pendingAuxOrigin} (or click ${pendingAuxOrigin} to Hold)`}
                {interactionMode === 'CONVOY_PICK_ARMY' && 'Step 1/2: Click coastal Army to Convoy'}
                {interactionMode === 'CONVOY_PICK_TARGET' &&
                  `Step 2/2: Click destination coast for Army ${pendingAuxOrigin}`}
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
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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
              const isBuildableHome = Boolean(isAdjustmentPhase && controllableBuildHomes[geom.id]);
              const isReachable =
                Boolean(selectedUnit && reachableMap[geom.id]) || isBuildableHome;
              const allowedCoastsStr =
                selectedUnit && reachableMap[geom.id]
                  ? (reachableMap[geom.id] || []).join(',')
                  : '';
              const showFleetCoasts = Boolean(
                selectedUnit && selectedUnit.unit_type === 'F' && reachableMap[geom.id]
              );
              const showMoveReticle = Boolean(
                selectedUnit && reachableMap[geom.id] && interactionMode === 'MOVE'
              );
              const isHovered = hoveredProv === geom.id;
              const isHighlighted =
                highlightedProvinces.includes(geom.id) || selectedBuildProv === geom.id;
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
              if (!o || o.order_type !== 'CONVOY' || !o.aux_unit_origin || !o.target)
                return null;
              const fleetPt = getUnitPoint(u);
              const armyPt = getProvincePoint(o.aux_unit_origin);
              const destPt = getProvincePoint(o.target);
              const hasIssue = Boolean(issuesByUnit[u.id]?.length);

              return (
                <g key={`convoy_${u.id}`} pointerEvents="none">
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
              if (!o || o.order_type !== 'SUPPORT' || !o.aux_unit_origin || !o.target)
                return null;

              const supporterPt = getUnitPoint(u);
              const isSupportHold = o.aux_unit_origin === o.target;
              const targetPoint =
                !isSupportHold && moveMidpointsByOrigin[o.aux_unit_origin]
                  ? moveMidpointsByOrigin[o.aux_unit_origin]
                  : getProvincePoint(o.target);

              const unitIssues = issuesByUnit[u.id] || [];
              const hasError = unitIssues.some((i) => i.severity === 'error');
              const hasWarn = unitIssues.some((i) => i.severity === 'warning');
              const simActive = showSimulationOverlay || sandboxMode;
              const simRes = simActive ? simulationResult?.resolutions[u.id] : null;

              const strokeColor = hasError
                ? '#dc2626'
                : simRes?.cut
                ? '#e11d48'
                : hasWarn
                ? '#f59e0b'
                : '#0d9488';

              return (
                <g key={`support_${u.id}`} pointerEvents="none">
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
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="9.5" fontWeight="800">
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
              const { path, mid } = computeQuadraticCurve(p1, p2, 0.14, arrowScale);

              const unitIssues = issuesByUnit[u.id] || [];
              const hasError = unitIssues.some((i) => i.severity === 'error');
              const hasWarn = unitIssues.some((i) => i.severity === 'warning');
              const supCount = supportCountByUnitId[u.id] || 0;
              const isSelectedOrHovered = u.id === selectedUnitId || u.id === hoveredUnitId;

              const simActive = showSimulationOverlay || sandboxMode;
              const simRes = simActive ? simulationResult?.resolutions[u.id] : null;

              let strokeColor =
                o.order_type === 'RETREAT' ? '#ea580c' : POWER_METADATA[u.power].color;
              let markerId =
                o.order_type === 'RETREAT' ? 'url(#arrow-warning)' : 'url(#arrow-valid)';
              let dashArray: string | undefined =
                o.order_type === 'RETREAT' ? '8 4' : o.via_convoy ? '10 5' : undefined;

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

              const strokeWidth = 4.5 + supCount * 1.8 + (isSelectedOrHovered ? 1.2 : 0);
              const meta = POWER_METADATA[u.power];
              const ghostPiece = describePiece(o.target, o.target_coast, false);

              return (
                <g key={`move_${u.id}`} pointerEvents="none">
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
                    <g transform={`translate(${p2.x}, ${p2.y})`} opacity="0.88">
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
                        hasStar={Boolean(provinces[o.target]?.is_supply_center)}
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
              {Object.entries(controllableBuildHomes).map(([homeProv, pwr]) => {
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
                    <PieceHitArea frame={buildPiece.frame} />
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
                      fill={isWaived ? 'rgba(100, 116, 139, 0.2)' : 'rgba(22, 163, 74, 0.22)'}
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
                          hasStar={Boolean(provinces[homeProv]?.is_supply_center)}
                        />
                        <g transform={`translate(0, ${buildPiece.frame.bannerY})`}>
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
                      <g transform={`translate(0, ${buildPiece.frame.bannerY})`}>
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
              })}
            </g>
          )}

          {/* 7. UNITS LAYER (Armies & Fleets + Hold Halos + Warning Badges + Dislodged/Disband Tags) */}
          <g className="units-layer">
            {units.map((u) => {
              const pt = getUnitPoint(u);
              const meta = POWER_METADATA[u.power];
              const order = orders[u.id];
              const isControllable = u.power === activePower || canEditAnyPower;
              const isSelected = Boolean(selectedUnit && u.id === selectedUnit.id);
              const isHovered = u.id === hoveredUnitId && isControllable;
              const unitIssues = isUnitOrderVisible(u) ? issuesByUnit[u.id] || [] : [];
              const topSeverity: IssueSeverity | null = unitIssues.some(
                (i) => i.severity === 'error'
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
                  order.is_explicit
              );
              const holdSupCount = isHold ? supportCountByUnitId[u.id] || 0 : 0;

              const simActive = showSimulationOverlay || sandboxMode;
              const simRes =
                simActive && isUnitOrderVisible(u)
                  ? simulationResult?.resolutions[u.id]
                  : null;
              const isAdvancingInSim = Boolean(
                simActive &&
                  isUnitOrderVisible(u) &&
                  order?.order_type === 'MOVE' &&
                  simRes?.succeeded
              );

              // A dislodged unit stepped aside, so the star stays with the unit holding the province
              const carriesStar =
                (pieceStyle === 'seated' || pieceStyle === 'nameplate') &&
                Boolean(provinces[u.province]?.is_supply_center) &&
                !(u.is_dislodged && unitsByProv[u.province]);
              const { frame, flagDirection } = describePiece(u.province, u.coast, carriesStar);
              const steppedAside = Boolean(u.is_dislodged && unitsByProv[u.province]);
              const bannerY = steppedAside ? frame.steppedAsideBannerY : frame.bannerY;

              return (
                <g
                  key={u.id}
                  transform={`translate(${pt.x}, ${pt.y})`}
                  className={`map-unit-token ${isSelected ? 'selected' : ''} ${
                    isHovered ? 'hovered' : ''
                  } ${!isControllable ? 'foreign-locked' : ''}`}
                  opacity={isAdvancingInSim && !isSelected ? 0.62 : 1}
                  onClick={(e) => handleSelectUnitOnMap(u, e)}
                  onPointerEnter={(e) => {
                    if (isControllable && e.pointerType !== 'touch') onHoverUnit(u.id);
                  }}
                  onPointerLeave={(e) => {
                    if (e.pointerType !== 'touch') onHoverUnit(null);
                  }}
                >
                  <PieceHitArea frame={frame} />

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
                    <PieceOutline
                      frame={frame}
                      radius={24}
                      fill="rgba(234, 88, 12, 0.28)"
                      stroke="#ea580c"
                      strokeWidth="3"
                      strokeDasharray="5 3"
                    />
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
                  {u.power === activePower && !isSelected && !u.is_dislodged && (
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
                    rim={u.is_dislodged ? '#fdba74' : isDisbanding ? '#fca5a5' : '#fef3c7'}
                    frame={frame}
                    flagDirection={flagDirection}
                    hasStar={Boolean(provinces[u.province]?.is_supply_center)}
                    showStar={carriesStar}
                    starOwnerColor={getStarOwnerColor(u.province)}
                  />

                  {holdSupCount > 0 && (
                    <g transform={`translate(${frame.badgeLeft.x}, ${frame.badgeLeft.y})`}>
                      <circle r="9" fill="#0f766e" stroke="#fef3c7" strokeWidth="1.5" />
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
                        +{holdSupCount}
                      </text>
                    </g>
                  )}

                  {topSeverity && (
                    <g transform={`translate(${frame.badgeRight.x}, ${frame.badgeRight.y})`}>
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

                  {(u.is_dislodged || (simActive && simRes?.dislodged)) && !isDisbanding && (
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
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="800">
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
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="8.5" fontWeight="800">
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
    </div>
  );
});
