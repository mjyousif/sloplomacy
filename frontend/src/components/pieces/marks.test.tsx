// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIM, SupplyStar, UnitMarkGlyph } from './marks';

const draw = (node: React.ReactNode) =>
  render(<svg>{node}</svg>).container.querySelector('svg') as SVGSVGElement;

describe('SupplyStar', () => {
  it('is a grey star on a pale disc when nobody owns the centre', () => {
    const svg = draw(<SupplyStar />);
    expect(svg.querySelector('g')?.hasAttribute('transform')).toBe(false);
    expect(svg.querySelector('circle')).toHaveAttribute('fill', DEFAULT_RIM);
    expect(svg.querySelector('polygon')).toHaveAttribute('fill', '#57534e');
  });

  it('takes the owner colour and a gold star, and scales when asked', () => {
    const svg = draw(<SupplyStar ownerColor="#112233" scale={0.5} />);
    expect(svg.querySelector('g')).toHaveAttribute('transform', 'scale(0.5)');
    expect(svg.querySelector('circle')).toHaveAttribute('fill', '#112233');
    expect(svg.querySelector('polygon')).toHaveAttribute('fill', '#fde047');
  });
});

describe('UnitMarkGlyph drawings', () => {
  const glyph = (mark: 'icons' | 'vehicles' | 'nato', unitType: 'A' | 'F') =>
    draw(<UnitMarkGlyph unitType={unitType} mark={mark} color="#abc" />);

  it('lays the tank tracks out evenly', () => {
    const tracks = glyph('vehicles', 'A').querySelectorAll('circle');
    expect([...tracks].map((c) => c.getAttribute('cx'))).toEqual([
      '-8',
      '-2.7',
      '2.7',
      '8',
    ]);
  });

  it('crosses the swords corner to corner', () => {
    const lines = [...glyph('icons', 'A').querySelectorAll('line')].map((l) =>
      ['x1', 'y1', 'x2', 'y2'].map((a) => l.getAttribute(a)).join(','),
    );
    expect(lines).toEqual([
      '-7,-7,7,7',
      '7,-7,-7,7',
      '-7.5,3,-3,7.5',
      '7.5,3,3,7.5',
    ]);
  });
});

describe('UnitMarkGlyph', () => {
  it('prints the letter with its prefix, with the default size and baseline', () => {
    const text = draw(
      <UnitMarkGlyph
        unitType="A"
        mark="letters"
        color="#000"
        letterPrefix="+"
      />,
    ).querySelector('text');
    expect(text?.textContent).toBe('+A');
    expect(text).toHaveAttribute('font-size', '14.5');
    expect(text).toHaveAttribute('y', '5.5');
  });

  it('ignores the size for drawn marks', () => {
    for (const mark of ['icons', 'vehicles', 'nato'] as const) {
      expect(
        draw(
          <UnitMarkGlyph unitType="F" mark={mark} color="#000" />,
        ).querySelector('text'),
      ).toBeNull();
    }
  });
});
