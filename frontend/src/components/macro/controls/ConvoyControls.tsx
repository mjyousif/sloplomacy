import type React from 'react';
import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import { provinceName } from '../../../utils/turnFormat';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from '../../ui/IconSelectDropdown';
import styles from '../OrderParameterControls.module.css';
import { orderParamDropdownClassNames } from './orderParamDropdown';

interface ConvoyControlsProps {
  /** The fleet's CONVOY order. */
  order: Order;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitOptions?: UnitMoveOptions | null;
  compact?: boolean;
  useNativeSelect?: boolean;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince?: (province: string | null) => void;
}

/** The "Army" and "To Coast" selects of a CONVOY order. */
export const ConvoyControls: React.FC<ConvoyControlsProps> = ({
  order,
  provinces,
  units,
  unitOptions = null,
  compact = false,
  useNativeSelect = false,
  onUpdateOrder,
  onHoverProvince,
}) => {
  const armyReach = unitOptions?.convoyable_armies;
  const directArmies = armyReach?.direct ?? [];
  const chainedArmies = armyReach?.chained ?? [];
  const fallbackArmies = !armyReach
    ? units
        .filter(
          (u2) =>
            u2.unit_type === 'A' &&
            !u2.is_dislodged &&
            provinces[u2.province]?.type === 'COAST',
        )
        .map((u2) => u2.province)
    : [];

  const targetReach = order.aux_unit_origin
    ? unitOptions?.convoy_targets[order.aux_unit_origin]
    : undefined;
  const directTargets = targetReach?.direct ?? [];
  const chainedTargets = targetReach?.chained ?? [];
  const fallbackTargets = !unitOptions
    ? Object.values(provinces)
        .filter((p) => p.type === 'COAST' && p.id !== order.aux_unit_origin)
        .map((p) => p.id)
    : [];

  const handleArmyChange = (nextOrigin: string) => {
    const nextReach = unitOptions?.convoy_targets[nextOrigin];
    const allowedNext = nextReach
      ? [...nextReach.direct, ...nextReach.chained]
      : Object.values(provinces)
          .filter((p) => p.type === 'COAST' && p.id !== nextOrigin)
          .map((p) => p.id);
    const nextTarget =
      order.target && allowedNext.includes(order.target)
        ? order.target
        : (allowedNext[0] ?? null);
    onUpdateOrder({
      ...order,
      aux_unit_origin: nextOrigin,
      target: nextTarget,
      is_explicit: true,
    });
  };

  const armyOpts: IconSelectOption[] = armyReach
    ? [
        ...directArmies.map((pid) => ({
          value: pid,
          label: `A ${provinceName(provinces, pid)}`,
          group: 'Adjacent Shore',
        })),
        ...chainedArmies.map((pid) => ({
          value: pid,
          label: `A ${provinceName(provinces, pid)}`,
          group: 'Via Fleet Chain',
        })),
      ]
    : fallbackArmies.map((pid) => ({
        value: pid,
        label: `A ${provinceName(provinces, pid)}`,
      }));

  const targetOpts: IconSelectOption[] = unitOptions
    ? [
        ...directTargets.map((pid) => ({
          value: pid,
          label: provinceName(provinces, pid),
          group: 'Direct / Ready Chain',
        })),
        ...chainedTargets.map((pid) => ({
          value: pid,
          label: provinceName(provinces, pid),
          group: 'Multi-Ship Chain',
        })),
      ]
    : fallbackTargets.map((pid) => ({
        value: pid,
        label: provinceName(provinces, pid),
      }));

  return (
    <div className={styles.orderParamInline}>
      <IconSelectDropdown
        useNative={useNativeSelect}
        compact={compact}
        ariaLabel="Convoyed army"
        classNames={orderParamDropdownClassNames}
        value={order.aux_unit_origin || null}
        options={armyOpts}
        placeholder="Army…"
        onHoverOption={(val) => onHoverProvince?.(val)}
        onChange={(nextOrigin) => {
          if (nextOrigin) handleArmyChange(nextOrigin);
        }}
      />
      <span className={styles.orderParamArrow} aria-hidden="true">
        →
      </span>
      <IconSelectDropdown
        useNative={useNativeSelect}
        compact={compact}
        ariaLabel="Convoy destination coast"
        classNames={orderParamDropdownClassNames}
        value={order.target || null}
        options={targetOpts}
        placeholder="To…"
        onHoverOption={(val) => onHoverProvince?.(val)}
        onChange={(val) => {
          if (val) {
            onUpdateOrder({
              ...order,
              target: val,
              is_explicit: true,
            });
          }
        }}
      />
    </div>
  );
};
