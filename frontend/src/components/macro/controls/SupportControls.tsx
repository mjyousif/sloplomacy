import type React from 'react';
import {
  type Order,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
  type UnitMoveOptions,
} from '../../../types/diplomacy';

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
  onUpdateOrder: (order: Order) => void;
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
  onUpdateOrder,
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

  return (
    <div className="order-param-grid">
      <div className="order-param-row">
        <label>Unit:</label>
        <select
          data-testid="select-support-unit"
          value={order.aux_unit_origin || ''}
          onChange={(e) => {
            const newAux = e.target.value;
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
          }}
        >
          {supportableUnits.map((u2) => (
            <option key={u2.id} value={u2.province}>
              [{POWER_METADATA[u2.power].shortName}] {u2.unit_type}{' '}
              {provinces[u2.province]?.name} ({u2.province})
            </option>
          ))}
        </select>
      </div>
      <div className="order-param-row">
        <label>Into:</label>
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
      </div>
    </div>
  );
};
