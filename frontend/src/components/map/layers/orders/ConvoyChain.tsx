import type { Unit } from '../../../../types/diplomacy';
import type { OrderLayerContext } from './orderLayerContext';

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
  const { getUnitPoint, getProvincePoint, issuesByUnit, pieceRingScale } = ctx;
  const fleetPt = getUnitPoint(unit);
  const armyPt = getProvincePoint(auxOrigin);
  const destPt = getProvincePoint(target);
  const hasIssue = Boolean(issuesByUnit[unit.id]?.length);

  return (
    <g
      pointerEvents="none"
      data-testid="order-arrow"
      data-order-unit={unit.id}
      data-order-type="CONVOY"
      data-order-target={target || ''}
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
}
