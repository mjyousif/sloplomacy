import { Anchor, Crosshair, MoveRight, Shield, Trash2 } from 'lucide-react';
import type React from 'react';
import type {
  Order,
  OrderType,
  ProvinceInfo,
  Unit,
} from '../../types/diplomacy';
import { isChosenDisband } from '../../utils/orderHelpers';
import styles from './OrderTypeTabs.module.css';

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
      <div className={styles.orderTypeTabs} data-testid="order-type-tabs">
        {validRetreats.length > 0 && (
          <button
            type="button"
            data-testid="btn-order-retreat"
            aria-pressed={order?.order_type === 'RETREAT'}
            data-active={order?.order_type === 'RETREAT' ? 'true' : undefined}
            className={styles.orderTabBtn}
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
          aria-pressed={isChosenDisband(order)}
          data-active={isChosenDisband(order) ? 'true' : undefined}
          className={styles.orderTabBtn}
          style={
            isChosenDisband(order)
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
      <div className={styles.orderTypeTabs} data-testid="order-type-tabs">
        <button
          type="button"
          data-testid="btn-adjustment-keep"
          aria-pressed={!isDisbanding}
          data-active={!isDisbanding ? 'true' : undefined}
          className={styles.orderTabBtn}
          onClick={() => handleOrderTypeChange(unit, 'HOLD')}
        >
          <Shield size={11} /> KEEP UNIT
        </button>
        <button
          type="button"
          data-testid="btn-adjustment-disband"
          aria-pressed={isDisbanding}
          data-active={isDisbanding ? 'true' : undefined}
          className={styles.orderTabBtn}
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
    <div
      className={styles.orderTypeTabs}
      data-testid="order-type-tabs"
      data-compact={compact ? 'true' : undefined}
    >
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
            className={styles.orderTabBtn}
            data-testid={`btn-order-type-${oType}`}
            data-compact={compact ? 'true' : undefined}
            data-active={active ? 'true' : undefined}
            aria-pressed={active}
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
