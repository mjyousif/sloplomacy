// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TurnHistoryEntry } from '../types/diplomacy';
import { TurnHistoryPill, TurnHistorySelector } from './TurnHistorySelector';

const ENTRIES: TurnHistoryEntry[] = [
  { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
  { index: 1, season: 'Spring', year: 1901, phase: 'Admin' },
];

describe('TurnHistorySelector', () => {
  it('renders nothing when history entries are empty', () => {
    const { container } = render(
      <TurnHistorySelector
        entries={[]}
        viewIndex={null}
        liveLabel="Spring 1901 Movement"
        power={null}
        onSelect={vi.fn()}
        onStep={vi.fn()}
        onSelectPower={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('formats Admin phases as Admin Edit in the select dropdown and mobile pill', () => {
    render(
      <>
        <TurnHistorySelector
          entries={ENTRIES}
          viewIndex={1}
          liveLabel="Spring 1901 Movement"
          power={null}
          onSelect={vi.fn()}
          onStep={vi.fn()}
          onSelectPower={vi.fn()}
        />
        <TurnHistoryPill
          entry={ENTRIES[1]}
          isOldest={false}
          onStep={vi.fn()}
          onGoLive={vi.fn()}
        />
      </>,
    );

    // Dropdown contains both the live label and past turns
    const select = screen.getByTestId('turn-history-select');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toContain(
      'Spring 1901 — Admin Edit',
    );
    expect(options.map((o) => o.textContent)).toContain('Spring 1901 Movement');

    // Phone pill displays compact shortTurnLabel
    expect(screen.getByText('S1901 Adm')).toBeInTheDocument();
  });

  it('calls onSelect when selecting an entry from the dropdown', () => {
    const handleSelect = vi.fn();
    render(
      <TurnHistorySelector
        entries={ENTRIES}
        viewIndex={null}
        liveLabel="Spring 1901 Movement"
        power={null}
        onSelect={handleSelect}
        onStep={vi.fn()}
        onSelectPower={vi.fn()}
      />,
    );

    const select = screen.getByTestId('turn-history-select');
    fireEvent.change(select, { target: { value: '1' } });
    expect(handleSelect).toHaveBeenCalledWith(1);
  });
});
