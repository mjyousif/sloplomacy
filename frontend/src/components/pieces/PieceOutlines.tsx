import type { PieceFrame } from './pieceFrame';

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
export function PieceHoldOutline({
  frame,
  ...paint
}: { frame: PieceFrame } & OutlinePaint) {
  if (frame.pill) return <PieceOutline frame={frame} radius={22} {...paint} />;
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
