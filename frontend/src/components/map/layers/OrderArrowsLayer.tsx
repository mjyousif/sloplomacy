import { EUROPE_PROVINCE_GEOMETRY } from '../../../data/europeMapGeometry';
import type { Unit } from '../../../types/diplomacy';
import { ConvoyChain } from './orders/ConvoyChain';
import { MoveArrow } from './orders/MoveArrow';
import type { OrderLayerContext } from './orders/orderLayerContext';
import { SupportVector } from './orders/SupportVector';

interface OrderArrowsLayerProps {
  units: Unit[];
  ctx: OrderLayerContext;
}

/** Every drawn order: convoy chains under support lines under move and retreat arrows. */
export function OrderArrowsLayer({ units, ctx }: OrderArrowsLayerProps) {
  const { orders, isUnitOrderVisible } = ctx;
  return (
    <g className="tactical-vectors-layer">
      {/* 6A. CONVOY CHAINS */}
      {units.map((u) => {
        if (!isUnitOrderVisible(u) || u.is_dislodged) return null;
        const o = orders[u.id];
        if (!o || o.order_type !== 'CONVOY' || !o.aux_unit_origin || !o.target)
          return null;
        return (
          <ConvoyChain
            key={`convoy_${u.id}`}
            unit={u}
            target={o.target}
            auxOrigin={o.aux_unit_origin}
            ctx={ctx}
          />
        );
      })}

      {/* 6B. SUPPORT VECTORS */}
      {units.map((u) => {
        if (!isUnitOrderVisible(u) || u.is_dislodged) return null;
        const o = orders[u.id];
        if (!o || o.order_type !== 'SUPPORT' || !o.aux_unit_origin || !o.target)
          return null;
        return (
          <SupportVector
            key={`support_${u.id}`}
            unit={u}
            target={o.target}
            auxOrigin={o.aux_unit_origin}
            ctx={ctx}
          />
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
        return (
          <MoveArrow
            key={`move_${u.id}`}
            unit={u}
            order={o}
            target={o.target}
            ctx={ctx}
          />
        );
      })}
    </g>
  );
}
