import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
} from '../utils/orderHelpers';
import {
  clampCamera,
  DEFAULT_CAMERA,
  MAX_ZOOM,
  MIN_ZOOM,
} from '../utils/mapCameraHelpers';
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
          data-testid="province-path"
          data-province-id={geom.id}
          onClick={() => onClickProvince(geom.id)}
          onMouseEnter={() => onHoverProvince(geom.id)}
          onMouseLeave={() => onHoverProvince(null)}
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
                data-testid="province-coast-selector"
                data-province-id={geom.id}
                data-coast={coastKey}
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
            data-testid="reachable-reticle"
            data-province-id={geom.id}
            onClick={(e) => {
              e.stopPropagation();
              onClickProvince(geom.id);
            }}
          >
            <circle
              cx={geom.unitPos.x}
              cy={geom.unitPos.y}
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

const SupplyCentersLayer = memo<{
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
}>(({ provinces, ownership }) => (
  <g className="supply-centers-layer" pointerEvents="none">
    {ALL_PROVINCE_GEOMETRIES.map((geom) => {
      const pInfo = provinces[geom.id];
      if (!pInfo || !pInfo.is_supply_center || !geom.scPos) return null;
      const owner = ownership[geom.id] || pInfo.home_power;
      return (
        <g
          key={`sc_${geom.id}`}
          transform={`translate(${geom.scPos.x}, ${geom.scPos.y})`}
        >
          <circle
            r="8.5"
            fill={owner ? POWER_METADATA[owner].color : '#fef3c7'}
            stroke="#1c1917"
            strokeWidth="2"
          />
          <polygon
            points="0,-5.8 1.6,-1.7 6,-1.7 2.5,1.1 3.8,5.4 0,2.8 -3.8,5.4 -2.5,1.1 -6,-1.7 -1.6,-1.7"
            fill={owner ? '#fde047' : '#57534e'}
          />
        </g>
      );
    })}
  </g>
));

function getBaseUnitPoint(unit: Unit): Point {
  const geom = EUROPE_PROVINCE_GEOMETRY[unit.province];
  if (!geom) return { x: 760, y: 680 };
  if (unit.coast && geom.coastPositions && geom.coastPositions[unit.coast]) {
    return geom.coastPositions[unit.coast];
  }
  return geom.unitPos;
}

function getProvincePoint(provCode: string, coast?: string | null): Point {
  const geom = EUROPE_PROVINCE_GEOMETRY[provCode];
  if (!geom) return { x: 760, y: 680 };
  if (coast && geom.coastPositions && geom.coastPositions[coast]) {
    return geom.coastPositions[coast];
  }
  return geom.unitPos;
}

function computeQuadraticCurve(
  p1: Point,
  p2: Point,
  curvature = 0.14
): { path: string; mid: Point } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const shrink = Math.min(26, dist * 0.22);
  const startShrink = Math.min(18, dist * 0.15);
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
  const isDraggingMenuRef = useRef<boolean>(false);
  const menuDragStartRef = useRef<Point>({ x: 0, y: 0 });

  const [hoveredProv, setHoveredProv] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<MapInteractionMode>('MOVE');
  const [pendingAuxOrigin, setPendingAuxOrigin] = useState<string | null>(null);
  const [pendingCoastChoice, setPendingCoastChoice] = useState<{
    target: string;
    coasts: string[];
  } | null>(null);

  // Reset menu drag offset whenever a different unit is selected
  useEffect(() => {
    menuDragOffsetRef.current = { x: 0, y: 0 };
  }, [selectedUnitId]);

  const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
  const isRetreatPhase = phase === 'Retreats';

  const unitsByProv: Record<string, Unit> = {};
  const dislodgedByProv: Record<string, Unit> = {};
  const unitsById: Record<string, Unit> = {};
  for (const u of units) {
    if (u.is_dislodged) {
      dislodgedByProv[u.province] = u;
    } else {
      unitsByProv[u.province] = u;
    }
    unitsById[u.id] = u;
  }

  const getUnitPoint = useCallback(
    (unit: Unit): Point => {
      const basePt = getBaseUnitPoint(unit);
      if (unit.is_dislodged && unitsByProv[unit.province]) {
        return { x: basePt.x + 22, y: basePt.y - 18 };
      }
      return basePt;
    },
    [unitsByProv]
  );

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

  const reachableList = selectedUnit
    ? isRetreatPhase
      ? getValidRetreatDestinations(selectedUnit, retreats, provinces)
      : isAdjustmentPhase
      ? []
      : getReachableDestinations(selectedUnit, provinces)
    : [];
  const reachableMap: Record<string, string[]> = {};
  for (const r of reachableList) {
    reachableMap[r.province] = r.coasts;
  }

  // Only show issues for activePower unless foreign units can be edited
  const visibleIssues = canEditAnyPower
    ? issues
    : issues.filter((i) => i.power === activePower);

  const issuesByUnit: Record<string, ValidationIssue[]> = {};
  const issuesByProvince: Record<string, ValidationIssue[]> = {};
  for (const iss of visibleIssues) {
    for (const uid of iss.unit_ids) {
      if (!issuesByUnit[uid]) issuesByUnit[uid] = [];
      issuesByUnit[uid].push(iss);
    }
    for (const pid of iss.provinces) {
      if (!issuesByProvince[pid]) issuesByProvince[pid] = [];
      issuesByProvince[pid].push(iss);
    }
  }

  // Filter which units' orders are visible on the map:
  const isUnitOrderVisible = (u: Unit) => canEditAnyPower || u.power === activePower;

  // Build homes map for Adjustments phase
  const controllableBuildHomes: Record<string, Power> = {};
  if (isAdjustmentPhase && builds) {
    for (const [pwrStr, bInfo] of Object.entries(builds)) {
      const pwr = pwrStr as Power;
      if (bInfo.count > 0 && (pwr === activePower || canEditAnyPower)) {
        for (const h of bInfo.homes) {
          controllableBuildHomes[h] = pwr;
        }
      }
    }
  }

  // Count how many valid supports each moving/holding unit receives among visible orders
  const supportCountByUnitId: Record<string, number> = {};
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
              supportCountByUnitId[targetUnit.id] = (supportCountByUnitId[targetUnit.id] || 0) + 1;
            }
          }
        }
      }
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
    };
  }, [selectedUnit, selectedBuildProv, reachableList, svgPointToScreen, getUnitPoint]);

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
    if (isDraggingMenuRef.current) {
      menuDragOffsetRef.current = {
        x: e.clientX - menuDragStartRef.current.x,
        y: e.clientY - menuDragStartRef.current.y,
      };
      scheduleCameraSync();
      return;
    }
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
    if (isDraggingMenuRef.current) {
      isDraggingMenuRef.current = false;
      floatingMenuRef.current?.classList.remove('dragging');
    }
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

  // Precompute Move midpoints so Support arrows point directly to the move arrow they support
  const moveMidpointsByOrigin: Record<string, Point> = {};
  for (const u of units) {
    if (!isUnitOrderVisible(u) || u.is_dislodged) continue;
    const o = orders[u.id];
    if (o && o.order_type === 'MOVE' && o.target && EUROPE_PROVINCE_GEOMETRY[o.target]) {
      const p1 = getUnitPoint(u);
      const p2 = getProvincePoint(o.target, o.target_coast);
      const { mid } = computeQuadraticCurve(p1, p2, 0.14);
      moveMidpointsByOrigin[u.province] = mid;
    }
  }

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
            onMouseDown={(e) => {
              e.stopPropagation();
              isDraggingMenuRef.current = true;
              floatingMenuRef.current?.classList.add('dragging');
              menuDragStartRef.current = {
                x: e.clientX - menuDragOffsetRef.current.x,
                y: e.clientY - menuDragOffsetRef.current.y,
              };
            }}
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
            onMouseDown={(e) => {
              e.stopPropagation();
              isDraggingMenuRef.current = true;
              floatingMenuRef.current?.classList.add('dragging');
              menuDragStartRef.current = {
                x: e.clientX - menuDragOffsetRef.current.x,
                y: e.clientY - menuDragOffsetRef.current.y,
              };
            }}
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
                  className={`tactical-mode-btn ${interactionMode === 'MOVE' ? 'active' : ''}`}
                  onClick={() => {
                    setInteractionMode('MOVE');
                    setPendingAuxOrigin(null);
                  }}
                >
                  <MoveRight size={13} />
                  Move
                </button>

                <button
                  className={`tactical-mode-btn ${
                    orders[selectedUnit.id]?.order_type === 'HOLD' &&
                    orders[selectedUnit.id]?.is_explicit
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
                  Hold
                </button>

                <button
                  className={`tactical-mode-btn ${
                    interactionMode.startsWith('SUPPORT') ? 'active' : ''
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
                        interactionMode.startsWith('CONVOY') ? 'active' : ''
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
          <StaticNamesLayer />

          {/* 5. SUPPLY CENTER STAR EMBLEMS (34 Supply Centers) */}
          <SupplyCentersLayer provinces={provinces} ownership={ownership} />

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
                <g key={`convoy_${u.id}`} pointerEvents="none" data-testid="order-arrow" data-order-unit={u.id} data-order-type="CONVOY" data-order-target={o.target || ""}>
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
                    r="26"
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
                <g key={`support_${u.id}`} pointerEvents="none" data-testid="order-arrow" data-order-unit={u.id} data-order-type="SUPPORT" data-order-target={o.target || ""}>
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
                    r={isSupportHold ? 24 : 8}
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
              const { path, mid } = computeQuadraticCurve(p1, p2, 0.14);

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

              return (
                <g key={`move_${u.id}`} pointerEvents="none" data-testid="order-arrow" data-order-unit={u.id} data-order-type={o.order_type} data-order-target={o.target || ""}>
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
                      <circle
                        r="22"
                        fill="rgba(16, 185, 129, 0.22)"
                        stroke="#10b981"
                        strokeWidth="2.5"
                        strokeDasharray="4 3"
                      />
                      {u.unit_type === 'A' ? (
                        <circle
                          r="15"
                          fill={meta.color}
                          stroke="#34d399"
                          strokeWidth="2.5"
                        />
                      ) : (
                        <polygon
                          points="0,-17 16,-6 12,13 -12,13 -16,-6"
                          fill={meta.color}
                          stroke="#34d399"
                          strokeWidth="2.5"
                        />
                      )}
                      <text
                        y="5"
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="12.5"
                        fontWeight="800"
                        fontFamily="Cinzel, serif"
                      >
                        {u.unit_type}
                      </text>
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
                    onMouseEnter={() => onHoverUnit(bId)}
                    onMouseLeave={() => onHoverUnit(null)}
                  >
                    {(isSelected || isHovered) && (
                      <circle
                        r="28"
                        fill="rgba(34, 197, 94, 0.25)"
                        stroke="#22c55e"
                        strokeWidth="3.5"
                      />
                    )}
                    <circle
                      r="23"
                      fill={isWaived ? 'rgba(100, 116, 139, 0.2)' : 'rgba(22, 163, 74, 0.22)'}
                      stroke={isWaived ? '#64748b' : '#16a34a'}
                      strokeWidth="2.6"
                      strokeDasharray="5 3"
                    />
                    {!isWaived ? (
                      <>
                        {uType === 'A' ? (
                          <circle
                            r="16"
                            fill={meta.color}
                            stroke="#4ade80"
                            strokeWidth="2.8"
                          />
                        ) : (
                          <polygon
                            points="0,-18 17,-6 13,14 -13,14 -17,-6"
                            fill={meta.color}
                            stroke="#4ade80"
                            strokeWidth="2.8"
                          />
                        )}
                        <text
                          y="5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="12.5"
                          fontWeight="800"
                          fontFamily="Cinzel, serif"
                          pointerEvents="none"
                        >
                          +{uType}
                        </text>
                        <g transform="translate(0, 26)">
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
                      <g transform="translate(0, 26)">
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
                  onMouseEnter={() => {
                    if (isControllable) onHoverUnit(u.id);
                  }}
                  onMouseLeave={() => onHoverUnit(null)}
                >
                  {(isSelected || isHovered) && (
                    <circle
                      r="27"
                      fill="rgba(245, 158, 11, 0.22)"
                      stroke="#f59e0b"
                      strokeWidth="3.5"
                      strokeDasharray={isSelected ? undefined : '5 3'}
                    />
                  )}

                  {u.is_dislodged && (
                    <circle
                      data-testid="dislodged-unit-indicator"
                      data-unit-id={u.id}
                      r="24"
                      fill="rgba(234, 88, 12, 0.28)"
                      stroke="#ea580c"
                      strokeWidth="3"
                      strokeDasharray="5 3"
                    />
                  )}

                  {isDisbanding && (
                    <circle
                      r="24"
                      fill="rgba(220, 38, 38, 0.28)"
                      stroke="#dc2626"
                      strokeWidth="3"
                      strokeDasharray="4 3"
                    />
                  )}

                  {/* Active Power Subtle Ring so your own units stand out clearly */}
                  {u.power === activePower && !isSelected && !u.is_dislodged && (
                    <circle
                      r="21"
                      fill="none"
                      stroke="#fef08a"
                      strokeWidth="2"
                      opacity="0.75"
                    />
                  )}

                  {isHold && !u.is_dislodged && isUnitOrderVisible(u) && (
                    <polygon
                      points="0,-22 16,-16 22,0 16,16 0,22 -16,16 -22,0 -16,-16"
                      fill="none"
                      stroke={isExplicitHold ? '#eab308' : '#1e293b'}
                      strokeWidth={isExplicitHold ? '2.8' : '1.6'}
                      strokeDasharray={isExplicitHold ? undefined : '4 3'}
                      opacity={isExplicitHold ? 0.95 : 0.65}
                    />
                  )}

                  {u.unit_type === 'A' ? (
                    <g>
                      <circle cx="0" cy="3.2" r="18.2" fill="rgba(15, 23, 42, 0.52)" />
                      <circle
                        r="17"
                        fill={meta.color}
                        stroke={u.is_dislodged ? '#fdba74' : isDisbanding ? '#fca5a5' : '#fef3c7'}
                        strokeWidth="2.8"
                      />
                    </g>
                  ) : (
                    <g>
                      <polygon
                        points="0,-15.8 19,-3.8 15,18.2 -15,18.2 -19,-3.8"
                        fill="rgba(15, 23, 42, 0.52)"
                      />
                      <polygon
                        points="0,-19 18,-7 14,15 -14,15 -18,-7"
                        fill={meta.color}
                        stroke={u.is_dislodged ? '#fdba74' : isDisbanding ? '#fca5a5' : '#fef3c7'}
                        strokeWidth="2.8"
                      />
                    </g>
                  )}

                  <text
                    y="5.5"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="14.5"
                    fontWeight="800"
                    fontFamily="Cinzel, serif"
                    pointerEvents="none"
                  >
                    {u.unit_type}
                  </text>

                  {holdSupCount > 0 && (
                    <g transform="translate(-17, -17)">
                      <circle r="9" fill="#0f766e" stroke="#fef3c7" strokeWidth="1.5" />
                      <text y="3.5" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">
                        +{holdSupCount}
                      </text>
                    </g>
                  )}

                  {topSeverity && (
                    <g transform="translate(16, -16)">
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
                    <g transform="translate(0, 26)">
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
                    <g transform="translate(0, 26)">
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
