import type { UnitMark } from '../../../utils/displayPrefs';
import { UnitMarkGlyph } from '../marks';
import type { PieceUnitType, PieceVariant } from '../pieceFrame';

interface DiscShape {
  radius: number;
  fleetPoints: string;
  strokeWidth: number;
  fontSize: number;
  textY: number;
}

const DISC_SHAPES: Record<PieceVariant, DiscShape> = {
  unit: {
    radius: 17,
    fleetPoints: '0,-19 18,-7 14,15 -14,15 -18,-7',
    strokeWidth: 2.8,
    fontSize: 14.5,
    textY: 5.5,
  },
  ghost: {
    radius: 15,
    fleetPoints: '0,-17 16,-6 12,13 -12,13 -16,-6',
    strokeWidth: 2.5,
    fontSize: 12.5,
    textY: 5,
  },
  build: {
    radius: 16,
    fleetPoints: '0,-18 17,-6 13,14 -13,14 -17,-6',
    strokeWidth: 2.8,
    fontSize: 12.5,
    textY: 5,
  },
};

export function DiscPiece({
  mark,
  unitType,
  color,
  rim,
  variant,
  scale,
}: {
  mark: UnitMark;
  unitType: PieceUnitType;
  color: string;
  rim: string;
  variant: PieceVariant;
  scale: number;
}) {
  const shape = DISC_SHAPES[variant];
  const isArmy = unitType === 'A';
  return (
    <g transform={scale === 1 ? undefined : `scale(${scale})`}>
      {variant === 'unit' &&
        (isArmy ? (
          <circle cx="0" cy="3.2" r="18.2" fill="rgba(15, 23, 42, 0.52)" />
        ) : (
          <polygon
            points="0,-15.8 19,-3.8 15,18.2 -15,18.2 -19,-3.8"
            fill="rgba(15, 23, 42, 0.52)"
          />
        ))}
      {isArmy ? (
        <circle
          r={shape.radius}
          fill={color}
          stroke={rim}
          strokeWidth={shape.strokeWidth}
        />
      ) : (
        <polygon
          points={shape.fleetPoints}
          fill={color}
          stroke={rim}
          strokeWidth={shape.strokeWidth}
        />
      )}
      <UnitMarkGlyph
        unitType={unitType}
        mark={mark}
        color={color}
        fontSize={shape.fontSize}
        textY={shape.textY}
        letterPrefix={variant === 'build' ? '+' : ''}
      />
    </g>
  );
}
