import type React from 'react';
import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import { splitProvinceCode } from '../../../utils/orderHelpers';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from '../../map/hud/IconSelectDropdown';

interface MoveControlsProps {
  unit: Unit;
  /** The unit's MOVE (or HOLD in compact mode) order. */
  order: Order | undefined;
  provinces: Record<string, ProvinceInfo>;
  reachable: { province: string; coasts: string[] }[];
  unitOptions?: UnitMoveOptions | null;
  compact?: boolean;
  useNativeSelect?: boolean;
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

  if (compact) {
    const compactOptions: IconSelectOption[] = [
      ...reachable.flatMap((r): IconSelectOption[] => {
        if (r.coasts.length > 0 && unit.unit_type === 'F') {
          return r.coasts.map((c) => ({
            value: `${r.province}/${c}`,
            label: `${provinces[r.province]?.name ?? r.province} (${c})`,
          }));
        }
        return [
          {
            value: r.province,
            label: provinces[r.province]?.name ?? r.province,
          },
        ];
      }),
      ...convoyProvinces.map((pid): IconSelectOption => {
        const isReady = unitOptions?.active_convoys.includes(pid);
        return {
          value: `VIA:${pid}`,
          label: `${provinces[pid]?.name ?? pid} (Convoy${isReady ? ' ✓' : ''})`,
        };
      }),
    ];

    if (useNativeSelect) {
      return (
        <select
          className="unit-compact-select"
          data-testid="select-order-target"
          value={selectValue}
          onChange={(e) => handleTargetChange(e.target.value)}
          title={`Target for ${provinces[unit.province]?.name ?? unit.province}`}
        >
          {compactOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <IconSelectDropdown
        testId="select-order-target"
        value={selectValue || null}
        options={compactOptions}
        placeholder="Move to…"
        title={`Target for ${provinces[unit.province]?.name ?? unit.province}`}
        onHoverOption={(val) =>
          onHoverProvince?.(
            val ? (val.startsWith('VIA:') ? val.slice(4) : val) : null,
          )
        }
        onChange={(val) => handleTargetChange(val ?? '')}
      />
    );
  }

  return (
    <div className="order-param-row">
      <label>Destination:</label>
      <select
        data-testid="select-order-target"
        value={selectValue}
        onChange={(e) => handleTargetChange(e.target.value)}
      >
        <optgroup label="Reachable Provinces">
          {reachable.flatMap((r) => {
            if (r.coasts.length > 0 && unit.unit_type === 'F') {
              return r.coasts.map((c) => (
                <option key={`${r.province}/${c}`} value={`${r.province}/${c}`}>
                  {`${provinces[r.province]?.name} (${c} Coast) [${r.province}/${c}]`}
                </option>
              ));
            }
            return (
              <option key={r.province} value={r.province}>
                {`${provinces[r.province]?.name} (${r.province})`}
              </option>
            );
          })}
        </optgroup>
        {convoyProvinces.length > 0 && (
          <optgroup label="Coastal (via Convoy)">
            {convoyProvinces.map((pid) => {
              const isReady = unitOptions?.active_convoys.includes(pid);
              return (
                <option key={`VIA:${pid}`} value={`VIA:${pid}`}>
                  {provinces[pid]?.name ?? pid} ({pid}) — via Convoy
                  {isReady ? ' [Ready]' : ''}
                </option>
              );
            })}
          </optgroup>
        )}
      </select>
    </div>
  );
};
