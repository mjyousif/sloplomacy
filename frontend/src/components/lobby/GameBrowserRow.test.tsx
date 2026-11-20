// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LobbyGameRow, Power } from '../../types/diplomacy';
import { GameBrowserRow } from './GameBrowserRow';
import { browseRow, FULL_ROW } from './lobby.testkit';

const NOW = Date.parse('2026-11-11T12:00:00Z');

function renderRow(
  over: {
    row?: LobbyGameRow;
    expanded?: boolean;
    myPower?: Power | null;
    joiningKey?: string | null;
    onWatch?: () => void;
  } = {},
) {
  const props = {
    row: browseRow(),
    expanded: false,
    myPower: null,
    joiningKey: null,
    onToggle: vi.fn(),
    onClaim: vi.fn(),
    now: NOW,
    ...over,
  };
  render(
    <ul>
      <GameBrowserRow {...props} />
    </ul>,
  );
  return props;
}

const seat = (power: Power) => screen.getByTestId(`seat-${power}`);

describe('GameBrowserRow', () => {
  it('shows the name, host, last move and short turn', () => {
    renderRow();
    expect(screen.getByText('Friday Night')).toBeInTheDocument();
    expect(screen.getByText('by Gage · 2h ago')).toBeInTheDocument();
    expect(screen.getByText('F1903 Moves')).toHaveAttribute(
      'title',
      'Fall 1903 · Movement',
    );
  });

  it('marks each of the seven seats free, taken or yours', () => {
    renderRow({ myPower: 'RUSSIA' });
    expect(
      within(screen.getByRole('list', { name: 'Seats' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(7);
    expect(seat('RUSSIA')).toHaveAttribute('data-seat', 'mine');
    expect(seat('FRANCE')).toHaveAttribute('data-seat', 'taken');
    expect(seat('ITALY')).toHaveAttribute('data-seat', 'free');
    expect(seat('ITALY')).toHaveAccessibleName('Italy: free');
  });

  it('claims nothing from the collapsed row: Join only opens it', async () => {
    const user = userEvent.setup();
    const props = renderRow();
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull();
    const join = screen.getByRole('button', { name: 'Join' });
    expect(join).toHaveAttribute('aria-expanded', 'false');
    await user.click(join);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
    expect(props.onClaim).not.toHaveBeenCalled();
  });

  it('opens into claim buttons for the free seats only', async () => {
    const user = userEvent.setup();
    const props = renderRow({ expanded: true });
    expect(screen.getByRole('button', { name: 'Join' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      screen.getByRole('button', { name: /France\s*Taken/ }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Claim Italy/ }));
    expect(props.onClaim).toHaveBeenCalledWith('ITALY');
  });

  it('marks the seat being claimed', () => {
    renderRow({ expanded: true, joiningKey: 'mp_open_ITALY' });
    expect(screen.getByRole('button', { name: /Entering/ })).toBeDisabled();
  });

  it('offers Resume instead of a claim in a game the player is in', async () => {
    const user = userEvent.setup();
    const props = renderRow({ myPower: 'RUSSIA', expanded: true });
    expect(screen.queryByRole('button', { name: 'Join' })).toBeNull();
    expect(screen.queryByTestId('browser-row-claims')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Resume/ }));
    expect(props.onClaim).toHaveBeenCalledWith('RUSSIA');
  });

  it('cannot be joined when full or finished', () => {
    renderRow({ row: FULL_ROW, expanded: true });
    expect(screen.getByRole('button', { name: 'Full' })).toBeDisabled();
    expect(screen.queryByTestId('browser-row-claims')).toBeNull();
  });

  it('says Finished for a completed game', () => {
    renderRow({ row: browseRow({ status: 'completed' }) });
    expect(screen.getByRole('button', { name: 'Finished' })).toBeDisabled();
  });
});

describe('GameBrowserRow watch', () => {
  it('offers Watch beside Join, but not in a game the player is in', async () => {
    const onWatch = vi.fn();
    renderRow({ onWatch });
    await userEvent.click(screen.getByTestId('browser-row-watch'));
    expect(onWatch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Join/ })).toBeInTheDocument();
  });

  it('hides Watch on a row the player holds a seat in', () => {
    renderRow({ onWatch: vi.fn(), myPower: 'FRANCE' });
    expect(screen.queryByTestId('browser-row-watch')).toBeNull();
  });

  it('can still watch a full game', async () => {
    const onWatch = vi.fn();
    renderRow({ onWatch, row: FULL_ROW });
    await userEvent.click(screen.getByTestId('browser-row-watch'));
    expect(onWatch).toHaveBeenCalled();
  });
});
