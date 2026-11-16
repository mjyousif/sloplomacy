// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../../types/diplomacy';
import { GameBrowser, type GameBrowserProps } from './GameBrowser';
import {
  browseFetch,
  browsePage,
  browseRow,
  FULL_ROW,
  lastBrowseQuery,
} from './lobby.testkit';

const USER: AuthUser = { id: 'u1', email: 'u1@test.com', displayName: 'U1' };
let fetchMock: ReturnType<typeof vi.fn>;

function renderBrowser(over: Partial<GameBrowserProps> = {}) {
  const props: GameBrowserProps = {
    user: USER,
    myGames: [],
    refreshSignal: 1,
    loadingGames: false,
    onRefreshGames: vi.fn(),
    onOpenAuth: vi.fn(),
    onJoinOrEnterGame: vi.fn(async () => {}),
    ...over,
  };
  return { props, ...render(<GameBrowser {...props} />) };
}

beforeEach(() => {
  fetchMock = browseFetch(() => browsePage([browseRow(), FULL_ROW], 23));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('GameBrowser', () => {
  it('lists a row per game and pages through them', async () => {
    const user = userEvent.setup();
    renderBrowser();
    await screen.findByTestId('browser-row-mp_open');
    expect(screen.getByTestId('browser-row-mp_full')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() =>
      expect(lastBrowseQuery(fetchMock).get('page')).toBe('2'),
    );
  });

  it('opens a row and claims a free seat', async () => {
    const user = userEvent.setup();
    const { props } = renderBrowser();
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledWith('mp_open', 'ITALY');
    // Join again closes it.
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    expect(within(row).queryByRole('button', { name: /Claim/ })).toBeNull();
  });

  it('survives a refused claim', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    renderBrowser({
      onJoinOrEnterGame: vi.fn(async () => {
        throw new Error('taken');
      }),
    });
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(err).toHaveBeenCalledTimes(1);
    expect(within(row).queryByText('Entering...')).toBeNull();
    err.mockRestore();
  });

  it('sends a guest to sign in instead of claiming', async () => {
    const user = userEvent.setup();
    const { props } = renderBrowser({ user: null });
    const row = await screen.findByTestId('browser-row-mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to claim Italy in "Friday Night".',
      'signin',
    );
  });

  it('offers Resume in a game from the player own games', async () => {
    const user = userEvent.setup();
    const mine = {
      game_id: 'mp_open',
      participants: { RUSSIA: { user_id: 'u1', power: 'RUSSIA' } },
    } as unknown as MultiplayerGameSummary;
    const { props } = renderBrowser({ myGames: [mine] });
    const row = await screen.findByTestId('browser-row-mp_open');
    expect(within(row).getByTestId('seat-RUSSIA')).toHaveAttribute(
      'data-seat',
      'mine',
    );
    await user.click(within(row).getByRole('button', { name: /Resume/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledWith('mp_open', 'RUSSIA');
  });

  it('reloads when the lobby changes, and Refresh asks the lobby to', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderBrowser();
    await screen.findByTestId('browser-row-mp_open');
    const calls = fetchMock.mock.calls.length;
    rerender(<GameBrowser {...props} refreshSignal={2} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(calls + 1));
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(props.onRefreshGames).toHaveBeenCalledTimes(1);
  });

  it('points an empty lobby at Host game, and says when filters match nothing', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => browsePage([]),
    }));
    const user = userEvent.setup();
    renderBrowser();
    expect(
      await screen.findByText('No Open Campaigns Right Now'),
    ).toBeInTheDocument();
    expect(screen.getByText(/match with Host game/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Full' }));
    expect(
      await screen.findByText('No Games Match These Filters'),
    ).toBeInTheDocument();
  });

  it('says why when the games could not be loaded', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    renderBrowser();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load games: Backend returned 500',
    );
  });
});
