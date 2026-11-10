import {
  type Order,
  POWER_METADATA,
  type Unit,
} from '../../../../types/diplomacy';
import { MapPiece, PieceOutline } from '../../../MapPiece';
import { computeQuadraticCurve } from '../../utils/curveGeometry';
import type { OrderLayerContext } from './orderLayerContext';

/**
 * A move or retreat arrow, thicker for each support it receives, coloured by its issues or simulated
 * outcome, with a +N support badge, a BOUNCED tag and a ghost piece where a simulated move lands.
 */
export function MoveArrow({
  unit,
  order,
  target,
  ctx,
}: {
  unit: Unit;
  order: Order;
  /** The order's target, checked by the layer. */
  target: string;
  ctx: OrderLayerContext;
}) {
  const {
    getUnitPoint,
    getProvincePoint,
    issuesByUnit,
    arrowScale,
    supportCountByUnitId,
    selectedUnitId,
    hoveredUnitId,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
    describePiece,
    pieceStyle,
    unitMark,
    provinces,
  } = ctx;
  const p1 = getUnitPoint(unit);
  const p2 = getProvincePoint(target, order.target_coast);
  const { path, mid } = computeQuadraticCurve(p1, p2, 0.14, arrowScale);

  const unitIssues = issuesByUnit[unit.id] || [];
  const hasError = unitIssues.some((i) => i.severity === 'error');
  const hasWarn = unitIssues.some((i) => i.severity === 'warning');
  const supCount = supportCountByUnitId[unit.id] || 0;
  const isSelectedOrHovered =
    unit.id === selectedUnitId || unit.id === hoveredUnitId;

  const simActive = showSimulationOverlay || sandboxMode;
  const simRes = simActive ? simulationResult?.resolutions[unit.id] : null;

  let strokeColor =
    order.order_type === 'RETREAT'
      ? '#ea580c'
      : POWER_METADATA[unit.power].color;
  let markerId =
    order.order_type === 'RETREAT'
      ? 'url(#arrow-warning)'
      : 'url(#arrow-valid)';
  let dashArray: string | undefined =
    order.order_type === 'RETREAT'
      ? '8 4'
      : order.via_convoy
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

  const strokeWidth = 4.5 + supCount * 1.8 + (isSelectedOrHovered ? 1.2 : 0);
  const meta = POWER_METADATA[unit.power];
  const ghostPiece = describePiece(target, order.target_coast, false);

  return (
    <g
      pointerEvents="none"
      data-testid="order-arrow"
      data-order-unit={unit.id}
      data-order-type={order.order_type}
      data-order-target={target || ''}
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
            unitType={unit.unit_type}
            color={meta.color}
            variant="ghost"
            rim="#34d399"
            frame={ghostPiece.frame}
            flagDirection={ghostPiece.flagDirection}
            hasStar={Boolean(provinces[target]?.is_supply_center)}
          />
        </g>
      )}
    </g>
  );
}
