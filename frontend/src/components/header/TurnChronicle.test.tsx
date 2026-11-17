// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TurnHistoryEntry } from '../../types/diplomacy';
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
    onSelect: vi.fn(),
    onStep: vi.fn(),
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
    expect(screen.getByTestId('turn-phase-label')).toHaveTextContent(
      'Movement',
    );
    expect(screen.getByTestId('turn-history-prev')).toBeDisabled();
    expect(screen.getByTestId('turn-history-next')).toBeDisabled();
    expect(screen.getByTestId('turn-history-select')).toBeDisabled();
    expect(screen.queryByTestId('turn-history-filter-toggle')).toBeNull();
    expect(screen.queryByTestId('turn-history-tray')).toBeNull();
  });

  it('steps turns, selects from IconSelectDropdown, and returns to live', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderChronicle();

    const prev = screen.getByTestId('turn-history-prev');
    const next = screen.getByTestId('turn-history-next');
    const select = screen.getByTestId('turn-history-select');

    // Prev/next buttons sit to the left of the turn dropdown inside the chronicle pill.
    expect(
      prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      next.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('turn-history')).not.toHaveAttribute(
      'data-turn-dir',
    );

    await user.click(prev);
    expect(props.onStep).toHaveBeenCalledWith(-1);

    expect(next).toBeDisabled();
    expect(screen.queryByTestId('turn-history-live')).toBeNull();
    expect(screen.getByTestId('turn-chronicle-pill')).not.toHaveTextContent(
      /\bLIVE\b/i,
    );

    await user.click(select);
    await user.click(screen.getByTestId('turn-history-option-0'));
    expect(props.onSelect).toHaveBeenCalledWith(0);

    rerender(<TurnChronicle {...props} viewIndex={1} />);
    expect(screen.getByTestId('turn-history')).toHaveAttribute(
      'data-turn-dir',
      'back',
    );
    expect(screen.getByTestId('turn-chronicle-pill')).toHaveAttribute(
      'data-viewing-past',
      'true',
    );
    expect(screen.getByTestId('turn-chronicle-pill')).toHaveAttribute(
      'data-admin-phase',
      'true',
    );
    expect(screen.getByTestId('turn-history-live')).toHaveAttribute(
      'data-admin-phase',
      'true',
    );
    expect(select).toHaveTextContent('Spring 1901 — Admin Edit');
    expect(next).toBeEnabled();

    const liveBtn = screen.getByTestId('turn-history-live');
    expect(
      select.compareDocumentPosition(liveBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(liveBtn).toHaveAttribute('aria-label', 'Back to live');
    expect(liveBtn).toHaveTextContent('');
    await user.click(liveBtn);
    expect(props.onSelect).toHaveBeenCalledWith(null);

    rerender(<TurnChronicle {...props} viewIndex={null} />);
    expect(screen.getByTestId('turn-history')).toHaveAttribute(
      'data-turn-dir',
      'forward',
    );

    rerender(<TurnChronicle {...props} viewIndex={1} />);
    await user.click(next);
    expect(props.onStep).toHaveBeenCalledWith(1);

    await user.click(select);
    await user.click(screen.getByTestId('turn-history-option-live'));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('locks the dropdown and step arrows while locked is true', () => {
    renderChronicle({ viewIndex: 0, locked: true });
    expect(screen.getByTestId('turn-history-select')).toBeDisabled();
    expect(screen.getByTestId('turn-history-select')).toHaveAttribute(
      'title',
      'Locked while in admin mode',
    );
    expect(screen.getByTestId('turn-history-prev')).toBeDisabled();
    expect(screen.getByTestId('turn-history-next')).toBeDisabled();
  });
});
