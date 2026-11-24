import type React from 'react';
import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import { splitProvinceCode } from '../../../utils/orderHelpers';
import { provinceName } from '../../../utils/turnFormat';
import {
  IconSelectDropdown,
  type IconSelectDropdownClassNames,
  type IconSelectOption,
} from '../../ui/IconSelectDropdown';
import { orderParamDropdownClassNames } from './orderParamDropdown';

interface MoveControlsProps {
  unit: Unit;
  /** The unit's MOVE (or HOLD in compact mode) order. */
  order: Order | undefined;
  provinces: Record<string, ProvinceInfo>;
  reachable: { province: string; coasts: string[] }[];
  unitOptions?: UnitMoveOptions | null;
  compact?: boolean;
  useNativeSelect?: boolean;
  /** Styles the compact row's dropdown, which its card owns. */
  dropdownClassNames?: IconSelectDropdownClassNames;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince?: (province: string | null) => void;
}

/** The "Destination" select of a MOVE order, with the coastal via-convoy options for an army. */
export const MoveControls: React.FC<MoveControlsProps> = ({
  unit,
  order,
  provinces,
  reachable,
  unitOptions = null,
  compact = false,
  useNativeSelect = false,
  dropdownClassNames,
  onUpdateOrder,
  onHoverProvince,
}) => {
  const isCoastalArmy =
    unit.unit_type === 'A' && provinces[unit.province]?.type === 'COAST';
  const convoyProvinces = isCoastalArmy
    ? unitOptions
      ? Array.from(
          new Set([
            ...unitOptions.active_convoys,
            ...unitOptions.potential_convoys,
            ...(order?.via_convoy && order.target ? [order.target] : []),
          ]),
        )
      : Object.values(provinces)
          .filter(
            (p) =>
              p.type === 'COAST' &&
              p.id !== unit.province &&
              !reachable.some((r) => r.province === p.id),
          )
          .map((p) => p.id)
    : [];

  const isMove = order?.order_type === 'MOVE';
  const selectValue = !isMove
    ? ''
    : order?.via_convoy &&
        order.target &&
        convoyProvinces.includes(order.target)
      ? `VIA:${order.target}`
      : order?.target_coast
        ? `${order.target}/${order.target_coast}`
        : order?.target || '';

  const baseOrder: Order = order ?? {
    unit_id: unit.id,
    power: unit.power,
    unit_type: unit.unit_type,
    origin: unit.province,
    origin_coast: unit.coast,
    order_type: 'HOLD',
    via_convoy: false,
    is_explicit: true,
  };

  const handleTargetChange = (raw: string) => {
    if (!raw) {
      onUpdateOrder({
        ...baseOrder,
        order_type: 'HOLD',
        target: null,
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
      return;
    }
    if (raw.startsWith('VIA:')) {
      onUpdateOrder({
        ...baseOrder,
        order_type: 'MOVE',
        target: raw.slice(4),
        target_coast: null,
        via_convoy: true,
        is_explicit: true,
      });
      return;
    }
    const { base, coast } = splitProvinceCode(raw);
    const isAdjacent = reachable.some((r) => r.province === base);
    onUpdateOrder({
      ...baseOrder,
      order_type: 'MOVE',
      target: base,
      target_coast: coast,
      via_convoy: unit.unit_type === 'A' && !isAdjacent,
      is_explicit: true,
    });
  };

  const options: IconSelectOption[] = [
    ...reachable.flatMap((r): IconSelectOption[] => {
      if (r.coasts.length > 0 && unit.unit_type === 'F') {
        return r.coasts.map((c) => ({
          value: `${r.province}/${c}`,
          label: `${provinceName(provinces, r.province)} (${c})`,
          group: 'Reachable Provinces',
        }));
      }
      return [
        {
          value: r.province,
          label: provinceName(provinces, r.province),
          group: 'Reachable Provinces',
        },
      ];
    }),
    ...convoyProvinces.map((pid): IconSelectOption => {
      const isReady = unitOptions?.active_convoys.includes(pid);
      return {
        value: `VIA:${pid}`,
        label: `${provinceName(provinces, pid)} (Convoy${isReady ? ' ✓' : ''})`,
        group: 'Coastal (via Convoy)',
      };
    }),
  ];

  return (
    <IconSelectDropdown
      useNative={useNativeSelect}
      compact={compact}
      classNames={dropdownClassNames ?? orderParamDropdownClassNames}
      testId="select-order-target"
      value={selectValue || null}
      options={options}
      placeholder="Move to…"
      title={`Target for ${provinceName(provinces, unit.province)}`}
      onHoverOption={(val) =>
        onHoverProvince?.(
          val ? (val.startsWith('VIA:') ? val.slice(4) : val) : null,
        )
      }
      onChange={(val) => handleTargetChange(val ?? '')}
    />
  );
};
