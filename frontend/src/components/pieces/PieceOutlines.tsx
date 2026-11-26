import {
  PILL_POINT,
  type PieceBox,
  type PieceFrame,
  type PiecePill,
  type PieceUnitType,
} from './pieceFrame';

interface OutlinePaint {
  fill: string;
  stroke: string;
  strokeWidth: string | number;
  strokeDasharray?: string;
  opacity?: string | number;
}

type Pt = [number, number];

/** How far a ring of `radius` (sized for a classic token) stands off a plate or a flag. */
const outlinePad = (radius: number) => (radius - 17) * 0.55;

const toPoints = (points: Pt[]) =>
  points.map(([x, y]) => `${x},${y}`).join(' ');

/**
 * A fleet's name plate (a pill with a point at each end, as `PillPiece` draws it) grown by
 * `pad`, every edge moved straight out, so the points stay sharp instead of being cut off.
 */
function fleetPlateOutline(pill: PiecePill, pad: number): Pt[] {
  const hw = pill.width / 2;
  const hh = pill.height / 2;
  const point = hh * PILL_POINT;
  const slant = Math.hypot(point, hh);
  const corner = hw + (pad * (slant - point)) / hh;
  const tip = hw + point + (pad * slant) / hh;
  const top = hh + pad;
  return [
    [-corner, -top],
    [corner, -top],
    [tip, 0],
    [corner, top],
    [-corner, top],
    [-tip, 0],
  ];
}

/** An eight-sided ring around a box, its corners cut off. */
function chamferedBox({ x0, y0, x1, y1 }: PieceBox, pad: number): Pt[] {
  const [l, t, r, b] = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const c = Math.min(r - l, b - t) * 0.3;
  return [
    [l + c, t],
    [r - c, t],
    [r, t + c],
    [r, b - c],
    [r - c, b],
    [l + c, b],
    [l, b - c],
    [l, t + c],
  ];
}

/**
 * A ring around a piece. `radius` is the size around a classic token, which each style
 * scales to fit. A name plate gets an outline of its own shape (pointed for a fleet, so
 * pass `unitType` when it is known), and a flag a rounded box around its pole and foot.
 */
export function PieceOutline({
  frame,
  radius,
  unitType,
  ...paint
}: {
  frame: PieceFrame;
  radius: number;
  unitType?: PieceUnitType;
} & OutlinePaint) {
  if (frame.pill) {
    const pad = outlinePad(radius);
    const { width, height, angle } = frame.pill;
    if (unitType === 'F') {
      return (
        <polygon
          points={toPoints(fleetPlateOutline(frame.pill, pad))}
          transform={`rotate(${angle})`}
          strokeLinejoin="round"
          {...paint}
        />
      );
    }
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
  if (frame.box) {
    const pad = outlinePad(radius);
    const { x0, y0, x1, y1 } = frame.box;
    return (
      <rect
        x={x0 - pad}
        y={y0 - pad}
        width={x1 - x0 + pad * 2}
        height={y1 - y0 + pad * 2}
        rx={4 + pad}
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
export function PieceHoldOutline({
  frame,
  unitType,
  ...paint
}: { frame: PieceFrame; unitType?: PieceUnitType } & OutlinePaint) {
  if (frame.pill) {
    return (
      <PieceOutline frame={frame} radius={22} unitType={unitType} {...paint} />
    );
  }
  if (frame.box) {
    return (
      <polygon
        points={toPoints(chamferedBox(frame.box, outlinePad(22)))}
        {...paint}
      />
    );
  }
  const points = HOLD_RING.map(
    ([x, y]) =>
      `${x * frame.ringScale + frame.center.x},${y * frame.ringScale + frame.center.y}`,
  ).join(' ');
  return <polygon points={points} {...paint} />;
}

/**
 * Keeps a small piece as easy to click as the original token. On a phone `minRadius` makes it
 * finger-sized, and every style gets one, Classic included; it is transparent, so nothing
 * looks different.
 */
export function PieceHitArea({
  frame,
  minRadius = 0,
}: {
  frame: PieceFrame;
  minRadius?: number;
}) {
  const radius = Math.max(frame.hitRadius, minRadius);
  if (radius === 0) return null;
  return (
    <circle
      cx={frame.center.x}
      cy={frame.center.y}
      r={radius}
      fill="transparent"
    />
  );
}
