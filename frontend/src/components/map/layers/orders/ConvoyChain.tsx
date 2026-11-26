import type { Unit } from '../../../../types/diplomacy';
import type { OrderLayerContext } from './orderLayerContext';
import { PieceRingAt } from './PieceRingAt';

/** A fleet's convoy: a dashed line from the army through the fleet to the shore, and a ring on the fleet. */
export function ConvoyChain({
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
    selectedUnitId,
    hoveredUnitId,
    historyView = false,
  } = ctx;
  const fleetPt = getUnitPoint(unit);
  const armyPt = getProvincePoint(auxOrigin);
  const destPt = getProvincePoint(target);
  const hasIssue = Boolean(
    issuesByUnit[unit.id]?.some((i) => i.severity !== 'info'),
  );
  const isFocused = unit.id === selectedUnitId || unit.id === hoveredUnitId;
  const hasHistoryFocus = Boolean(
    historyView && (hoveredUnitId || selectedUnitId),
  );
  const isDimmed = hasHistoryFocus && !isFocused;

  return (
    <g
      pointerEvents="none"
      opacity={isDimmed ? 0.22 : 1}
      data-testid="order-arrow"
      data-order-unit={unit.id}
      data-order-type="CONVOY"
      data-order-target={target || ''}
    >
      {isFocused && historyView && (
        <path
          d={`M ${armyPt.x},${armyPt.y} L ${fleetPt.x},${fleetPt.y} L ${destPt.x},${destPt.y}`}
          fill="none"
          stroke="#fde047"
          strokeWidth="8.5"
          strokeOpacity="0.9"
          strokeLinecap="round"
        />
      )}
      <path
        d={`M ${armyPt.x},${armyPt.y} L ${fleetPt.x},${fleetPt.y} L ${destPt.x},${destPt.y}`}
        fill="none"
        stroke={hasIssue ? '#f59e0b' : '#0284c7'}
        strokeWidth={isFocused && historyView ? '5.2' : '4.2'}
        strokeDasharray="9 6"
      />
      <PieceRingAt
        ctx={ctx}
        point={fleetPt}
        province={unit.province}
        coast={unit.coast}
        unitType={unit.unit_type}
        radius={26}
        stroke={
          isFocused && historyView
            ? '#fde047'
            : hasIssue
              ? '#f59e0b'
              : '#0284c7'
        }
        strokeWidth={isFocused && historyView ? '3.5' : '2.5'}
        strokeDasharray="5 4"
      />
    </g>
  );
}
