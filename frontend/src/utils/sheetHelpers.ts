/**
 * Snap math for the phone order sheet (`BottomSheet`). Heights are how much of the sheet shows
 * above the bottom of the game area, in CSS pixels.
 */

export type SheetSnap = 'peek' | 'half' | 'full';

export interface SheetSnapHeights {
  peek: number;
  half: number;
  full: number;
}

/** How much map stays visible above a fully open sheet, so it still reads as a sheet. */
export const SHEET_TOP_GAP = 48;

/** A release faster than this (px per ms) carries the sheet on to the next snap in that direction. */
export const SHEET_FLICK_VELOCITY = 0.5;

const SNAP_ORDER: SheetSnap[] = ['peek', 'half', 'full'];

/**
 * The three snap heights for a game area `containerHeight` tall. Peek is whatever the sheet's
 * always-visible part needs. Half and full never drop below the snap before them, so a short
 * landscape screen still gets three distinct (or at worst equal) stops.
 */
export function snapHeights(
  containerHeight: number,
  peekPx: number,
  topGap: number = SHEET_TOP_GAP,
): SheetSnapHeights {
  const height = Math.max(0, containerHeight);
  const full = Math.max(0, height - topGap);
  const peek = Math.min(Math.max(0, peekPx), full);
  const half = Math.min(full, Math.max(peek, Math.round(height / 2)));
  return { peek, half, full };
}

/**
 * Where a released drag settles. `visible` is how much of the sheet shows when the finger lifts;
 * `velocity` is in px per ms, positive while the sheet was growing. A flick moves one snap on
 * from where the sheet is in that direction; otherwise the closest snap wins.
 */
export function nearestSnap(
  visible: number,
  velocity: number,
  heights: SheetSnapHeights,
): SheetSnap {
  if (Math.abs(velocity) >= SHEET_FLICK_VELOCITY) {
    if (velocity > 0) {
      return SNAP_ORDER.find((snap) => heights[snap] > visible + 1) ?? 'full';
    }
    return (
      [...SNAP_ORDER].reverse().find((snap) => heights[snap] < visible - 1) ??
      'peek'
    );
  }
  let best: SheetSnap = 'peek';
  for (const snap of SNAP_ORDER) {
    if (Math.abs(heights[snap] - visible) < Math.abs(heights[best] - visible))
      best = snap;
  }
  return best;
}

/** A tap on the handle steps peek → half → full → peek. */
export function nextSnap(snap: SheetSnap): SheetSnap {
  return SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length];
}

/** Keeps a dragged sheet between its peek and full heights. */
export function clampSheetHeight(
  visible: number,
  heights: SheetSnapHeights,
): number {
  return Math.min(heights.full, Math.max(heights.peek, visible));
}
