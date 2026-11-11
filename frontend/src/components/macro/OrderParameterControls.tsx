import type React from 'react';
import {
  type Order,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
  type UnitMoveOptions,
} from '../../types/diplomacy';
import { splitProvinceCode } from '../../utils/orderHelpers';

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
      <div className="order-param-row">
        <label>Retreat To:</label>
        {validRetreats.length === 0 ? (
          <span style={{ fontSize: 11, color: '#f87171' }}>
            No valid retreat provinces available (Must Disband)
          </span>
        ) : (
          <select
            data-testid="select-retreat-target"
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
                  <option
                    key={`${r.province}/${c}`}
                    value={`${r.province}/${c}`}
                  >
                    {provinces[r.province]?.name} ({c} Coast) [{r.province}/{c}]
                  </option>
                ));
              }
              return (
                <option key={r.province} value={r.province}>
                  {provinces[r.province]?.name} ({r.province})
                </option>
              );
            })}
          </select>
        )}
      </div>
    );
  }

  if (order?.order_type === 'MOVE') {
    const isCoastalArmy =
      unit.unit_type === 'A' && provinces[unit.province]?.type === 'COAST';
    const convoyProvinces = isCoastalArmy
      ? unitOptions
        ? Array.from(
            new Set([
              ...unitOptions.active_convoys,
              ...unitOptions.potential_convoys,
              ...(order.via_convoy && order.target ? [order.target] : []),
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

    const selectValue =
      order.via_convoy && order.target && convoyProvinces.includes(order.target)
        ? `VIA:${order.target}`
        : order.target_coast
          ? `${order.target}/${order.target_coast}`
          : order.target || '';

    return (
      <div className="order-param-row">
        <label>Destination:</label>
        <select
          data-testid="select-order-target"
          value={selectValue}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw.startsWith('VIA:')) {
              onUpdateOrder({
                ...order,
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
              ...order,
              target: base,
              target_coast: coast,
              via_convoy: unit.unit_type === 'A' && !isAdjacent,
              is_explicit: true,
            });
          }}
        >
          <optgroup label="Reachable Provinces">
            {reachable.flatMap((r) => {
              if (r.coasts.length > 0 && unit.unit_type === 'F') {
                return r.coasts.map((c) => (
                  <option
                    key={`${r.province}/${c}`}
                    value={`${r.province}/${c}`}
                  >
                    {provinces[r.province]?.name} ({c} Coast) [{r.province}/{c}]
                  </option>
                ));
              }
              return (
                <option key={r.province} value={r.province}>
                  {provinces[r.province]?.name} ({r.province})
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
  }

  if (order?.order_type === 'SUPPORT') {
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
  }

  if (order?.order_type === 'CONVOY') {
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

    return (
      <div className="order-param-grid">
        <div className="order-param-row">
          <label>Army:</label>
          <select
            value={order.aux_unit_origin || ''}
            onChange={(e) => {
              const nextOrigin = e.target.value;
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
            }}
          >
            {armyReach ? (
              <>
                {directArmies.length > 0 && (
                  <optgroup label="Adjacent Shore">
                    {directArmies.map((pid) => (
                      <option key={pid} value={pid}>
                        A {provinces[pid]?.name ?? pid} ({pid})
                      </option>
                    ))}
                  </optgroup>
                )}
                {chainedArmies.length > 0 && (
                  <optgroup label="Via Fleet Chain">
                    {chainedArmies.map((pid) => (
                      <option key={pid} value={pid}>
                        A {provinces[pid]?.name ?? pid} ({pid})
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              fallbackArmies.map((pid) => (
                <option key={pid} value={pid}>
                  A {provinces[pid]?.name ?? pid} ({pid})
                </option>
              ))
            )}
          </select>
        </div>
        <div className="order-param-row">
          <label>To Coast:</label>
          <select
            value={order.target || ''}
            onChange={(e) =>
              onUpdateOrder({
                ...order,
                target: e.target.value,
                is_explicit: true,
              })
            }
          >
            {unitOptions ? (
              <>
                {directTargets.length > 0 && (
                  <optgroup label="Direct / Ready Chain">
                    {directTargets.map((pid) => (
                      <option key={pid} value={pid}>
                        {provinces[pid]?.name ?? pid} ({pid})
                      </option>
                    ))}
                  </optgroup>
                )}
                {chainedTargets.length > 0 && (
                  <optgroup label="Multi-Ship Chain">
                    {chainedTargets.map((pid) => (
                      <option key={pid} value={pid}>
                        {provinces[pid]?.name ?? pid} ({pid})
                      </option>
                    ))}
                  </optgroup>
                )}
              </>
            ) : (
              fallbackTargets.map((pid) => (
                <option key={pid} value={pid}>
                  {provinces[pid]?.name ?? pid} ({pid})
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    );
  }

  return null;
};
