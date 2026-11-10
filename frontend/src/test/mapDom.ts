/**
 * Stand-ins for the map's DOM in hook tests. jsdom has no layout and no pointer capture, so the
 * map's `<svg>` gets a fixed on-screen box and a small capture registry.
 */
import { vi } from 'vitest';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A desktop map pane and a phone's map area. */
export const DESKTOP_BOX: Box = { left: 10, top: 20, width: 980, height: 860 };
export const PHONE_BOX: Box = { left: 0, top: 48, width: 390, height: 700 };

export function makeMapSvg(box: Box = DESKTOP_BOX) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(group);
  document.body.appendChild(svg);
  svg.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON() {},
    }) as DOMRect;
  const captured = new Set<number>();
  svg.setPointerCapture = vi.fn((id: number) => {
    captured.add(id);
  });
  svg.releasePointerCapture = vi.fn((id: number) => {
    captured.delete(id);
  });
  svg.hasPointerCapture = (id: number) => captured.has(id);
  return {
    svg,
    group,
    svgRef: { current: svg as SVGSVGElement | null },
    cameraGroupRef: { current: group as SVGGElement | null },
  };
}

/** The `translate(x, y) scale(z)` the camera wrote, as numbers, or null if it wrote nothing. */
export function readTransform(group: Element) {
  const t = group.getAttribute('transform');
  if (!t) return null;
  const [x, y, zoom] = (t.match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? []).map(Number);
  return { x, y, zoom };
}

/** Lets the pending animation frame run. */
export function nextFrame() {
  vi.advanceTimersByTime(17);
}

/** Fake timers that also hold animation frames, so a test decides when the camera draws. */
export function fakeAnimationFrames() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  });
}
