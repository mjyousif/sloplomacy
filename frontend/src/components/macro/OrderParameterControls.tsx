import type React from 'react';
import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../types/diplomacy';
import { ConvoyControls } from './controls/ConvoyControls';
import { MoveControls } from './controls/MoveControls';
import { RetreatControls } from './controls/RetreatControls';
import { SupportControls } from './controls/SupportControls';

interface OrderParameterControlsProps {
  unit: Unit;
  order: Order | undefined;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitsByProv: Record<string, Unit>;
  orders: Record<string, Order>;
  reachable: { province: string; coasts: string[] }[];
  validRetreats: { province: string; coasts: string[] }[];
  unitOptions?: UnitMoveOptions | null;
  isRetreatPhase: boolean;
  onUpdateOrder: (order: Order) => void;
}

/**
 * The selects under a unit card's order-type tabs. Picks the control for the order's type: the
 * retreat phase shows only the retreat select, and a HOLD or DISBAND has no parameters.
 */
export const OrderParameterControls: React.FC<OrderParameterControlsProps> = ({
  unit,
  order,
  provinces,
  units,
  unitsByProv,
  orders,
  reachable,
  validRetreats,
  unitOptions = null,
  isRetreatPhase,
  onUpdateOrder,
}) => {
  if (isRetreatPhase) {
    if (order?.order_type !== 'RETREAT') return null;
    return (
      <RetreatControls
        unit={unit}
        order={order}
        provinces={provinces}
        validRetreats={validRetreats}
        onUpdateOrder={onUpdateOrder}
      />
    );
  }

  if (order?.order_type === 'MOVE') {
    return (
      <MoveControls
        unit={unit}
        order={order}
        provinces={provinces}
        reachable={reachable}
        unitOptions={unitOptions}
        onUpdateOrder={onUpdateOrder}
      />
    );
  }

  if (order?.order_type === 'SUPPORT') {
    return (
      <SupportControls
        unit={unit}
        order={order}
        provinces={provinces}
        units={units}
        unitsByProv={unitsByProv}
        orders={orders}
        reachable={reachable}
        unitOptions={unitOptions}
        onUpdateOrder={onUpdateOrder}
      />
    );
  }

  if (order?.order_type === 'CONVOY') {
    return (
      <ConvoyControls
        order={order}
        provinces={provinces}
        units={units}
        unitOptions={unitOptions}
        onUpdateOrder={onUpdateOrder}
      />
    );
  }

  return null;
};
