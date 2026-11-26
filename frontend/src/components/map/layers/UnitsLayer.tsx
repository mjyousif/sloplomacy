import type { Unit } from '../../../types/diplomacy';
import styles from './UnitsLayer.module.css';
import { UnitToken } from './units/UnitToken';
import type { UnitLayerContext } from './units/unitLayerContext';

/**
 * Every unit on the board, dislodged ones included. The selected unit is drawn last, so its
 * lifted piece stands over its neighbours. Hover never reorders, so a piece can't move
 * under the pointer.
 */
export function UnitsLayer({
  units,
  ctx,
}: {
  units: Unit[];
  ctx: UnitLayerContext;
}) {
  const selectedId = ctx.selectedUnit?.id;
  const ordered = selectedId
    ? [
        ...units.filter((u) => u.id !== selectedId),
        ...units.filter((u) => u.id === selectedId),
      ]
    : units;
  return (
    <g className={styles.unitsLayer}>
      {ordered.map((u) => (
        <UnitToken key={u.id} unit={u} ctx={ctx} />
      ))}
    </g>
  );
}
