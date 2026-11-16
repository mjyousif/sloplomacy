import type React from 'react';
import { memo } from 'react';
import {
  ALL_PROVINCE_GEOMETRIES,
  MAP_VIEWBOX,
} from '../../data/europeMapGeometry';
import { getMapLayout, SEA_SHORT_NAMES } from '../../data/mapLayouts';
import {
  ALL_POWERS,
  type BoardPreview,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import styles from './MiniMap.module.css';

export interface MiniMapProps {
  /** The board to draw. With none, the map shows the bare provinces. */
  board: BoardPreview | null | undefined;
  /** The viewer's power: their units get a ring so they stand out. */
  viewerPower?: Power | null;
  /** Units are left off the thumbnails, where they would be specks. */
  showUnits?: boolean;
  /** What a screen reader calls the map, e.g. "Board of Concert of Vienna". */
  label: string;
}

const LAND = ALL_PROVINCE_GEOMETRIES.filter((g) => !(g.id in SEA_SHORT_NAMES));
// The compact layout keeps every unit inside its own province (classic puts Clyde's at sea).
const LAYOUT = getMapLayout('compact');
const UNIT_SIZE = 15;
const PARCHMENT = '#efd3b0';

/** `amount` of one `#rrggbb` colour laid over another, as the board's tinted fills look. */
function blend(over: string, under: string, amount: number): string {
  const channel = (hex: string, i: number) =>
    Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mixed = [0, 1, 2].map((i) =>
    Math.round(channel(over, i) * amount + channel(under, i) * (1 - amount)),
  );
  return `rgb(${mixed.join(', ')})`;
}

// Each power's colour washed over parchment, the way the board tints the land a power holds.
const OWNER_FILL = Object.fromEntries(
  ALL_POWERS.map((power) => [
    power,
    blend(POWER_METADATA[power].fillColor, PARCHMENT, 0.7),
  ]),
) as Record<Power, string>;

/**
 * A small, static map of a game: each land province in its owner's colour and a dot per unit.
 * It is a picture, not the board: nothing on it can be clicked, and it ignores the player's
 * piece style.
 */
export const MiniMap: React.FC<MiniMapProps> = memo(
  ({ board, viewerPower = null, showUnits = true, label }) => {
    const ownership = board?.ownership ?? {};
    return (
      <svg
        className={styles.miniMap}
        viewBox={MAP_VIEWBOX}
        role="img"
        aria-label={label}
        data-testid="mini-map"
        data-has-board={board ? 'true' : 'false'}
      >
        {LAND.map((geom) => {
          const owner = ownership[geom.id];
          return (
            <path
              key={geom.id}
              d={geom.path}
              className={styles.province}
              data-province-id={geom.id}
              data-owner={owner}
              fill={owner ? OWNER_FILL[owner] : PARCHMENT}
            />
          );
        })}
        {showUnits &&
          board?.units.map((unit) => {
            const at = LAYOUT[unit.province]?.unit;
            if (!at) return null;
            const mine = unit.power === viewerPower;
            const shared = {
              className: styles.unit,
              fill: POWER_METADATA[unit.power].color,
              'data-testid': 'mini-map-unit',
              'data-power': unit.power,
              'data-mine': mine ? 'true' : undefined,
            };
            const key = `${unit.power}-${unit.unit_type}-${unit.province}`;
            // Armies are discs and fleets are squares, as on the board's simplest pieces.
            return unit.unit_type === 'F' ? (
              <rect
                key={key}
                x={at.x - UNIT_SIZE}
                y={at.y - UNIT_SIZE}
                width={UNIT_SIZE * 2}
                height={UNIT_SIZE * 2}
                rx={5}
                {...shared}
              />
            ) : (
              <circle key={key} cx={at.x} cy={at.y} r={UNIT_SIZE} {...shared} />
            );
          })}
      </svg>
    );
  },
);
