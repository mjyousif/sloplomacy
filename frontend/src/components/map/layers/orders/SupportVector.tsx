import type { Unit } from '../../../../types/diplomacy';
import type { OrderLayerContext } from './orderLayerContext';

/** A support line to the supported unit, or to the middle of the move it supports, with CUT when a simulation cuts it. */
export function SupportVector({
  unit,
  target,
  auxOrigin,
  ctx,
}: {
  unit: Unit;
  /** The order's target, checked by the layer. */
  target: string;
  /** The unit the order is for, checked by the layer. */
  auxOrigin: string;
  ctx: OrderLayerContext;
}) {
  const {
    getUnitPoint,
    getProvincePoint,
    issuesByUnit,
    pieceRingScale,
    moveMidpointsByOrigin,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
  } = ctx;
  const supporterPt = getUnitPoint(unit);
  const isSupportHold = auxOrigin === target;
  const targetPoint =
    !isSupportHold && moveMidpointsByOrigin[auxOrigin]
      ? moveMidpointsByOrigin[auxOrigin]
      : getProvincePoint(target);

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

  return (
    <g
      pointerEvents="none"
      data-testid="order-arrow"
      data-order-unit={unit.id}
      data-order-type="SUPPORT"
      data-order-target={target || ''}
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
}
