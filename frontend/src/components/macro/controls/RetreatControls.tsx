import type React from 'react';
import type { Order, ProvinceInfo, Unit } from '../../../types/diplomacy';
import { splitProvinceCode } from '../../../utils/orderHelpers';
import { provinceName } from '../../../utils/turnFormat';
import {
  IconSelectDropdown,
  type IconSelectDropdownClassNames,
  type IconSelectOption,
} from '../../ui/IconSelectDropdown';
import styles from '../OrderParameterControls.module.css';
import { orderParamDropdownClassNames } from './orderParamDropdown';

interface RetreatControlsProps {
  unit: Unit;
  /** The unit's RETREAT order. */
  order: Order;
  provinces: Record<string, ProvinceInfo>;
  validRetreats: { province: string; coasts: string[] }[];
  compact?: boolean;
  useNativeSelect?: boolean;
  dropdownClassNames?: IconSelectDropdownClassNames;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince?: (province: string | null) => void;
}

/** The "Retreat To" select of a dislodged unit that has chosen to retreat. */
export const RetreatControls: React.FC<RetreatControlsProps> = ({
  unit,
  order,
  provinces,
  validRetreats,
  compact = false,
  useNativeSelect = false,
  dropdownClassNames,
  onUpdateOrder,
  onHoverProvince,
}) => {
  if (validRetreats.length === 0) {
    return <span className={styles.retreatDisbandMsg}>Must Disband</span>;
  }

  const options: IconSelectOption[] = validRetreats.flatMap((r) => {
    if (r.coasts.length > 0 && unit.unit_type === 'F') {
      return r.coasts.map((c) => ({
        value: `${r.province}/${c}`,
        label: `${provinceName(provinces, r.province)} (${c})`,
      }));
    }
    return [
      {
        value: r.province,
        label: provinceName(provinces, r.province),
      },
    ];
  });

  const selectValue = order.target_coast
    ? `${order.target}/${order.target_coast}`
    : order.target || '';

  return (
    <IconSelectDropdown
      useNative={useNativeSelect}
      compact={compact}
      classNames={dropdownClassNames ?? orderParamDropdownClassNames}
      testId="select-retreat-target"
      value={selectValue || null}
      options={options}
      placeholder="Retreat to…"
      title={`Retreat target for ${provinceName(provinces, unit.province)}`}
      onHoverOption={(val) =>
        onHoverProvince?.(val ? splitProvinceCode(val).base : null)
      }
      onChange={(raw) => {
        if (!raw) return;
        const { base, coast } = splitProvinceCode(raw);
        onUpdateOrder({
          ...order,
          target: base,
          target_coast: coast,
          is_explicit: true,
        });
      }}
    />
  );
};
