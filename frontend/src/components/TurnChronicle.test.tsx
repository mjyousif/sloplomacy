// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TurnHistoryEntry } from '../types/diplomacy';
import { TurnChronicle, type TurnChronicleProps } from './TurnChronicle';

const ENTRIES: TurnHistoryEntry[] = [
  { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
  { index: 1, season: 'Spring', year: 1901, phase: 'Admin' },
];

function renderChronicle(overrides: Partial<TurnChronicleProps> = {}) {
  const props: TurnChronicleProps = {
    turn: { season: 'Fall', year: 1901, phase: 'Movement' },
    entries: ENTRIES,
    viewIndex: null,
    power: null,
    onSelect: vi.fn(),
    onStep: vi.fn(),
    onSelectPower: vi.fn(),
    ...overrides,
  };
  const view = render(<TurnChronicle {...props} />);
  return { ...view, props };
}

describe('TurnChronicle', () => {
  it('keeps the full fixed-width bar with disabled history controls before any turn resolves', () => {
    renderChronicle({
      turn: { season: 'Spring', year: 1901, phase: 'Movement' },
      entries: [],
    });
    const pill = screen.getByTestId('turn-chronicle-pill');
    expect(pill).toHaveTextContent('Spring 1901 Movement');
    expect(screen.getByTestId('turn-history-prev')).toBeDisabled();
    expect(screen.getByTestId('turn-history-next')).toBeDisabled();
    expect(screen.getByTestId('turn-history-select')).toBeDisabled();
    expect(screen.getByTestId('turn-history-filter-toggle')).toBeDisabled();
    expect(screen.getByTestId('turn-history-filter-toggle')).toHaveTextContent(
      '',
    );
    expect(screen.queryByTestId('turn-history-tray')).toBeNull();
  });

  it('disables the filter button on the live turn and toggles the country filter tray on past turns', async () => {
    const user = userEvent.setup();
    const { container, props, rerender } = renderChronicle();

    const tray = screen.getByTestId('turn-history-tray');
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');
    const history = screen.getByTestId('turn-history');

    await user.hover(history);
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');

    const toggle = screen.getByTestId('turn-history-filter-toggle');
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute(
      'title',
      'Select a past turn to filter by nation',
    );
    await user.click(toggle);
    expect(tray).not.toHaveClass('open');

    rerender(<TurnChronicle {...props} viewIndex={0} />);
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('title', 'Filter by nation');

    await user.click(toggle);
    expect(tray).toHaveClass('open');
    expect(tray).not.toHaveAttribute('inert');
    expect(screen.getByText('Filter by nation')).toBeInTheDocument();
    const allChip = screen
      .getAllByTestId('turn-history-power')
      .find((el) => el.getAttribute('data-power') === 'ALL');
    expect(allChip).toBeEnabled();

    await user.click(toggle);
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');

    await user.click(toggle);
    expect(tray).toHaveClass('open');
    fireEvent.pointerDown(container.ownerDocument.body);
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');

    await user.click(toggle);
    expect(tray).toHaveClass('open');
    rerender(<TurnChronicle {...props} viewIndex={null} />);
    expect(toggle).toBeDisabled();
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');
  });

  it('steps turns, selects from IconSelectDropdown without overlapping the tray, and returns to live', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderChronicle();
    const tray = screen.getByTestId('turn-history-tray');

    await user.click(screen.getByTestId('turn-history-prev'));
    expect(props.onStep).toHaveBeenCalledWith(-1);

    expect(screen.getByTestId('turn-history-next')).toBeDisabled();
    expect(screen.queryByTestId('turn-history-live')).toBeNull();
    expect(screen.getByTestId('turn-chronicle-pill')).not.toHaveTextContent(
      /\bLIVE\b/i,
    );

    await user.click(screen.getByTestId('turn-history-select'));
    await user.click(screen.getByTestId('turn-history-option-0'));
    expect(props.onSelect).toHaveBeenCalledWith(0);

    rerender(<TurnChronicle {...props} viewIndex={1} />);
    expect(screen.getByTestId('turn-chronicle-pill')).toHaveClass(
      'viewing-past',
    );
    expect(screen.getByTestId('turn-history-select')).toHaveTextContent(
      'Spring 1901 — Admin Edit',
    );
    expect(screen.getByTestId('turn-history-next')).toBeEnabled();

    await user.click(screen.getByTestId('turn-history-filter-toggle'));
    expect(tray).toHaveClass('open');

    await user.click(screen.getByTestId('turn-history-select'));
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');

    const liveBtn = screen.getByTestId('turn-history-live');
    expect(liveBtn).toHaveAttribute('aria-label', 'Back to live');
    expect(liveBtn).toHaveTextContent('');
    await user.click(liveBtn);
    expect(props.onSelect).toHaveBeenCalledWith(null);

    await user.click(screen.getByTestId('turn-history-next'));
    expect(props.onStep).toHaveBeenCalledWith(1);

    await user.click(screen.getByTestId('turn-history-select'));
    await user.click(screen.getByTestId('turn-history-option-live'));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('enables country filter chips on a past turn and outlines the filter button in that nation’s color', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderChronicle({ viewIndex: 0 });

    await user.click(screen.getByTestId('turn-history-filter-toggle'));
    expect(screen.getByText('Filter by nation')).toBeInTheDocument();

    const germanyChip = screen
      .getAllByTestId('turn-history-power')
      .find((el) => el.getAttribute('data-power') === 'GERMANY')!;
    expect(germanyChip).toBeEnabled();

    await user.click(germanyChip);
    expect(props.onSelectPower).toHaveBeenCalledWith('GERMANY');

    rerender(<TurnChronicle {...props} viewIndex={0} power="GERMANY" />);
    const toggle = screen.getByTestId('turn-history-filter-toggle');
    expect(toggle).toHaveTextContent('GER');
    expect(toggle).toHaveClass('has-filter');
    expect(toggle).toHaveStyle({ borderColor: '#6f7785' });

    await user.click(
      screen
        .getAllByTestId('turn-history-power')
        .find((el) => el.getAttribute('data-power') === 'GERMANY')!,
    );
    expect(props.onSelectPower).toHaveBeenCalledWith(null);
  });

  it('closes the tray when pressing Escape', async () => {
    const user = userEvent.setup();
    renderChronicle({ viewIndex: 0 });
    const history = screen.getByTestId('turn-history');
    const tray = screen.getByTestId('turn-history-tray');

    await user.click(screen.getByTestId('turn-history-filter-toggle'));
    expect(tray).toHaveClass('open');

    fireEvent.keyDown(history, { key: 'Escape' });
    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');
  });

  it('locks the dropdown, steps and filter tray while locked is true', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderChronicle({ viewIndex: 0 });
    const tray = screen.getByTestId('turn-history-tray');

    await user.click(screen.getByTestId('turn-history-filter-toggle'));
    expect(tray).toHaveClass('open');

    rerender(<TurnChronicle {...props} viewIndex={0} locked />);

    expect(tray).not.toHaveClass('open');
    expect(tray).toHaveAttribute('inert');
    expect(screen.getByTestId('turn-history-select')).toBeDisabled();
    expect(screen.getByTestId('turn-history-select')).toHaveAttribute(
      'title',
      'Locked while in admin mode',
    );
    expect(screen.getByTestId('turn-history-filter-toggle')).toBeDisabled();
    expect(screen.getByTestId('turn-history-prev')).toBeDisabled();
    expect(screen.getByTestId('turn-history-next')).toBeDisabled();
  });
});
