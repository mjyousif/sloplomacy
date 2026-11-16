// @vitest-environment jsdom
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LobbyView } from './LobbyView';
import {
  browserRow,
  MINE,
  OPEN,
  openHost,
  resetLobbyEnv,
  SANDBOX,
  setup,
  stubBrowse,
} from './LobbyView.testkit';
import { browseRow, game } from './lobby/lobby.testkit';

beforeEach(resetLobbyEnv);
afterEach(() => vi.useRealTimers());

describe('LobbyView layout', () => {
  it('stacks the hero, the empty my-games box, the action row, the lobbies and the footer', () => {
    const { view } = setup();
    const root = view.container.firstElementChild as HTMLElement;
    expect(
      [...root.children].map((c) => c.getAttribute('data-testid')),
    ).toEqual(['lobby-hero', 'lobby-main-grid', 'lobby-footer']);
    const grid = screen.getByTestId('lobby-main-grid');
    expect(
      [...grid.children].map((c) => c.getAttribute('data-testid')),
    ).toEqual(['lobby-games-column']);
    expect(
      [...screen.getByTestId('lobby-games-column').children].map(
        (c) => c.getAttribute('data-testid') ?? c.tagName,
      ),
    ).toEqual(['SECTION', 'lobby-action-row', 'game-browser']);
    // The Host and Join forms are not on the page until their buttons open them.
    expect(
      screen.queryByTestId('create-campaign-card'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('join-with-code-card')).not.toBeInTheDocument();
  });

  it('points both empty lists at the Host game button', async () => {
    setup();
    await screen.findByText('No Open Campaigns Right Now');
    expect(
      screen.getAllByText(/campaign with Host game|match with Host game/),
    ).toHaveLength(2);
  });

  it('gives a player with games the map hero and the strip in place of the banner', () => {
    const { view } = setup({ games: [OPEN, MINE, SANDBOX] });
    const root = view.container.firstElementChild as HTMLElement;
    expect(
      [...root.children].map((c) => c.getAttribute('data-testid')),
    ).toEqual(['featured-game-hero', 'lobby-main-grid', 'lobby-footer']);
    expect(
      [...screen.getByTestId('lobby-games-column').children].map(
        (c) => c.getAttribute('data-testid') ?? c.tagName,
      ),
    ).toEqual(['other-games-strip', 'lobby-action-row', 'game-browser']);
    expect(screen.queryByTestId('lobby-hero')).toBeNull();
    expect(screen.queryByText('My Active Campaigns & Saved Games')).toBeNull();
  });

  it('sorts games: the hero takes my match, the strip my sandbox, the browser lists public games', async () => {
    stubBrowse([
      browseRow({ game_id: 'mp_open', name: 'Open Table' }),
      browseRow({ game_id: 'mp_mine', name: 'My Table' }),
    ]);
    setup({ games: [OPEN, SANDBOX, MINE] });
    expect(screen.getByTestId('hero-game-name')).toHaveTextContent('My Table');
    expect(
      screen.getAllByTestId('my-game-name').map((n) => n.textContent),
    ).toEqual(['Saved Study']);
    expect(
      within(await screen.findByTestId('browser-list'))
        .getAllByRole('listitem')
        .filter((li) => li.dataset.testid?.startsWith('browser-row-'))
        .map((li) => li.dataset.testid),
    ).toEqual(['browser-row-mp_open', 'browser-row-mp_mine']);
  });

  it('keeps the banner for a player whose only game is a saved sandbox', () => {
    setup({ games: [SANDBOX] });
    expect(screen.getByTestId('lobby-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('featured-game-hero')).toBeNull();
    expect(
      screen.getAllByTestId('my-game-name').map((n) => n.textContent),
    ).toEqual(['Saved Study']);
  });

  it('enters the hero game through the seat-claim path', async () => {
    const { props, user } = setup({ games: [MINE] });
    await user.click(screen.getByTestId('hero-enter-btn'));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_mine',
      'AUSTRIA',
    );
    // The hero has the only game, so there is no strip.
    expect(screen.queryByTestId('other-games-strip')).toBeNull();
  });

  it('shows a guest the lock box and no "my games" for them', () => {
    setup({ user: null, games: [MINE] });
    expect(
      screen.getByText('Account Required to Save & Track Campaigns'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('featured-game-hero')).toBeNull();
    expect(screen.queryByTestId('my-game-card')).toBeNull();
    expect(screen.getByTestId('lobby-hero')).toBeInTheDocument();
  });
});

describe('LobbyView hero and refresh wiring', () => {
  it('launches the sandbox, signs in, and refreshes', async () => {
    const { props, user } = setup({ user: null });
    await user.click(screen.getByTestId('btn-enter-sandbox'));
    expect(props.onEnterSandbox).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole('button', { name: /Sign In \/ Create Account/ }),
    );
    expect(props.onOpenAuth).toHaveBeenCalledWith(undefined, 'signin');
    await user.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(props.onRefreshGames).toHaveBeenCalledTimes(1);
  });

  it('forwards the loading flag to Refresh', () => {
    setup({ loadingGames: true });
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeDisabled();
  });
});

describe('LobbyView details', () => {
  it('sends the lock box sign-in to the auth prompt', async () => {
    const { props, user } = setup({ user: null });
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(props.onOpenAuth).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('closes the credentials box, and the Copied marker leaves with its own timer only', async () => {
    const writeText = vi.fn(async () => {});
    const onCreateGame = vi.fn(async () =>
      game({ game_id: 'mp_new', name: 'Fresh' }),
    );
    const { user } = setup({ onCreateGame });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    openHost();
    await user.click(
      screen.getByRole('button', { name: /Private \(Passcode\)/ }),
    );
    await user.type(screen.getByLabelText('Campaign Passcode / PIN'), 'sekret');
    await user.click(
      screen.getByRole('button', { name: /Create Private & Play as France/ }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByTitle('Copy Game ID'));
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByTitle('Copy Passcode'));
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    // The first timer fired at 2.5 s, but the marker now belongs to the passcode button.
    expect(screen.getAllByText('Copied')).toHaveLength(1);
    expect(screen.getByTitle('Copy Passcode')).toHaveTextContent('Copied');
    vi.useRealTimers();
    await user.click(
      screen.getByRole('button', { name: 'Enter Lobby Browser' }),
    );
    expect(
      screen.queryByText('Private Campaign Created!'),
    ).not.toBeInTheDocument();
  });
});

describe('LobbyView game browser', () => {
  it('asks a guest to sign in, naming the country and game', async () => {
    stubBrowse([browseRow({ game_id: 'mp_open', name: 'Open Table' })]);
    const { props, user } = setup({ user: null, games: [OPEN] });
    const row = await browserRow('mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Italy/ }));
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to claim Italy in "Open Table".',
      'signin',
    );
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
  });

  it('joins an open game at once and marks the seat while it goes', async () => {
    stubBrowse([browseRow({ game_id: 'mp_open', name: 'Open Table' })]);
    let finish: () => void = () => {};
    const onJoinOrEnterGame = vi.fn(
      () => new Promise<void>((r) => (finish = r)),
    );
    const { user } = setup({ games: [OPEN], onJoinOrEnterGame });
    const row = await browserRow('mp_open');
    await user.click(within(row).getByRole('button', { name: 'Join' }));
    await user.click(within(row).getByRole('button', { name: /Claim Turkey/ }));
    expect(onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_open',
      'TURKEY',
    );
    expect(within(row).getByText('Entering...')).toBeInTheDocument();
    await act(async () => finish());
    expect(within(row).queryByText('Entering...')).not.toBeInTheDocument();
  });

  it('offers Resume on a public game the player already holds a seat in', async () => {
    stubBrowse([browseRow({ game_id: 'mp_mine', name: 'My Table' })]);
    const { props } = setup({ games: [MINE] });
    const row = await browserRow('mp_mine');
    expect(within(row).getByTestId('seat-AUSTRIA')).toHaveAttribute(
      'data-seat',
      'mine',
    );
    expect(within(row).queryByRole('button', { name: 'Join' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: /Resume/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_mine',
      'AUSTRIA',
    );
  });

  it('reloads the open page when the lobby list changes', async () => {
    const fetchMock = stubBrowse([browseRow()]);
    const { props, view } = setup({ games: [OPEN] });
    await browserRow('mp_open');
    const calls = fetchMock.mock.calls.length;
    view.rerender(<LobbyView {...props} games={[OPEN, MINE]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(calls + 1));
  });
});

describe('LobbyView my games', () => {
  it('lets a player already seated in a private game back in without a passcode', async () => {
    const { props, user } = setup({ games: [MINE] });
    await user.click(screen.getByRole('button', { name: /Resume as Austria/ }));
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_mine',
      'AUSTRIA',
    );
    expect(
      screen.queryByText('Enter Campaign Passcode'),
    ).not.toBeInTheDocument();
  });

  it('sends a leave press to the surrender modal with its game', async () => {
    const { props, user } = setup({ games: [MINE] });
    await user.click(
      screen.getByRole('button', { name: 'More actions for My Table' }),
    );
    await user.click(screen.getByTestId('leave-campaign-btn'));
    expect(props.onOpenSurrenderModal).toHaveBeenCalledExactlyOnceWith(
      MINE,
      'AUSTRIA',
    );
  });
});
