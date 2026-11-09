import type { Point } from '../../../data/europeMapGeometry';

export function computeQuadraticCurve(
  p1: Point,
  p2: Point,
  curvature = 0.14,
  insetScale = 1,
): { path: string; mid: Point } {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const shrink = Math.min(26 * insetScale, dist * 0.22);
  const startShrink = Math.min(18 * insetScale, dist * 0.15);
  const sx = p1.x + (dx / dist) * startShrink;
  const sy = p1.y + (dy / dist) * startShrink;
  const ex = p2.x - (dx / dist) * shrink;
  const ey = p2.y - (dy / dist) * shrink;

  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const nx = -dy / dist;
  const ny = dx / dist;
  const offset = dist * curvature;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;

  const qx = 0.25 * sx + 0.5 * cx + 0.25 * ex;
  const qy = 0.25 * sy + 0.5 * cy + 0.25 * ey;

  return {
    path: `M ${sx.toFixed(1)},${sy.toFixed(1)} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(
      1,
    )},${ey.toFixed(1)}`,
    mid: { x: qx, y: qy },
  };
}
