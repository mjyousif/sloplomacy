import { describe, expect, it } from 'vitest';
import {
  clampSheetHeight,
  nearestSnap,
  nextSnap,
  SHEET_TOP_GAP,
  snapHeights,
} from './sheetHelpers';

describe('snapHeights', () => {
  it('peeks at the given height, opens halfway, and leaves a strip of map when full', () => {
    expect(snapHeights(760, 120)).toEqual({
      peek: 120,
      half: 380,
      full: 760 - SHEET_TOP_GAP,
    });
  });

  it('never lets half drop below peek on a short landscape screen', () => {
    const heights = snapHeights(300, 180);
    expect(heights.peek).toBe(180);
    expect(heights.half).toBe(180);
    expect(heights.full).toBe(252);
  });

  it('caps peek at full when the peek content is taller than the screen allows', () => {
    const heights = snapHeights(200, 400);
    expect(heights.full).toBe(152);
    expect(heights.peek).toBe(152);
    expect(heights.half).toBe(152);
  });

  it('treats a zero or negative container as empty', () => {
    expect(snapHeights(-10, 100)).toEqual({ peek: 0, half: 0, full: 0 });
  });
});

describe('nearestSnap', () => {
  const heights = { peek: 120, half: 380, full: 712 };

  it('settles on the closest snap for a slow release', () => {
    expect(nearestSnap(130, 0, heights)).toBe('peek');
    expect(nearestSnap(300, 0.1, heights)).toBe('half');
    expect(nearestSnap(600, -0.1, heights)).toBe('full');
  });

  it('carries a fast upward flick to the next snap above', () => {
    expect(nearestSnap(140, 0.8, heights)).toBe('half');
    expect(nearestSnap(400, 0.8, heights)).toBe('full');
    expect(nearestSnap(712, 0.8, heights)).toBe('full');
  });

  it('carries a fast downward flick to the next snap below', () => {
    expect(nearestSnap(700, -0.8, heights)).toBe('half');
    expect(nearestSnap(370, -0.8, heights)).toBe('peek');
    expect(nearestSnap(120, -0.8, heights)).toBe('peek');
  });
});

describe('nextSnap', () => {
  it('cycles peek, half, full and back', () => {
    expect(nextSnap('peek')).toBe('half');
    expect(nextSnap('half')).toBe('full');
    expect(nextSnap('full')).toBe('peek');
  });
});

describe('clampSheetHeight', () => {
  it('keeps a drag between peek and full', () => {
    const heights = { peek: 120, half: 380, full: 712 };
    expect(clampSheetHeight(50, heights)).toBe(120);
    expect(clampSheetHeight(500, heights)).toBe(500);
    expect(clampSheetHeight(900, heights)).toBe(712);
  });
});
