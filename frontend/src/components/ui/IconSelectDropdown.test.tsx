// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconSelectDropdown } from './IconSelectDropdown';

const OPTIONS = [
  { value: 'PAR', label: 'Paris', testId: 'opt-par' },
  { value: 'BUR', label: 'Burgundy', testId: 'opt-bur' },
  { value: 'GAS', label: 'Gascony', testId: 'opt-gas' },
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

  it('supports ArrowDown, ArrowUp, Home, and End keyboard navigation', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onHoverOption = vi.fn();
    render(
      <IconSelectDropdown
        testId="dropdown-trigger"
        value="PAR"
        options={OPTIONS}
        onChange={onChange}
        onHoverOption={onHoverOption}
      />,
    );

    const trigger = screen.getByTestId('dropdown-trigger');
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByTestId('opt-par')).toHaveFocus();
    expect(onHoverOption).toHaveBeenLastCalledWith('PAR');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('opt-bur')).toHaveFocus();
    expect(onHoverOption).toHaveBeenLastCalledWith('BUR');

    await user.keyboard('{End}');
    expect(screen.getByTestId('opt-gas')).toHaveFocus();
    expect(onHoverOption).toHaveBeenLastCalledWith('GAS');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('opt-par')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByTestId('opt-gas')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(screen.getByTestId('opt-par')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('BUR');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('renders a native <select> with groups and compact flag when useNative is true', () => {
    const onChange = vi.fn();
    render(
      <IconSelectDropdown
        testId="native-select"
        useNative
        compact
        value={null}
        placeholder="Choose…"
        options={[
          { value: 'PAR', label: 'Paris', group: 'Direct' },
          { value: 'MAR', label: 'Marseilles', group: 'Convoy' },
        ]}
        onChange={onChange}
      />,
    );

    const select = screen.getByTestId('native-select') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveAttribute('data-compact', 'true');
    expect(select.value).toBe('');
    expect(select.selectedOptions[0].textContent).toBe('Choose…');

    const groups = Array.from(select.querySelectorAll('optgroup'));
    expect(groups.map((g) => g.label)).toEqual(['Direct', 'Convoy']);

    fireEvent.change(select, { target: { value: 'MAR' } });
    expect(onChange).toHaveBeenCalledWith('MAR');
  });

  it('supports emptyOption in native <select> mode and returns null when cleared', () => {
    const onChange = vi.fn();
    render(
      <IconSelectDropdown
        testId="native-select"
        useNative
        value="PAR"
        emptyOption={{ label: 'Neutral', testId: 'opt-neutral' }}
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    const select = screen.getByTestId('native-select') as HTMLSelectElement;
    expect(screen.getByTestId('opt-neutral')).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
