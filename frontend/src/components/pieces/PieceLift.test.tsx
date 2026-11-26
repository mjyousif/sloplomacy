// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  liftTransform,
  PIECE_LIFT_FILTER_ID,
  PieceLift,
  PieceLiftFilter,
} from './PieceLift';

const draw = (node: React.ReactNode) =>
  render(<svg>{node}</svg>).container.querySelector('svg') as SVGSVGElement;

describe('PieceLift', () => {
  it('leaves a piece as it is when nothing lifts it', () => {
    const g = draw(
      <PieceLift lift={null}>
        <circle r="17" />
      </PieceLift>,
    ).querySelector('g');
    expect(g).not.toHaveAttribute('transform');
    expect(g).not.toHaveAttribute('filter');
    expect(g).not.toHaveAttribute('data-lift');
    expect(g?.querySelector('circle')).toHaveAttribute('r', '17');
  });

  it('raises a hovered piece a little, with no shadow', () => {
    const g = draw(
      <PieceLift lift="hovered">
        <circle r="17" />
      </PieceLift>,
    ).querySelector('g');
    expect(g).toHaveAttribute('data-lift', 'hovered');
    expect(g).toHaveAttribute('transform', 'scale(1.1)');
    expect(g).not.toHaveAttribute('filter');
  });

  it('raises a selected piece further and gives it a deep shadow', () => {
    const g = draw(
      <PieceLift lift="selected">
        <circle r="17" />
      </PieceLift>,
    ).querySelector('g');
    expect(g).toHaveAttribute('data-lift', 'selected');
    expect(g).toHaveAttribute('transform', 'scale(1.25)');
    expect(g).toHaveAttribute('filter', `url(#${PIECE_LIFT_FILTER_ID})`);
  });

  it('scales the rings around a lifted piece by as much as the piece', () => {
    expect(liftTransform(null)).toBeUndefined();
    expect(liftTransform('hovered')).toBe('scale(1.1)');
    expect(liftTransform('selected')).toBe('scale(1.25)');
  });

  it('defines the shadow once, under the id the pieces use', () => {
    const filter = draw(
      <defs>
        <PieceLiftFilter />
      </defs>,
    ).querySelector('filter');
    expect(filter).toHaveAttribute('id', PIECE_LIFT_FILTER_ID);
    expect(filter?.querySelector('feDropShadow')).not.toBeNull();
  });
});
