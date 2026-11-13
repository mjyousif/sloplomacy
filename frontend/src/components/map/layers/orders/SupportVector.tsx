import type { Unit } from '../../../../types/diplomacy';
import { computeQuadraticCurve } from '../../utils/curveGeometry';
import type { OrderLayerContext } from './orderLayerContext';

/** A support line to the supported unit, or to the middle of the move it supports, with CUT when a simulation cuts it. */
export function SupportVector({
  unit,
  target,
  auxOrigin,
  supportedUnit,
  hasVisibleMove = false,
  drawProjectedMove = false,
  projectedSupportCount = 1,
  ctx,
}: {
  unit: Unit;
  /** The order's target, checked by the layer. */
  target: string;
  /** The unit the order is for, checked by the layer. */
  auxOrigin: string;
  /** The unit standing at auxOrigin, if any. */
  supportedUnit?: Unit;
  /** True when the supported unit already has a visible MOVE arrow to target. */
  hasVisibleMove?: boolean;
  /** True when this SupportVector should render the projected auxOrigin -> target arrow and +N badge. */
  drawProjectedMove?: boolean;
  /** Number of visible supports targeting this projected (auxOrigin -> target) move. */
  projectedSupportCount?: number;
  ctx: OrderLayerContext;
}) {
  const {
    getUnitPoint,
    getProvincePoint,
    issuesByUnit,
    pieceRingScale,
    arrowScale,
    moveMidpointsByOrigin,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
  } = ctx;
  const supporterPt = getUnitPoint(unit);
  const isSupportHold = auxOrigin === target;
  const matchingMoveMid =
    !isSupportHold && hasVisibleMove ? moveMidpointsByOrigin[auxOrigin] : null;
  const projectedMove =
    !isSupportHold && !matchingMoveMid
      ? computeQuadraticCurve(
          supportedUnit
            ? getUnitPoint(supportedUnit)
            : getProvincePoint(auxOrigin),
          getProvincePoint(target),
          0.14,
          arrowScale,
        )
      : null;
  const targetPoint = isSupportHold
    ? getProvincePoint(target)
    : (matchingMoveMid ?? projectedMove?.mid ?? getProvincePoint(target));

  const unitIssues = issuesByUnit[unit.id] || [];
  const hasError = unitIssues.some((i) => i.severity === 'error');
  const hasWarn = unitIssues.some((i) => i.severity === 'warning');
  const simActive = showSimulationOverlay || sandboxMode;
  const simRes = simActive ? simulationResult?.resolutions[unit.id] : null;

  const strokeColor = hasError
    ? '#dc2626'
    : simRes?.cut
      ? '#e11d48'
      : hasWarn
        ? '#f59e0b'
        : '#0d9488';
  const projectedMarkerId = hasError
    ? 'url(#arrow-error)'
    : simRes?.cut
      ? 'url(#arrow-sim-bounce)'
      : hasWarn
        ? 'url(#arrow-warning)'
        : 'url(#arrow-support)';

  return (
    <g
      pointerEvents="none"
      data-testid="order-arrow"
      data-order-unit={unit.id}
      data-order-type="SUPPORT"
      data-order-target={target || ''}
    >
      {projectedMove && drawProjectedMove && (
        <g data-testid="projected-support-move">
          <path
            d={projectedMove.path}
            fill="none"
            stroke="#fef3c7"
            strokeWidth="6.5"
            strokeOpacity="0.85"
            strokeLinecap="round"
          />
          <path
            d={projectedMove.path}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3.5"
            strokeDasharray="6 5"
            strokeLinecap="round"
            markerEnd={projectedMarkerId}
          />
        </g>
      )}
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
      {projectedMove && drawProjectedMove ? (
        <g transform={`translate(${targetPoint.x}, ${targetPoint.y})`}>
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
            +{projectedSupportCount}
          </text>
        </g>
      ) : (
        !projectedMove && (
          <circle
            cx={targetPoint.x}
            cy={targetPoint.y}
            r={isSupportHold ? 24 * pieceRingScale : 8}
            fill={isSupportHold ? 'none' : strokeColor}
            stroke={strokeColor}
            strokeWidth="2.8"
          />
        )
      )}
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
}
