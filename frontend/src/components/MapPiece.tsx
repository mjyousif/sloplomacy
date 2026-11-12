import type { Point } from '../data/europeMapGeometry';
import type { FlagDirection } from '../data/mapLayouts';
import type { PieceStyle, UnitMark } from '../utils/displayPrefs';
import { DEFAULT_RIM, SupplyStar } from './pieces/marks';
import type {
  PieceFrame,
  PieceUnitType,
  PieceVariant,
} from './pieces/pieceFrame';
import { DiscPiece } from './pieces/styles/DiscPiece';
import { FlagPiece } from './pieces/styles/FlagPiece';
import { PillPiece } from './pieces/styles/PillPiece';

// Everything a piece is made of lives in `pieces/`. This is the one entry point the map, the
// order arrows and the display settings import from.
export {
  PieceHitArea,
  PieceHoldOutline,
  PieceOutline,
} from './pieces/PieceOutlines';
export {
  getPieceArrowScale,
  getPieceFrame,
  makePiecePill,
  type PieceFrame,
  type PiecePill,
  type PieceUnitType,
  type PieceVariant,
} from './pieces/pieceFrame';
export { SupplyStar };

const DISC_SCALE: Partial<Record<PieceStyle, number>> = {
  classic: 1,
  seated: 0.76,
  compact: 0.65,
};

const SEATED_STAR_OFFSET: Point = { x: 11, y: 11 };
const SEATED_STAR_SCALE = 0.62;

interface MapPieceProps {
  style: PieceStyle;
  mark: UnitMark;
  unitType: PieceUnitType;
  color: string;
  variant?: PieceVariant;
  rim?: string;
  frame: PieceFrame;
  flagDirection?: FlagDirection;
  /** A flag's pole rises from the star when the province has one. */
  hasStar?: boolean;
  /** The star carried on the piece, in styles where it sits on the unit. */
  showStar?: boolean;
  starOwnerColor?: string;
}

/** One unit's body, for any style and mark. The map draws rings and badges around it. */
export function MapPiece({
  style,
  mark,
  unitType,
  color,
  variant = 'unit',
  rim = DEFAULT_RIM,
  frame,
  flagDirection = 1,
  hasStar = false,
  showStar = false,
  starOwnerColor,
}: MapPieceProps) {
  if (frame.pill) {
    return (
      <PillPiece
        pill={frame.pill}
        mark={mark}
        unitType={unitType}
        color={color}
        rim={rim}
        starOwnerColor={starOwnerColor}
      />
    );
  }
  if (style === 'flags') {
    return (
      <FlagPiece
        mark={mark}
        unitType={unitType}
        color={color}
        rim={rim}
        direction={flagDirection}
        hasStar={hasStar}
      />
    );
  }
  return (
    <>
      <DiscPiece
        mark={mark}
        unitType={unitType}
        color={color}
        rim={rim}
        variant={variant}
        scale={DISC_SCALE[style] ?? 1}
      />
      {style === 'seated' && showStar && (
        <g
          transform={`translate(${SEATED_STAR_OFFSET.x}, ${SEATED_STAR_OFFSET.y})`}
        >
          <SupplyStar ownerColor={starOwnerColor} scale={SEATED_STAR_SCALE} />
        </g>
      )}
    </>
  );
}
