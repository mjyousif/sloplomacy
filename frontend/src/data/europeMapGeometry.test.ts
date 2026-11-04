import { describe, expect, it } from 'vitest';
import { AUTHENTIC_BACKGROUND_SVG, AUTHENTIC_DEFS_SVG } from './europeMapGeometry';
import { POWER_METADATA } from '../types/diplomacy';

describe('Map Cartography & Aesthetics (Issue #21)', () => {
  it('defines England with a deeper, darker Royal Navy blue', () => {
    const england = POWER_METADATA.ENGLAND;
    expect(england.color).toBe('#183668');
    expect(england.fillColor).toBe('#35588a');
    expect(england.borderColor).toBe('#0e2244');
    expect(england.lightBg).toContain('rgba(24, 54, 104');
  });

  it('defines water wave texture pattern in AUTHENTIC_DEFS_SVG', () => {
    expect(AUTHENTIC_DEFS_SVG).toContain('id="waterWaves"');
    expect(AUTHENTIC_DEFS_SVG).toContain('patternUnits="userSpaceOnUse"');
  });

  it('applies water wave texture overlay across ocean in AUTHENTIC_BACKGROUND_SVG', () => {
    expect(AUTHENTIC_BACKGROUND_SVG).toContain('id="water-wave-texture"');
    expect(AUTHENTIC_BACKGROUND_SVG).toContain('fill="url(#waterWaves)"');
  });
});
