// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandEmblem } from './BrandEmblem';

describe('BrandEmblem', () => {
  it('is a div with a 22px compass by default', () => {
    const { container } = render(<BrandEmblem />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.tagName).toBe('DIV');
    expect(badge.querySelector('svg')).toHaveAttribute('width', '22');
  });

  it('can be a span with a smaller icon and the caller’s own class', () => {
    const { container } = render(
      <BrandEmblem as="span" iconSize={18} className="phone" />,
    );
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('phone');
    expect(badge.querySelector('svg')).toHaveAttribute('width', '18');
  });
});
