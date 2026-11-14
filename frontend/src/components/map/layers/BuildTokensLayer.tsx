import type React from 'react';
import {
  type Order,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
} from '../../../types/diplomacy';
import type { PieceStyle, UnitMark } from '../../../utils/displayPrefs';
import {
  MapPiece,
  type PieceFrame,
  PieceHitArea,
  PieceOutline,
} from '../../MapPiece';
import type { PieceGeometry } from '../hooks/usePieceGeometry';
import tokenStyles from './units/UnitToken.module.css';

interface BuildTokensLayerProps {
  /** Home centres with a build slot drawn this winter, with the power that builds there. */
  buildHomes: Record<string, Power>;
  orders: Record<string, Order>;
  provinces: Record<string, ProvinceInfo>;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  pieceStyle: PieceStyle;
  unitMark: UnitMark;
  getProvincePoint: PieceGeometry['getProvincePoint'];
  describePiece: PieceGeometry['describePiece'];
  touchHitRadius: (pieceId: string, frame: PieceFrame) => number;
  /** True after a drag, so the click that ends it selects nothing. */
  dragMovedRef: React.RefObject<boolean>;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
}

/**
 * A winter's build slots: the piece being built (or "+ BUILD HERE" while waived), on its home
 * centre and coast. A slot is selected like a unit, to open its build menu.
 */
export function BuildTokensLayer({
  buildHomes,
  orders,
  provinces,
  selectedUnitId,
  hoveredUnitId,
  pieceStyle,
  unitMark,
  getProvincePoint,
  describePiece,
  touchHitRadius,
  dragMovedRef,
  onSelectUnit,
  onHoverUnit,
}: BuildTokensLayerProps) {
  return (
    <g className="build-tokens-layer">
      {Object.entries(buildHomes).map(([homeProv, pwr]) => {
        const bId = `BUILD_${pwr}_${homeProv}`;
        const bOrder = orders[bId];
        const isSelected = selectedUnitId === bId;
        const isHovered = hoveredUnitId === bId;
        const isWaived = bOrder?.order_type === 'WAIVE';
        const uType = bOrder?.unit_type || 'A';
        const cst = uType === 'F' ? bOrder?.origin_coast : null;
        const pt = getProvincePoint(homeProv, cst);
        const meta = POWER_METADATA[pwr];
        const buildPiece = describePiece(homeProv, cst, false);

        return (
          <g
            key={bId}
            transform={`translate(${pt.x}, ${pt.y})`}
            className={tokenStyles.mapUnitToken}
            data-testid="build-token"
            data-build-id={bId}
            data-home-province={homeProv}
            data-power={pwr}
            onClick={(e) => {
              e.stopPropagation();
              if (dragMovedRef.current) return;
              onSelectUnit(isSelected ? null : bId);
            }}
            onPointerEnter={(e) => {
              if (e.pointerType !== 'touch') onHoverUnit(bId);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== 'touch') onHoverUnit(null);
            }}
          >
            <PieceHitArea
              frame={buildPiece.frame}
              minRadius={touchHitRadius(bId, buildPiece.frame)}
            />
            {(isSelected || isHovered) && (
              <PieceOutline
                frame={buildPiece.frame}
                radius={28}
                fill="rgba(34, 197, 94, 0.25)"
                stroke="#22c55e"
                strokeWidth="3.5"
              />
            )}
            <PieceOutline
              frame={buildPiece.frame}
              radius={23}
              fill={
                isWaived
                  ? 'rgba(100, 116, 139, 0.2)'
                  : 'rgba(22, 163, 74, 0.22)'
              }
              stroke={isWaived ? '#64748b' : '#16a34a'}
              strokeWidth="2.6"
              strokeDasharray="5 3"
            />
            {!isWaived ? (
              <>
                <MapPiece
                  style={pieceStyle}
                  mark={unitMark}
                  unitType={uType}
                  color={meta.color}
                  variant="build"
                  rim="#4ade80"
                  frame={buildPiece.frame}
                  flagDirection={buildPiece.flagDirection}
                  hasStar={Boolean(provinces[homeProv]?.is_supply_center)}
                />
                <g transform={`translate(0, ${buildPiece.frame.bannerY})`}>
                  <rect
                    x="-34"
                    y="-8"
                    width="68"
                    height="16"
                    rx="4"
                    fill="#15803d"
                    stroke="#fef3c7"
                    strokeWidth="1.2"
                  />
                  <text
                    y="3.5"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8.5"
                    fontWeight="800"
                  >
                    BUILD {uType}
                    {cst ? `/${cst}` : ''}
                  </text>
                </g>
              </>
            ) : (
              <g transform={`translate(0, ${buildPiece.frame.bannerY})`}>
                <rect
                  x="-36"
                  y="-8"
                  width="72"
                  height="16"
                  rx="4"
                  fill="#334155"
                  stroke="#cbd5e1"
                  strokeWidth="1.2"
                />
                <text
                  y="3.5"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="8.5"
                  fontWeight="800"
                >
                  + BUILD HERE
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
