// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  LobbyBrowsePage,
  LobbyGameRow,
  MultiplayerGameSummary,
} from '../../types/diplomacy';
import { GameBrowser, type GameBrowserProps } from './GameBrowser';

const ROW: LobbyGameRow = {
  game_id: 'mp_open',
  name: 'Friday Night',
  status: 'active',
  season: 'Fall',
  year: 1903,
  phase: 'Movement',
  host_name: 'Gage',
  created_at: '2026-11-03T12:00:00Z',
  last_moved_at: '2026-11-11T10:00:00Z',
  claimed_powers: ['FRANCE', 'RUSSIA', 'TURKEY'],
  open_powers: ['AUSTRIA', 'ENGLAND', 'GERMANY', 'ITALY'],
};
const FULL: LobbyGameRow = {
  ...ROW,
  game_id: 'mp_full',
  name: 'Packed House',
  claimed_powers: [
    'AUSTRIA',
    'ENGLAND',
    'FRANCE',
    'GERMANY',
    'ITALY',
    'RUSSIA',
    'TURKEY',
  ],
  open_powers: [],
};
const USER: AuthUser = { id: 'u1', email: 'u1@test.com', displayName: 'U1' };

const page = (
  games: LobbyGameRow[],
  total = games.length,
  n = 1,
): LobbyBrowsePage => ({
  games,
  total,
  page: n,
  page_size: 10,
});

let fetchMock: ReturnType<typeof vi.fn>;
const lastQuery = () =>
  new URLSearchParams(
    (fetchMock.mock.calls.at(-1)?.[0] as string).split('?')[1],
  );

function renderBrowser(over: Partial<GameBrowserProps> = {}) {
  const props: GameBrowserProps = {
    user: USER,
    myGames: [],
    refreshSignal: 1,
    loadingGames: false,
    onRefreshGames: vi.fn(),
    onOpenAuth: vi.fn(),
    onJoinOrEnterGame: vi.fn(async () => {}),
    hostFormPlace: 'on the right',
    ...over,
  };
  return { props, ...render(<GameBrowser {...props} />) };
}

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => page([ROW, FULL], 23),
  }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GameBrowser', () => {
  it('shows a compact row per game with its turn, host and open seats', async () => {
    renderBrowser();
    const row = await screen.findByTestId('browser-row-mp_open');
    expect(within(row).getByText('Friday Night')).toBeTruthy();
    expect(within(row).getByText('by Gage')).toBeTruthy();
    expect(within(row).getByText('F1903 Moves')).toBeTruthy();
    expect(
      within(screen.getByTestId('browser-row-mp_full')).getByRole('button', {
        name: 'Full',
      }),
    ).toHaveProperty('disabled', true);
    expect(lastQuery().get('seats')).toBe('open');
    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
  });

  it('asks again with the filters, back on page 1', async () => {
    const user = userEvent.setup();
    renderBrowser();
    await screen.findByTestId('browser-row-mp_open');
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(lastQuery().get('page')).toBe('2'));

    await user.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(lastQuery().get('seats')).toBe('all'));
    expect(lastQuery().get('page')).toBe('1');

    await user.click(screen.getByTitle('Italy must be unclaimed'));
    await waitFor(() => expect(lastQuery().get('countries')).toBe('ITALY'));

    await user.selectOptions(screen.getByLabelText('Turn comparison'), 'after');
    await user.selectOptions(screen.getByLabelText('Turn season'), 'Fall');
    await user.type(screen.getByLabelText('Turn year'), '1903');
    await waitFor(() => expect(lastQuery().get('year')).toBe('1903'));
    expect(lastQuery().get('turn_op')).toBe('after');
    expect(lastQuery().get('season')).toBe('Fall');

    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    await waitFor(() => expect(lastQuery().get('seats')).toBe('open'));
    expect(lastQuery().has('countries')).toBe(false);
    expect(screen.getByLabelText('Turn year')).toHaveProperty('value', '');
  });

  it('opens a row into its seats and claims an open one', async () => {
    const user = userEvent.setup();
    const { props } = renderBrowser();
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));

    const france = within(row).getByRole('button', { name: /France/ });
    expect(france).toHaveProperty('disabled', true);
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledWith('mp_open', 'ITALY');
  });

  it('sends a guest to sign in instead of claiming', async () => {
    const user = userEvent.setup();
    const { props } = renderBrowser({ user: null });
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      expect.stringContaining('Italy'),
      'signin',
    );
  });

  it('offers Resume in a game the player is already in', async () => {
    const user = userEvent.setup();
    const mine = {
      game_id: 'mp_open',
      participants: {
        RUSSIA: { user_id: 'u1', power: 'RUSSIA' },
      },
    } as unknown as MultiplayerGameSummary;
    const { props } = renderBrowser({ myGames: [mine] });
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: /Resume/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledWith('mp_open', 'RUSSIA');
  });

  it('reloads the page when the lobby changes', async () => {
    const { rerender, props } = renderBrowser();
    await screen.findByTestId('browser-row-mp_open');
    const calls = fetchMock.mock.calls.length;
    rerender(<GameBrowser {...props} refreshSignal={2} />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(calls + 1));
  });

  it('says when no game matches the filters', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => page([]),
    }));
    const user = userEvent.setup();
    renderBrowser();
    expect(await screen.findByText('No Open Campaigns Right Now')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Full' }));
    expect(
      await screen.findByText('No Games Match These Filters'),
    ).toBeTruthy();
  });
});
