import { Anchor, Crosshair, MoveRight, Shield, Trash2 } from 'lucide-react';
import type React from 'react';
import type {
  Order,
  OrderType,
  ProvinceInfo,
  Unit,
} from '../../types/diplomacy';

interface OrderTypeTabsProps {
  unit: Unit;
  order: Order | undefined;
  provinces: Record<string, ProvinceInfo>;
  validRetreats: { province: string; coasts: string[] }[];
  isDisbanding: boolean;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  buildCount: number;
  compact?: boolean;
  handleOrderTypeChange: (unit: Unit, type: OrderType) => void;
}

/**
 * The row of order-type buttons on a unit card: Retreat or Disband for a dislodged unit, Keep or
 * Disband when a power must disband in winter, otherwise Hold, Move, Support and Convoy. Renders
 * nothing when the phase has no choice for this unit.
 */
export const OrderTypeTabs: React.FC<OrderTypeTabsProps> = ({
  unit,
  order,
  provinces,
  validRetreats,
  isDisbanding,
  isRetreatPhase,
  isAdjustmentPhase,
  buildCount,
  compact = false,
  handleOrderTypeChange,
}) => {
  if (isRetreatPhase) {
    if (!unit.is_dislodged) return null;
    return (
      <div className="order-type-tabs">
        {validRetreats.length > 0 && (
          <button
            type="button"
            data-testid="btn-order-retreat"
            className={`order-tab-btn ${order?.order_type === 'RETREAT' ? 'active' : ''}`}
            style={
              order?.order_type === 'RETREAT'
                ? {
                    backgroundColor: '#ea580c',
                    borderColor: '#fdba74',
                    color: '#fff',
                  }
                : undefined
            }
            onClick={() => handleOrderTypeChange(unit, 'RETREAT')}
          >
            <MoveRight size={11} /> RETREAT
          </button>
        )}
        <button
          type="button"
          data-testid="btn-order-disband"
          className={`order-tab-btn ${order?.order_type === 'DISBAND' ? 'active' : ''}`}
          style={
            order?.order_type === 'DISBAND'
              ? {
                  backgroundColor: '#dc2626',
                  borderColor: '#fca5a5',
                  color: '#fff',
                }
              : undefined
          }
          onClick={() => handleOrderTypeChange(unit, 'DISBAND')}
        >
          <Trash2 size={11} /> DISBAND
        </button>
      </div>
    );
  }

  if (isAdjustmentPhase) {
    if (!(buildCount < 0)) return null;
    return (
      <div className="order-type-tabs">
        <button
          type="button"
          data-testid="btn-adjustment-keep"
          className={`order-tab-btn ${!isDisbanding ? 'active' : ''}`}
          onClick={() => handleOrderTypeChange(unit, 'HOLD')}
        >
          <Shield size={11} /> KEEP UNIT
        </button>
        <button
          type="button"
          data-testid="btn-adjustment-disband"
          className={`order-tab-btn ${isDisbanding ? 'active' : ''}`}
          style={
            isDisbanding
              ? {
                  backgroundColor: '#dc2626',
                  borderColor: '#fca5a5',
                  color: '#fff',
                }
              : undefined
          }
          onClick={() => handleOrderTypeChange(unit, 'DISBAND')}
        >
          <Trash2 size={11} /> DISBAND UNIT
        </button>
      </div>
    );
  }

  return (
    <div className={`order-type-tabs ${compact ? 'compact' : ''}`}>
      {(['HOLD', 'MOVE', 'SUPPORT', 'CONVOY'] as OrderType[]).map((oType) => {
        const convoyUnsupported =
          oType === 'CONVOY' &&
          (unit.unit_type !== 'F' || provinces[unit.province]?.type !== 'SEA');
        if (convoyUnsupported && !compact) {
          return null;
        }
        const active = (order?.order_type || 'HOLD') === oType;
        const shortLetter = oType[0];
        return (
          <button
            key={oType}
            type="button"
            disabled={convoyUnsupported}
            className={`order-tab-btn ${compact ? 'compact-square' : ''} ${active ? 'active' : ''}`}
            data-testid={`btn-order-type-${oType}`}
            title={convoyUnsupported ? 'Only fleets at sea can convoy' : oType}
            onClick={() => handleOrderTypeChange(unit, oType)}
          >
            {compact ? (
              shortLetter
            ) : (
              <>
                {oType === 'HOLD' && <Shield size={11} />}
                {oType === 'MOVE' && <MoveRight size={11} />}
                {oType === 'SUPPORT' && <Crosshair size={11} />}
                {oType === 'CONVOY' && <Anchor size={11} />}
                {oType}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
};
