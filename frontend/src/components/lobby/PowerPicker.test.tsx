// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ALL_POWERS, POWER_METADATA } from '../../types/diplomacy';
import { PowerPicker } from './PowerPicker';

describe('PowerPicker', () => {
  it('lists the seven powers in order and marks the chosen one', () => {
    render(<PowerPicker selected="ITALY" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.querySelector('span')?.textContent)).toEqual(
      ALL_POWERS.map((p) => POWER_METADATA[p].shortName),
    );
    const selected = buttons.filter(
      (b) => b.getAttribute('data-selected') === 'true',
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].querySelector('span')).toHaveTextContent(
      POWER_METADATA.ITALY.shortName,
    );
    // The chosen one is told to assistive tech too, and only it carries its power's tint.
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(
      ALL_POWERS.map((p) => String(p === 'ITALY')),
    );
    expect(selected[0].style.backgroundColor).not.toBe('');
    expect(buttons[0].style.backgroundColor).toBe('');
    // None of them submit a form around them.
    expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(
      true,
    );
  });

  it('reports the power that was pressed', async () => {
    const onSelect = vi.fn();
    render(<PowerPicker selected="FRANCE" onSelect={onSelect} />);
    await userEvent.click(screen.getByText(POWER_METADATA.TURKEY.shortName));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('TURKEY');
  });
});
