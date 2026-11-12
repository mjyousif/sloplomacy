import {
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../../../types/diplomacy';
import { PieceOutline, SupplyStar } from '../../MapPiece';
import type { PieceGeometry } from '../hooks/usePieceGeometry';

interface AdminOwnershipChangesLayerProps {
  beforeOwnership: Record<string, Power>;
  afterOwnership: Record<string, Power>;
  provinces: Record<string, ProvinceInfo>;
  historyPower: Power | null;
  occupiedProvinces: Set<string>;
  getProvincePoint: PieceGeometry['getProvincePoint'];
  describePiece: PieceGeometry['describePiece'];
}

/**
 * Rendered when viewing a consolidated "Admin" turn in Turn History: highlights every
 * Supply Center whose ownership was changed by the administrator during that turn window,
 * matching the visual treatment of BUILD and DISBAND badges for unit edits.
 */
export function AdminOwnershipChangesLayer({
  beforeOwnership,
  afterOwnership,
  provinces,
  historyPower,
  occupiedProvinces,
  getProvincePoint,
  describePiece,
}: AdminOwnershipChangesLayerProps) {
  const allProvs = Array.from(
    new Set([...Object.keys(beforeOwnership), ...Object.keys(afterOwnership)]),
  ).sort();

  const changedProvs = allProvs.filter((prov) => {
    const prev = beforeOwnership[prov] ?? null;
    const next = afterOwnership[prov] ?? null;
    if (prev === next) return false;
    if (
      historyPower !== null &&
      prev !== historyPower &&
      next !== historyPower
    ) {
      return false;
    }
    return Boolean(provinces[prov]);
  });

  if (changedProvs.length === 0) return null;

  return (
    <g
      className="admin-ownership-changes-layer"
      pointerEvents="none"
      data-testid="admin-ownership-changes-layer"
    >
      {changedProvs.map((prov) => {
        const newOwner = afterOwnership[prov] ?? null;
        const meta = newOwner ? POWER_METADATA[newOwner] : null;
        const accentColor = meta ? meta.color : '#64748b';
        const labelText = meta
          ? `OWNER: ${meta.shortName.toUpperCase()}`
          : 'OWNER: NEUTRAL';
        const pt = getProvincePoint(prov);
        const pieceDesc = describePiece(prov, null, false);
        const isOccupied = occupiedProvinces.has(prov);
        const bannerY = isOccupied
          ? pieceDesc.frame.bannerY + 18
          : pieceDesc.frame.bannerY;
        const pillWidth = Math.max(78, labelText.length * 5.6 + 14);

        return (
          <g
            key={`admin_own_${prov}`}
            transform={`translate(${pt.x}, ${pt.y})`}
            data-testid="admin-ownership-change"
            data-province={prov}
            data-owner={newOwner ?? 'NEUTRAL'}
          >
            {!isOccupied && (
              <>
                <PieceOutline
                  frame={pieceDesc.frame}
                  radius={23}
                  fill={meta ? `${meta.color}33` : 'rgba(100, 116, 139, 0.22)'}
                  stroke={accentColor}
                  strokeWidth="2.6"
                  strokeDasharray="5 3"
                />
                <SupplyStar ownerColor={meta?.color} scale={1.1} />
              </>
            )}
            <g transform={`translate(0, ${bannerY})`}>
              <rect
                x={-pillWidth / 2}
                y="-8"
                width={pillWidth}
                height="16"
                rx="4"
                fill="#1e293b"
                stroke={meta ? '#fef3c7' : '#cbd5e1'}
                strokeWidth="1.3"
              />
              <text
                y="3.5"
                textAnchor="middle"
                fill="#fef3c7"
                fontSize="8.2"
                fontWeight="800"
              >
                {labelText}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}
