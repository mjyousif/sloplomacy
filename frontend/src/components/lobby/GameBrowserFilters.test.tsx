// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  type BrowseFilters,
  DEFAULT_BROWSE_FILTERS,
} from '../../utils/lobbyBrowse';
import { GameBrowserFilters } from './GameBrowserFilters';

/** The filters with their state held, as GameBrowser holds it. */
function Harness({ seen }: { seen: (next: BrowseFilters) => void }) {
  const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_BROWSE_FILTERS);
  return (
    <GameBrowserFilters
      filters={filters}
      onChange={(next) => {
        seen(next);
        setFilters(next);
      }}
    />
  );
}

/** Renders the filters and reports each change they make. */
function renderFilters() {
  const seen = vi.fn();
  render(<Harness seen={seen} />);
  return { seen, last: (): BrowseFilters => seen.mock.calls.at(-1)?.[0] };
}

describe('GameBrowserFilters', () => {
  it('picks open, full or all seats', async () => {
    const user = userEvent.setup();
    const { last } = renderFilters();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Full' }));
    expect(last().seats).toBe('full');
    expect(screen.getByRole('button', { name: 'Full' })).toHaveAttribute(
      'data-active',
      'true',
    );
  });

  it('toggles the countries that must be open', async () => {
    const user = userEvent.setup();
    const { last } = renderFilters();
    await user.click(screen.getByTitle('Italy must be unclaimed'));
    await user.click(screen.getByTitle('France must be unclaimed'));
    expect(last().countries).toEqual(['ITALY', 'FRANCE']);
    await user.click(screen.getByTitle('Italy must be unclaimed'));
    expect(last().countries).toEqual(['FRANCE']);
  });

  it('builds a turn filter, sending the year only once it is whole', async () => {
    const user = userEvent.setup();
    const { last, seen } = renderFilters();
    expect(screen.getByLabelText('Turn year')).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('Turn comparison'),
      'before',
    );
    await user.selectOptions(screen.getByLabelText('Turn season'), 'Winter');
    const calls = seen.mock.calls.length;
    await user.type(screen.getByLabelText('Turn year'), '19');
    expect(seen.mock.calls.length).toBe(calls);
    await user.type(screen.getByLabelText('Turn year'), '05');
    expect(last()).toMatchObject({
      turnOp: 'before',
      season: 'Winter',
      year: 1905,
    });
  });

  it('clears every filter, the typed year included', async () => {
    const user = userEvent.setup();
    const { last } = renderFilters();
    expect(screen.queryByRole('button', { name: /Clear filters/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Turn comparison'), 'at');
    await user.type(screen.getByLabelText('Turn year'), '1903');
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(last()).toEqual(DEFAULT_BROWSE_FILTERS);
    expect(screen.getByLabelText('Turn year')).toHaveValue(null);
  });
});
