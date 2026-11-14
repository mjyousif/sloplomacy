import { memo } from 'react';
import { ALL_PROVINCE_GEOMETRIES } from '../../../data/europeMapGeometry';
import { getMapLayout, SHARED_MAP_NAMES_SVG } from '../../../data/mapLayouts';
import { MAP_NAME_FONT, measureMapName } from '../../../data/mapTextMetrics';
import {
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../../../types/diplomacy';
import type { PieceStyle } from '../../../utils/displayPrefs';
import { SupplyStar } from '../../MapPiece';
import styles from './MapNamesLayer.module.css';
import { StaticNamesLayer } from './StaticLayers';

// Room kept beside a name for its star in the Name as piece style
const NAME_STAR_ROOM = 6;

/**
 * Province names, fitted around the active piece style. Classic keeps the original
 * typesetting. The other styles share its sea names and place land names themselves.
 */
export const MapNamesLayer = memo<{
  pieceStyle: PieceStyle;
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  occupied: string;
}>(({ pieceStyle, provinces, ownership, occupied }) => {
  if (pieceStyle === 'classic') return <StaticNamesLayer />;

  const layout = getMapLayout(pieceStyle);
  const isNameplate = pieceStyle === 'nameplate';
  const hidden = isNameplate ? new Set(occupied.split(',')) : null;
  const hasOwnershipData = Object.keys(ownership).length > 0;

  return (
    <g className="authentic-names-layer" pointerEvents="none">
      <g dangerouslySetInnerHTML={{ __html: SHARED_MAP_NAMES_SVG }} />
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const placement = layout[geom.id]?.name;
        const pInfo = provinces[geom.id];
        if (!placement || !pInfo || hidden?.has(geom.id)) return null;

        const hasStar = isNameplate && pInfo.is_supply_center;
        const owner =
          ownership[geom.id] ||
          (pInfo.is_supply_center && hasOwnershipData
            ? undefined
            : pInfo.home_power);
        const nameWidth = measureMapName(pInfo.name, placement.size);
        return (
          <g
            key={`name_${geom.id}`}
            transform={`translate(${placement.x}, ${placement.y}) rotate(${placement.angle})`}
          >
            <text
              className={styles.mapProvinceName}
              x={hasStar ? NAME_STAR_ROOM : 0}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily={MAP_NAME_FONT}
              fontWeight="700"
              fontSize={placement.size}
            >
              {pInfo.name}
            </text>
            {hasStar && (
              <g
                transform={`translate(${NAME_STAR_ROOM - nameWidth / 2 - 8}, 0)`}
              >
                <SupplyStar
                  ownerColor={owner ? POWER_METADATA[owner].color : undefined}
                  scale={0.5}
                />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
});
