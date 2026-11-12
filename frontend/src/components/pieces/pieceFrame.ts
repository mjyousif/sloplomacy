import type { Point } from '../../data/europeMapGeometry';
import type { FlagDirection } from '../../data/mapLayouts';
import { measureMapName } from '../../data/mapTextMetrics';
import type { PieceStyle } from '../../utils/displayPrefs';

export type PieceUnitType = 'A' | 'F';

/** A live unit, the simulation's preview at a destination, or a planned winter build. */
export type PieceVariant = 'unit' | 'ghost' | 'build';

const PILL_MARK_ROOM = 18;
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
 * Everything drawn around a piece takes its size and position from this, so rings,
 * badges and banners suit each style. The classic values are the map's original ones.
 */
export interface PieceFrame {
  center: Point;
  ringScale: number;
  pill: PiecePill | null;
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
        hitRadius: 0,
        badgeLeft: { x: -17, y: -17 },
        badgeRight: { x: 16, y: -16 },
        bannerY: 26,
        dislodgeOffset: { x: 22, y: -18 },
        steppedAsideBannerY: 26,
      };
  }
}
