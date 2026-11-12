// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PieceHitArea, PieceHoldOutline, PieceOutline } from './PieceOutlines';
import { getPieceFrame, makePiecePill } from './pieceFrame';

const draw = (node: React.ReactNode) =>
  render(<svg>{node}</svg>).container.querySelector('svg') as SVGSVGElement;

describe('PieceOutline', () => {
  it('draws a ring scaled to the style, around the frame centre', () => {
    const ring = draw(
      <PieceOutline
        frame={getPieceFrame('flags', -1)}
        radius={20}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('circle');
    expect(ring).toHaveAttribute('cx', '-12');
    expect(ring).toHaveAttribute('cy', '-14');
    expect(Number(ring?.getAttribute('r'))).toBeCloseTo(20 * 0.82);
    expect(ring).toHaveAttribute('stroke', 'red');
    expect(ring).toHaveAttribute('stroke-width', '2');
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

  it('scales and moves the ring with the frame', () => {
    const polygon = draw(
      <PieceHoldOutline
        frame={getPieceFrame('flags', 1)}
        fill="none"
        stroke="red"
        strokeWidth={2}
      />,
    ).querySelector('polygon');
    const [first] = (polygon?.getAttribute('points') ?? '').split(' ');
    const [x, y] = first.split(',').map(Number);
    expect(x).toBeCloseTo(12);
    expect(y).toBeCloseTo(-22 * 0.82 - 14);
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
