// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MapLegendSection } from './MapLegendSection';

describe('MapLegendSection', () => {
  it('lists the four order marks', () => {
    render(<MapLegendSection />);
    for (const label of [
      'Move / Attack',
      'Fleet Convoy',
      'Support Link',
      'Warning',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByTitle('Army or Fleet movement arrow'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-swatch="move"]')).not.toBeNull();
    expect(document.querySelector('[data-swatch="convoy"]')).not.toBeNull();
    expect(document.querySelector('[data-swatch="support"]')).not.toBeNull();
    expect(document.querySelector('[data-swatch="warn"]')).not.toBeNull();
  });

  it('starts open and folds away', async () => {
    render(<MapLegendSection />);
    const toggle = screen.getByRole('button', { name: /TACTICAL MAP LEGEND/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
