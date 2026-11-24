import type React from 'react';
import type { Order, ProvinceInfo, Unit } from '../../../types/diplomacy';
import { splitProvinceCode } from '../../../utils/orderHelpers';
import { provinceName } from '../../../utils/turnFormat';
import styles from '../OrderParameterControls.module.css';

interface RetreatControlsProps {
  unit: Unit;
  /** The unit's RETREAT order. */
  order: Order;
  provinces: Record<string, ProvinceInfo>;
  validRetreats: { province: string; coasts: string[] }[];
  compact?: boolean;
  onUpdateOrder: (order: Order) => void;
}

/** The "Retreat To" select of a dislodged unit that has chosen to retreat. */
export const RetreatControls: React.FC<RetreatControlsProps> = ({
  unit,
  order,
  provinces,
  validRetreats,
  compact = false,
  onUpdateOrder,
}) => {
  const selectEl =
    validRetreats.length === 0 ? (
      <span style={{ fontSize: 11, color: '#f87171' }}>
        {compact
          ? 'Must Disband'
          : 'No valid retreat provinces available (Must Disband)'}
      </span>
    ) : (
      <select
        data-testid="select-retreat-target"
        data-compact={compact ? 'true' : undefined}
        value={
          order.target_coast
            ? `${order.target}/${order.target_coast}`
            : order.target || ''
        }
        onChange={(e) => {
          const { base, coast } = splitProvinceCode(e.target.value);
          onUpdateOrder({
            ...order,
            target: base,
            target_coast: coast,
            is_explicit: true,
          });
        }}
      >
        {validRetreats.flatMap((r) => {
          if (r.coasts.length > 0 && unit.unit_type === 'F') {
            return r.coasts.map((c) => (
              <option key={`${r.province}/${c}`} value={`${r.province}/${c}`}>
                {provinceName(provinces, r.province)} ({c} Coast) [{r.province}/
                {c}]
              </option>
            ));
          }
          return (
            <option key={r.province} value={r.province}>
              {provinceName(provinces, r.province)} ({r.province})
            </option>
          );
        })}
      </select>
    );

  if (compact) {
    return selectEl;
  }

  return (
    <div className={styles.orderParamRow}>
      <label>Retreat To:</label>
      {selectEl}
    </div>
  );
};
