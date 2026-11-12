import { MAP_NAME_FONT } from '../../../data/mapTextMetrics';
import type { UnitMark } from '../../../utils/displayPrefs';
import { SupplyStar, UnitMarkGlyph } from '../marks';
import type { PiecePill, PieceUnitType } from '../pieceFrame';

const PILL_MARK_SCALE = 0.56;
const PILL_STAR_SCALE = 0.5;

export function PillPiece({
  pill,
  mark,
  unitType,
  color,
  rim,
  starOwnerColor,
}: {
  pill: PiecePill;
  mark: UnitMark;
  unitType: PieceUnitType;
  color: string;
  rim: string;
  starOwnerColor?: string;
}) {
  const halfWidth = pill.width / 2;
  const halfHeight = pill.height / 2;
  const point = halfHeight * 0.7;
  return (
    <g transform={`rotate(${pill.angle})`}>
      {unitType === 'A' ? (
        <rect
          x={-halfWidth}
          y={-halfHeight}
          width={pill.width}
          height={pill.height}
          rx={halfHeight}
          fill={color}
          stroke={rim}
          strokeWidth="1.4"
        />
      ) : (
        <polygon
          points={`${-halfWidth},${-halfHeight} ${halfWidth},${-halfHeight} ${
            halfWidth + point
          },0 ${halfWidth},${halfHeight} ${-halfWidth},${halfHeight} ${-halfWidth - point},0`}
          fill={color}
          stroke={rim}
          strokeWidth="1.4"
        />
      )}
      <g
        transform={`translate(${-halfWidth + 10}, 0) scale(${PILL_MARK_SCALE})`}
      >
        <UnitMarkGlyph unitType={unitType} mark={mark} color={color} />
      </g>
      <text
        x={pill.textX}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffffff"
        fontSize={pill.fontSize}
        fontWeight="700"
        fontFamily={MAP_NAME_FONT}
        pointerEvents="none"
      >
        {pill.name}
      </text>
      {pill.hasStar && (
        <g transform={`translate(${halfWidth - 7}, 0)`}>
          <SupplyStar ownerColor={starOwnerColor} scale={PILL_STAR_SCALE} />
        </g>
      )}
    </g>
  );
}
