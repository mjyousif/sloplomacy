/** The typeface every province name is set in. */
export const MAP_NAME_FONT = "'Libre Baskerville', Georgia, serif";

/**
 * Libre Baskerville Bold advance widths in 1/1000 em, measured in the browser.
 * The map needs widths without touching the DOM: pills are sized from them at
 * render time, and the layout tests run with no browser at all.
 */
const ADVANCE_WIDTHS: Record<string, number> = {
  ' ': 266, '.': 260, '-': 457,
  A: 809, B: 797, C: 823, D: 919, E: 764, F: 689, G: 876, H: 945, I: 429, J: 407, K: 822,
  L: 755, M: 1145, N: 940, O: 943, P: 717, Q: 949, R: 815, S: 663, T: 827, U: 880, V: 805,
  W: 1227, X: 848, Y: 760, Z: 797,
  a: 574, b: 674, c: 564, d: 694, e: 585, f: 443, g: 610, h: 714, i: 361, j: 331, k: 664,
  l: 355, m: 1106, n: 727, o: 660, p: 697, q: 674, r: 498, s: 466, t: 382, u: 709, v: 624,
  w: 891, x: 648, y: 646, z: 568,
};

const FALLBACK_ADVANCE = 650;

/** The rendered width of a name at the given size, in map units. */
export function measureMapName(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    units += ADVANCE_WIDTHS[char] ?? FALLBACK_ADVANCE;
  }
  return (units / 1000) * size;
}
