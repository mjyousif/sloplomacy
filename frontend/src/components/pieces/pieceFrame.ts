import type { Point } from '../../data/europeMapGeometry';
import type { FlagDirection } from '../../data/mapLayouts';
import { measureMapName } from '../../data/mapTextMetrics';
import type { PieceStyle } from '../../utils/displayPrefs';

export type PieceUnitType = 'A' | 'F';

/** A live unit, the simulation's preview at a destination, or a planned winter build. */
export type PieceVariant = 'unit' | 'ghost' | 'build';

const PILL_MARK_ROOM = 18;
/** A fleet's name plate tapers to a point at each end, this fraction of half its height. */
export const PILL_POINT = 0.7;
const PILL_STAR_ROOM = 13;
const PILL_END_ROOM = 8;

export interface PiecePill {
  name: string;
  fontSize: number;
  angle: number;
  hasStar: boolean;
  width: number;
  height: number;
  /** Where the name sits, so the mark and star have room at the ends. */
  textX: number;
}

export function makePiecePill(
  name: string,
  fontSize: number,
  angle: number,
  hasStar: boolean,
): PiecePill {
  const endRoom = hasStar ? PILL_STAR_ROOM : PILL_END_ROOM;
  return {
    name,
    fontSize,
    angle,
    hasStar,
    width: measureMapName(name, fontSize) + PILL_MARK_ROOM + endRoom,
    height: fontSize + 8,
    textX: (PILL_MARK_ROOM - endRoom) / 2,
  };
}

/**
 * Whether a piece in a supply centre carries the centre's star itself, which in Name as
 * piece also makes its plate wider. Elsewhere the star stays on the map beside it.
 */
export function pieceCarriesStar(
  style: PieceStyle,
  isSupplyCenter: boolean,
): boolean {
  return isSupplyCenter && (style === 'seated' || style === 'nameplate');
}

/** A rectangle in the piece's own coordinates, its unit point at the origin. */
export interface PieceBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Everything drawn around a piece takes its size and position from this, so rings,
 * badges and banners suit each style. The classic values are the map's original ones.
 */
export interface PieceFrame {
  center: Point;
  ringScale: number;
  pill: PiecePill | null;
  /**
   * The whole piece, for a style whose outline is not a circle around `center`: a flag
   * with its pole and the star or dot at its foot. Rings around it follow this box.
   */
  box: PieceBox | null;
  /** An invisible click target for pieces smaller than the original token. Zero if unneeded. */
  hitRadius: number;
  badgeLeft: Point;
  badgeRight: Point;
  bannerY: number;
  /** How far a dislodged piece steps aside from the unit that took its province. */
  dislodgeOffset: Point;
  /** Where its banner goes then, so the other unit doesn't cover it. */
  steppedAsideBannerY: number;
}

const ORIGIN: Point = { x: 0, y: 0 };

// A flag's cloth reaches 30 out from its pole (a fleet's pennant, the wider of the two), the
// pole rises 29 with the cloth's rim above it, and the supply star at its foot is about 7 across.
const FLAG_REACH = 30;
const FLAG_TOP = -30;
const FLAG_FOOT = 7;

function flagBox(direction: FlagDirection): PieceBox {
  return {
    x0: Math.min(-FLAG_FOOT, FLAG_REACH * direction),
    y0: FLAG_TOP,
    x1: Math.max(FLAG_FOOT, FLAG_REACH * direction),
    y1: FLAG_FOOT,
  };
}

const ARROW_SCALE: Record<PieceStyle, number> = {
  classic: 1,
  seated: 0.8,
  compact: 0.7,
  flags: 0.5,
  nameplate: 0.8,
};

/** How far order arrows stop short of a piece, relative to the classic token. */
export function getPieceArrowScale(style: PieceStyle): number {
  return ARROW_SCALE[style];
}

export function getPieceFrame(
  style: PieceStyle,
  flagDirection: FlagDirection = 1,
  pill: PiecePill | null = null,
): PieceFrame {
  if (style === 'nameplate' && pill) {
    const angle = (pill.angle * Math.PI) / 180;
    const across = (x: number, y: number): Point => ({
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    });
    return {
      center: ORIGIN,
      ringScale: 1,
      pill,
      box: null,
      hitRadius: 0,
      badgeLeft: across(-pill.width / 2, -pill.height / 2),
      badgeRight: across(pill.width / 2, -pill.height / 2),
      bannerY: pill.height / 2 + 12,
      dislodgeOffset: { x: 0, y: -pill.height - 6 },
      steppedAsideBannerY: -(pill.height / 2 + 12),
    };
  }

  switch (style) {
    case 'seated':
      return {
        center: ORIGIN,
        ringScale: 0.8,
        pill: null,
        box: null,
        hitRadius: 18,
        badgeLeft: { x: -14, y: -14 },
        badgeRight: { x: 13, y: -13 },
        bannerY: 23,
        dislodgeOffset: { x: 19, y: -15 },
        steppedAsideBannerY: -23,
      };
    case 'compact':
      return {
        center: ORIGIN,
        ringScale: 0.68,
        pill: null,
        box: null,
        hitRadius: 17,
        badgeLeft: { x: -12, y: -12 },
        badgeRight: { x: 11, y: -11 },
        bannerY: 20,
        dislodgeOffset: { x: 16, y: -13 },
        steppedAsideBannerY: -20,
      };
    case 'flags':
      return {
        center: { x: 12 * flagDirection, y: -14 },
        ringScale: 0.82,
        pill: null,
        box: flagBox(flagDirection),
        hitRadius: 21,
        badgeLeft: { x: 12 * flagDirection - 15, y: -32 },
        badgeRight: { x: 12 * flagDirection + 15, y: -32 },
        bannerY: 14,
        dislodgeOffset: { x: 20, y: 10 },
        steppedAsideBannerY: 14,
      };
    default:
      return {
        center: ORIGIN,
        ringScale: 1,
        pill: null,
        box: null,
        hitRadius: 0,
        badgeLeft: { x: -17, y: -17 },
        badgeRight: { x: 16, y: -16 },
        bannerY: 26,
        dislodgeOffset: { x: 22, y: -18 },
        steppedAsideBannerY: 26,
      };
  }
}
