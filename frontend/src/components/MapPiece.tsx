import { Point } from '../data/europeMapGeometry';
import { FlagDirection } from '../data/mapLayouts';
import { MAP_NAME_FONT, measureMapName } from '../data/mapTextMetrics';
import { memo } from 'react';
import { PieceStyle, UnitMark } from '../utils/displayPrefs';

export type PieceUnitType = 'A' | 'F';

/** A live unit, the simulation's preview at a destination, or a planned winter build. */
export type PieceVariant = 'unit' | 'ghost' | 'build';

const DEFAULT_RIM = '#fef3c7';

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

const DISC_SCALE: Partial<Record<PieceStyle, number>> = {
  classic: 1,
  seated: 0.76,
  compact: 0.65,
};

const SEATED_STAR_OFFSET: Point = { x: 11, y: 11 };
const SEATED_STAR_SCALE = 0.62;
const FLAG_MARK_SCALE = 0.6;
// A fleet's pennant tapers, so its mark sits smaller and nearer the pole to stay inside it
const PENNANT_MARK_SCALE = 0.5;
const PILL_MARK_SCALE = 0.56;
const PILL_STAR_SCALE = 0.5;
const PILL_MARK_ROOM = 18;
const PILL_STAR_ROOM = 13;
const PILL_END_ROOM = 8;

export function SupplyStar({ ownerColor, scale = 1 }: { ownerColor?: string; scale?: number }) {
  return (
    <g transform={scale === 1 ? undefined : `scale(${scale})`}>
      <circle r="8.5" fill={ownerColor ?? DEFAULT_RIM} stroke="#1c1917" strokeWidth="2" />
      <polygon
        points="0,-5.8 1.6,-1.7 6,-1.7 2.5,1.1 3.8,5.4 0,2.8 -3.8,5.4 -2.5,1.1 -6,-1.7 -1.6,-1.7"
        fill={ownerColor ? '#fde047' : '#57534e'}
      />
    </g>
  );
}

interface UnitMarkGlyphProps {
  unitType: PieceUnitType;
  mark: UnitMark;
  /** The piece's colour, for the details cut out of the tank's tracks. */
  color: string;
  fontSize?: number;
  textY?: number;
  letterPrefix?: string;
}

function CrossedSwords() {
  return (
    <g stroke="#ffffff" strokeLinecap="round" pointerEvents="none">
      <line x1="-7" y1="-7" x2="7" y2="7" strokeWidth="2.6" />
      <line x1="7" y1="-7" x2="-7" y2="7" strokeWidth="2.6" />
      <line x1="-7.5" y1="3" x2="-3" y2="7.5" strokeWidth="2.2" />
      <line x1="7.5" y1="3" x2="3" y2="7.5" strokeWidth="2.2" />
    </g>
  );
}

function SailingShip() {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <path d="M-10 3L10 3L6.5 9L-6.5 9Z" />
      <rect x="-1" y="-10" width="2" height="13" />
      <path d="M1.8 -9.5L8.5 1.5L1.8 1.5Z" />
      <path d="M-1.8 -6.5L-7.5 1.5L-1.8 1.5Z" />
    </g>
  );
}

function Tank({ color }: { color: string }) {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <rect x="-12" y="1.5" width="24" height="7.5" rx="3.75" />
      <rect x="-9.5" y="-3" width="19" height="5" rx="1" />
      <rect x="-5" y="-8" width="10" height="6" rx="1.8" />
      <rect x="3" y="-6.7" width="11" height="2.4" rx="0.6" />
      <g fill={color}>
        <circle cx="-8" cy="5.25" r="1.5" />
        <circle cx="-2.7" cy="5.25" r="1.5" />
        <circle cx="2.7" cy="5.25" r="1.5" />
        <circle cx="8" cy="5.25" r="1.5" />
      </g>
    </g>
  );
}

function Warship() {
  return (
    <g fill="#ffffff" pointerEvents="none">
      <path d="M-14 2.5L14 2.5L10.5 8.5L-10 8.5Z" />
      <rect x="-6.5" y="-2.5" width="9.5" height="5.5" />
      <rect x="-3.5" y="-7" width="4" height="5" />
      <rect x="-2.3" y="-11.5" width="1.6" height="5" />
      <rect x="-11" y="-0.5" width="3.2" height="3.5" />
      <rect x="4.5" y="-0.5" width="4.5" height="3.2" rx="0.6" />
      <rect x="8" y="0" width="5.5" height="1.3" />
    </g>
  );
}

/** The NATO map symbol for armour: a land unit's box around a tracked vehicle's oval. */
function NatoArmour() {
  return (
    <g fill="none" stroke="#ffffff" strokeWidth="2.3" pointerEvents="none">
      <rect x="-12.5" y="-8.5" width="25" height="17" />
      <ellipse rx="7.5" ry="4.2" />
    </g>
  );
}

/** Inspired by NATO naval symbols: the round frame used at sea, around an anchor. */
function NatoNaval() {
  return (
    <g fill="none" stroke="#ffffff" strokeLinecap="round" pointerEvents="none">
      <circle r="10.5" strokeWidth="2.3" />
      <circle cy="-5" r="1.5" strokeWidth="1.6" />
      <path d="M0 -3.5L0 6.5M-3.5 -1.5L3.5 -1.5" strokeWidth="1.8" />
      <path d="M-6 1.5C-5.5 5 -3 6.5 0 6.5C3 6.5 5.5 5 6 1.5" strokeWidth="1.8" />
    </g>
  );
}

function UnitMarkGlyph({
  unitType,
  mark,
  color,
  fontSize = 14.5,
  textY = 5.5,
  letterPrefix = '',
}: UnitMarkGlyphProps) {
  if (mark === 'letters') {
    return (
      <text
        y={textY}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight="800"
        fontFamily="Cinzel, serif"
        pointerEvents="none"
      >
        {letterPrefix}
        {unitType}
      </text>
    );
  }
  if (mark === 'vehicles') {
    return unitType === 'A' ? <Tank color={color} /> : <Warship />;
  }
  if (mark === 'nato') {
    return unitType === 'A' ? <NatoArmour /> : <NatoNaval />;
  }
  return unitType === 'A' ? <CrossedSwords /> : <SailingShip />;
}

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
  hasStar: boolean
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
  pill: PiecePill | null = null
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

interface OutlinePaint {
  fill: string;
  stroke: string;
  strokeWidth: string | number;
  strokeDasharray?: string;
  opacity?: string | number;
}

/**
 * A ring around a piece. `radius` is the size around a classic token, which each
 * style scales to fit, and a pill gets a matching rounded outline instead.
 */
export function PieceOutline({
  frame,
  radius,
  ...paint
}: { frame: PieceFrame; radius: number } & OutlinePaint) {
  if (frame.pill) {
    const pad = (radius - 17) * 0.55;
    const { width, height, angle } = frame.pill;
    return (
      <rect
        x={-width / 2 - pad}
        y={-height / 2 - pad}
        width={width + pad * 2}
        height={height + pad * 2}
        rx={height / 2 + pad}
        transform={`rotate(${angle})`}
        {...paint}
      />
    );
  }
  return (
    <circle
      cx={frame.center.x}
      cy={frame.center.y}
      r={radius * frame.ringScale}
      {...paint}
    />
  );
}

const HOLD_RING = [
  [0, -22],
  [16, -16],
  [22, 0],
  [16, 16],
  [0, 22],
  [-16, 16],
  [-22, 0],
  [-16, -16],
];

/** The eight-sided ring around a unit that is holding. */
export function PieceHoldOutline({ frame, ...paint }: { frame: PieceFrame } & OutlinePaint) {
  if (frame.pill) return <PieceOutline frame={frame} radius={22} {...paint} />;
  const points = HOLD_RING.map(
    ([x, y]) => `${x * frame.ringScale + frame.center.x},${y * frame.ringScale + frame.center.y}`
  ).join(' ');
  return <polygon points={points} {...paint} />;
}

/** Keeps a small piece as easy to click as the original token. */
export function PieceHitArea({ frame }: { frame: PieceFrame }) {
  if (frame.hitRadius === 0) return null;
  return <circle cx={frame.center.x} cy={frame.center.y} r={frame.hitRadius} fill="transparent" />;
}

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

function DiscPiece({
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
        <circle r={shape.radius} fill={color} stroke={rim} strokeWidth={shape.strokeWidth} />
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

function FlagPiece({
  mark,
  unitType,
  color,
  rim,
  direction,
  hasStar,
}: {
  mark: UnitMark;
  unitType: PieceUnitType;
  color: string;
  rim: string;
  direction: FlagDirection;
  hasStar: boolean;
}) {
  const isArmy = unitType === 'A';
  const points = isArmy
    ? `0,-29 ${27 * direction},-29 ${20 * direction},-22 ${27 * direction},-15 0,-15`
    : `0,-29 ${30 * direction},-22 0,-15`;
  const markX = (isArmy ? 9.5 : 8.5) * direction;
  const markScale = isArmy ? FLAG_MARK_SCALE : PENNANT_MARK_SCALE;
  return (
    <g>
      <line x1="0" y1="0" x2="0" y2="-29" stroke="#2b2a22" strokeWidth="2.2" />
      <polygon points={points} fill={color} stroke={rim} strokeWidth="1.3" />
      <g transform={`translate(${markX}, -22) scale(${markScale})`}>
        <UnitMarkGlyph unitType={unitType} mark={mark} color={color} />
      </g>
      {!hasStar && <circle r="3.4" fill={color} stroke={rim} strokeWidth="1.2" />}
    </g>
  );
}

function PillPiece({
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
      <g transform={`translate(${-halfWidth + 10}, 0) scale(${PILL_MARK_SCALE})`}>
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

/**
 * One unit's body, for any style and mark. The map draws rings and badges around it.
 *
 * ⚡ Bolt: Wrapped in React.memo to prevent unnecessary re-renders when the EuropeMap
 * re-renders (e.g., during order planning or simulation updates).
 * Impact: Prevents re-rendering 34+ MapPiece components when unchanged.
 */
export const MapPiece = memo(function MapPiece({
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
        <g transform={`translate(${SEATED_STAR_OFFSET.x}, ${SEATED_STAR_OFFSET.y})`}>
          <SupplyStar ownerColor={starOwnerColor} scale={SEATED_STAR_SCALE} />
        </g>
      )}
    </>
  );
});
