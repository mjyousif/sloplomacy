// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PieceHitArea, PieceHoldOutline, PieceOutline } from './PieceOutlines';
import { getPieceFrame, makePiecePill, PILL_POINT } from './pieceFrame';

const draw = (node: React.ReactNode) =>
  render(<svg>{node}</svg>).container.querySelector('svg') as SVGSVGElement;

describe('PieceOutline', () => {
  it('draws a ring scaled to the style, around a token', () => {
    const ring = draw(
      <PieceOutline
        frame={getPieceFrame('seated')}
        radius={20}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('circle');
    expect(ring).toHaveAttribute('cx', '0');
    expect(ring).toHaveAttribute('cy', '0');
    expect(Number(ring?.getAttribute('r'))).toBeCloseTo(20 * 0.8);
    expect(ring).toHaveAttribute('stroke', 'red');
    expect(ring).toHaveAttribute('stroke-width', '2');
  });

  it.each([1, -1] as const)(
    'fits a flag, its pole and its foot in a rounded box (direction %i)',
    (direction) => {
      const rect = draw(
        <PieceOutline
          frame={getPieceFrame('flags', direction)}
          radius={24}
          fill="none"
          stroke="red"
          strokeWidth={2}
        />,
      ).querySelector('rect');
      const x = Number(rect?.getAttribute('x'));
      const y = Number(rect?.getAttribute('y'));
      const right = x + Number(rect?.getAttribute('width'));
      const bottom = y + Number(rect?.getAttribute('height'));
      // The cloth reaches 30 units out from the pole, and the star at its foot about 7.
      expect(Math.min(x, -right)).toBeLessThan(-7);
      expect(direction === 1 ? right : -x).toBeGreaterThan(30);
      expect(y).toBeLessThan(-30);
      expect(bottom).toBeGreaterThan(7);
    },
  );

  it("follows a fleet plate's points instead of cutting them off", () => {
    const pill = makePiecePill('Rumania', 12, 20, true);
    const outline = draw(
      <PieceOutline
        frame={getPieceFrame('nameplate', 1, pill)}
        unitType="F"
        radius={27}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('polygon');
    expect(outline).toHaveAttribute('transform', 'rotate(20)');
    const xs = (outline?.getAttribute('points') ?? '')
      .split(' ')
      .map((p) => Number(p.split(',')[0]));
    const tip = pill.width / 2 + (PILL_POINT * pill.height) / 2;
    const pad = (27 - 17) * 0.55;
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(tip + pad);
    expect(Math.min(...xs)).toBeLessThanOrEqual(-(tip + pad));
  });

  it('draws a matching rounded plate around a pill', () => {
    const pill = makePiecePill('Paris', 11, 30, false);
    const rect = draw(
      <PieceOutline
        frame={getPieceFrame('nameplate', 1, pill)}
        radius={22}
        fill="none"
        stroke="blue"
        strokeWidth={3}
        strokeDasharray="4 2"
      />,
    ).querySelector('rect');
    const pad = (22 - 17) * 0.55;
    expect(Number(rect?.getAttribute('width'))).toBeCloseTo(
      pill.width + pad * 2,
    );
    expect(Number(rect?.getAttribute('height'))).toBeCloseTo(
      pill.height + pad * 2,
    );
    expect(Number(rect?.getAttribute('rx'))).toBeCloseTo(pill.height / 2 + pad);
    expect(rect).toHaveAttribute('transform', 'rotate(30)');
    expect(rect).toHaveAttribute('stroke-dasharray', '4 2');
  });
});

describe('PieceHoldOutline', () => {
  it('draws the eight-sided ring at the classic size', () => {
    const polygon = draw(
      <PieceHoldOutline
        frame={getPieceFrame('classic')}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('polygon');
    expect(polygon).toHaveAttribute(
      'points',
      '0,-22 16,-16 22,0 16,16 0,22 -16,16 -22,0 -16,-16',
    );
  });

  it('chamfers a box around a whole flag', () => {
    const polygon = draw(
      <PieceHoldOutline
        frame={getPieceFrame('flags', 1)}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('polygon');
    const points = (polygon?.getAttribute('points') ?? '')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(8);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    expect(Math.min(...xs)).toBeLessThan(-7);
    expect(Math.max(...xs)).toBeGreaterThan(30);
    expect(Math.min(...ys)).toBeLessThan(-30);
    expect(Math.max(...ys)).toBeGreaterThan(7);
  });

  it("follows a fleet plate's points when it holds", () => {
    const pill = makePiecePill('Rumania', 12, 0, true);
    const svg = draw(
      <PieceHoldOutline
        frame={getPieceFrame('nameplate', 1, pill)}
        unitType="F"
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    );
    const xs = (svg.querySelector('polygon')?.getAttribute('points') ?? '')
      .split(' ')
      .map((p) => Number(p.split(',')[0]));
    expect(Math.max(...xs)).toBeGreaterThan(
      pill.width / 2 + (PILL_POINT * pill.height) / 2,
    );
  });

  it('becomes the plate outline for a pill', () => {
    const frame = getPieceFrame(
      'nameplate',
      1,
      makePiecePill('Paris', 11, 0, false),
    );
    const svg = draw(
      <PieceHoldOutline
        frame={frame}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    );
    expect(svg.querySelector('polygon')).toBeNull();
    const pad = (22 - 17) * 0.55;
    expect(
      Number(svg.querySelector('rect')?.getAttribute('width')),
    ).toBeCloseTo(frame.pill!.width + pad * 2);
  });
});

describe('PieceHitArea', () => {
  it('draws nothing for a classic piece on a mouse', () => {
    expect(
      draw(<PieceHitArea frame={getPieceFrame('classic')} />).children,
    ).toHaveLength(0);
  });

  it('draws a transparent target as big as the frame asks', () => {
    const circle = draw(
      <PieceHitArea frame={getPieceFrame('seated')} />,
    ).querySelector('circle');
    expect(circle).toHaveAttribute('r', '18');
    expect(circle).toHaveAttribute('fill', 'transparent');
  });

  it('takes the larger of the frame and a finger-sized minimum, around the centre', () => {
    const big = draw(
      <PieceHitArea frame={getPieceFrame('flags', 1)} minRadius={30} />,
    ).querySelector('circle');
    expect(big).toHaveAttribute('r', '30');
    expect(big).toHaveAttribute('cx', '12');
    expect(big).toHaveAttribute('cy', '-14');
    const small = draw(
      <PieceHitArea frame={getPieceFrame('flags', 1)} minRadius={10} />,
    ).querySelector('circle');
    expect(small).toHaveAttribute('r', '21');
    expect(
      draw(
        <PieceHitArea frame={getPieceFrame('classic')} minRadius={24} />,
      ).querySelector('circle'),
    ).toHaveAttribute('r', '24');
  });
});
