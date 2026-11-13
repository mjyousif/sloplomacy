import { memo } from 'react';
import { ALL_PROVINCE_GEOMETRIES } from '../../../data/europeMapGeometry';
import { getMapLayout } from '../../../data/mapLayouts';
import {
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../../../types/diplomacy';
import type { PieceStyle } from '../../../utils/displayPrefs';
import { SupplyStar } from '../../MapPiece';

const STAR_SCALE: Record<PieceStyle, number> = {
  classic: 1,
  seated: 0.85,
  compact: 0.65,
  flags: 0.72,
  nameplate: 0.5,
};

export const SupplyCentersLayer = memo<{
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  pieceStyle: PieceStyle;
  occupied: string;
}>(({ provinces, ownership, pieceStyle, occupied }) => {
  // Name as piece draws each star beside its name or inside the pill instead
  if (pieceStyle === 'nameplate') return null;

  const layout = getMapLayout(pieceStyle);
  const sharesUnitPoint = pieceStyle === 'seated' || pieceStyle === 'flags';
  // In Star seat the unit carries the star, so only empty centers are drawn here
  const carried = pieceStyle === 'seated' ? new Set(occupied.split(',')) : null;
  const hasOwnershipData = Object.keys(ownership).length > 0;

  return (
    <g className="supply-centers-layer" pointerEvents="none">
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const pInfo = provinces[geom.id];
        const entry = layout[geom.id];
        const point = sharesUnitPoint ? entry?.unit : entry?.star;
        if (
          !pInfo ||
          !pInfo.is_supply_center ||
          !point ||
          carried?.has(geom.id)
        )
          return null;
        const owner =
          ownership[geom.id] ||
          (hasOwnershipData ? undefined : pInfo.home_power);
        return (
          <g
            key={`sc_${geom.id}`}
            transform={`translate(${point.x}, ${point.y})`}
          >
            <SupplyStar
              ownerColor={owner ? POWER_METADATA[owner].color : undefined}
              scale={STAR_SCALE[pieceStyle]}
            />
          </g>
        );
      })}
    </g>
  );
});
