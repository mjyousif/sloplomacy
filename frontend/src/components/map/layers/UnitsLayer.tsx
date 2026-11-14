import type { Unit } from '../../../types/diplomacy';
import styles from './UnitsLayer.module.css';
import { UnitToken } from './units/UnitToken';
import type { UnitLayerContext } from './units/unitLayerContext';

/** Every unit on the board, dislodged ones included. */
export function UnitsLayer({
  units,
  ctx,
}: {
  units: Unit[];
  ctx: UnitLayerContext;
}) {
  return (
    <g className={styles.unitsLayer}>
      {units.map((u) => (
        <UnitToken key={u.id} unit={u} ctx={ctx} />
      ))}
    </g>
  );
}
