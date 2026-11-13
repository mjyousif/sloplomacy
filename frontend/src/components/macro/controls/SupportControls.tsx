import type React from 'react';
import {
  type Order,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
  type UnitMoveOptions,
} from '../../../types/diplomacy';
import {
  IconSelectDropdown,
  type IconSelectOption,
} from '../../map/hud/IconSelectDropdown';
import { PowerFlag } from '../../PowerFlag';

interface SupportControlsProps {
  unit: Unit;
  /** The unit's SUPPORT order. */
  order: Order;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitsByProv: Record<string, Unit>;
  orders: Record<string, Order>;
  reachable: { province: string; coasts: string[] }[];
  unitOptions?: UnitMoveOptions | null;
  compact?: boolean;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince?: (province: string | null) => void;
}

/** The "Unit" and "Into" selects of a SUPPORT order. */
export const SupportControls: React.FC<SupportControlsProps> = ({
  unit,
  order,
  provinces,
  units,
  unitsByProv,
  orders,
  reachable,
  unitOptions = null,
  compact = false,
  onUpdateOrder,
  onHoverProvince,
}) => {
  const validSupports = unitOptions?.valid_supports;
  const supportableUnits = validSupports
    ? validSupports
        .map((s) => unitsByProv[s.province])
        .filter((u2): u2 is Unit => Boolean(u2))
    : units.filter((u2) => u2.id !== unit.id && !u2.is_dislodged);

  const activeSupOpt = validSupports?.find(
    (s) => s.province === order.aux_unit_origin,
  );
  const moveTargets = activeSupOpt
    ? activeSupOpt.moves
    : reachable
        .filter((r) => r.province !== order.aux_unit_origin)
        .map((r) => r.province);
  const canHoldSupport = activeSupOpt
    ? activeSupOpt.hold
    : Boolean(order.aux_unit_origin);

  const handleSupportUnitChange = (newAux: string) => {
    const supUnit = unitsByProv[newAux];
    const supOrd = supUnit ? orders[supUnit.id] : undefined;
    const supOpt = validSupports?.find((s) => s.province === newAux);
    const autoTarget =
      supOrd?.order_type === 'MOVE' &&
      supOrd.target &&
      (!supOpt || supOpt.moves.includes(supOrd.target))
        ? supOrd.target
        : supOpt && !supOpt.hold
          ? (supOpt.moves[0] ?? newAux)
          : newAux;
    onUpdateOrder({
      ...order,
      aux_unit_origin: newAux,
      target: autoTarget,
      is_explicit: true,
    });
  };

  if (compact) {
    const unitOptionsList: IconSelectOption[] = supportableUnits.map((u2) => ({
      value: u2.province,
      label: `${u2.unit_type} ${provinces[u2.province]?.name ?? u2.province}`,
      icon: <PowerFlag power={u2.power} width={14} height={10} />,
    }));
    const targetOptionsList: IconSelectOption[] = [
      ...(order.aux_unit_origin && canHoldSupport
        ? [
            {
              value: order.aux_unit_origin,
              label: `Hold (${provinces[order.aux_unit_origin]?.name ?? order.aux_unit_origin})`,
            },
          ]
        : []),
      ...moveTargets.map((pid) => ({
        value: pid,
        label: provinces[pid]?.name ?? pid,
      })),
    ];

    return (
      <div className="order-param-inline">
        <IconSelectDropdown
          testId="select-support-unit"
          value={order.aux_unit_origin || null}
          options={unitOptionsList}
          placeholder="Unit…"
          onHoverOption={(val) => onHoverProvince?.(val)}
          onChange={(val) => {
            if (val) handleSupportUnitChange(val);
          }}
        />
        <span className="order-param-arrow" aria-hidden="true">
          →
        </span>
        <IconSelectDropdown
          testId="select-support-target"
          value={order.target || null}
          options={targetOptionsList}
          placeholder="Into…"
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
  }

  const unitSelect = (
    <select
      data-testid="select-support-unit"
      value={order.aux_unit_origin || ''}
      onChange={(e) => handleSupportUnitChange(e.target.value)}
    >
      {supportableUnits.map((u2) => (
        <option key={u2.id} value={u2.province}>
          [{POWER_METADATA[u2.power].shortName}] {u2.unit_type}{' '}
          {provinces[u2.province]?.name} ({u2.province})
        </option>
      ))}
    </select>
  );

  const targetSelect = (
    <select
      data-testid="select-support-target"
      value={order.target || ''}
      onChange={(e) =>
        onUpdateOrder({
          ...order,
          target: e.target.value,
          is_explicit: true,
        })
      }
    >
      {order.aux_unit_origin && canHoldSupport && (
        <option value={order.aux_unit_origin}>
          HOLD in {provinces[order.aux_unit_origin]?.name} (
          {order.aux_unit_origin})
        </option>
      )}
      {moveTargets.length > 0 && (
        <optgroup label="Support Move Into:">
          {moveTargets.map((pid) => (
            <option key={pid} value={pid}>
              → {provinces[pid]?.name ?? pid} ({pid})
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );

  return (
    <div className="order-param-grid">
      <div className="order-param-row">
        <label>Unit:</label>
        {unitSelect}
      </div>
      <div className="order-param-row">
        <label>Into:</label>
        {targetSelect}
      </div>
    </div>
  );
};
