import type React from 'react';
import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';

interface ConvoyControlsProps {
  /** The fleet's CONVOY order. */
  order: Order;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitOptions?: UnitMoveOptions | null;
  onUpdateOrder: (order: Order) => void;
}

/** The "Army" and "To Coast" selects of a CONVOY order. */
export const ConvoyControls: React.FC<ConvoyControlsProps> = ({
  order,
  provinces,
  units,
  unitOptions = null,
  onUpdateOrder,
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
};
