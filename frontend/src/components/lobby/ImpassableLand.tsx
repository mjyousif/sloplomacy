import type React from 'react';
import { useId } from 'react';
import { IMPASSABLE_LAND } from './impassableLand';
import styles from './MiniMap.module.css';

function Shapes({ fill, className }: { fill?: string; className?: string }) {
  return IMPASSABLE_LAND.map((shape) => {
    const common = {
      transform: shape.transform,
      className,
      fill,
      'data-impassable-id': shape.id,
    };
    return shape.kind === 'path' ? (
      <path key={shape.id} d={shape.geometry} {...common} />
    ) : (
      <polygon key={shape.id} points={shape.geometry} {...common} />
    );
  });
}

/**
 * Land nobody can enter (Iceland, Ireland, Switzerland, Cyprus and the small islands): a flat
 * colour of its own, so it never reads as neutral land a player could move into. With `striped`
 * the board's faint stripes go on top, as the board draws them.
 */
export const ImpassableLand: React.FC<{ striped: boolean }> = ({ striped }) => {
  const pattern = `mini-map-stripes-${useId().replace(/:/g, '')}`;
  return (
    <g data-testid="mini-map-impassable">
      {striped && (
        <defs>
          {/* The board's `impassableStripes`: 16-unit tiles turned 35 degrees. */}
          <pattern
            id={pattern}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="16"
              stroke="#000000"
              strokeOpacity="0.1"
              strokeWidth="18"
            />
          </pattern>
        </defs>
      )}
      <Shapes className={styles.impassable} />
      {striped && (
        <Shapes
          className={styles.impassableStripes}
          fill={`url(#${pattern})`}
        />
      )}
    </g>
  );
};
