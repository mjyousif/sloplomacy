// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconSelectDropdown } from './IconSelectDropdown';

const OPTIONS = [
  { value: 'PAR', label: 'Paris', testId: 'opt-par' },
  { value: 'BUR', label: 'Burgundy', testId: 'opt-bur' },
];

describe('IconSelectDropdown', () => {
  it('closes on outside pointerdown and restores focus to trigger on Escape', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <IconSelectDropdown
          testId="dropdown-trigger"
          value="PAR"
          options={OPTIONS}
          onChange={vi.fn()}
        />
      </div>,
    );

    const trigger = screen.getByTestId('dropdown-trigger');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    screen.getByTestId('opt-bur').focus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
