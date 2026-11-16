// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  card,
  MINE,
  OPEN,
  openHost,
  resetLobbyEnv,
  SANDBOX,
  SECRET,
  setup,
} from './LobbyView.testkit';
import { game } from './lobby/lobby.testkit';

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
    ).toEqual(['SECTION', 'lobby-action-row', 'SECTION']);
    // The Host and Join forms are not on the page until their buttons open them.
    expect(
      screen.queryByTestId('create-campaign-card'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('join-with-code-card')).not.toBeInTheDocument();
  });

  it('points both empty lists at the Host game button', () => {
    setup();
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
    ).toEqual(['other-games-strip', 'lobby-action-row', 'SECTION']);
    expect(screen.queryByTestId('lobby-hero')).toBeNull();
    expect(screen.queryByText('My Active Campaigns & Saved Games')).toBeNull();
  });

  it('sorts games: the hero takes my match, the strip my sandbox, the lobbies skip sandboxes', () => {
    setup({ games: [OPEN, SANDBOX, MINE] });
    expect(screen.getByTestId('hero-game-name')).toHaveTextContent('My Table');
    expect(
      screen.getAllByTestId('my-game-name').map((n) => n.textContent),
    ).toEqual(['Saved Study']);
    expect(
      screen
        .getAllByTestId('lobby-game-card')
        .map((c) => c.querySelector('h3')?.textContent),
    ).toEqual(['Open Table', 'My Table']);
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

describe('LobbyView claiming a seat', () => {
  it('asks a guest to sign in, naming the country and game', async () => {
    const { props, user } = setup({ user: null, games: [OPEN] });
    await user.click(within(card('Open Table')).getByText(/Claim France/));
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to claim France in "Open Table".',
      'signin',
    );
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
  });

  it('joins an open game at once and marks the seat while it goes', async () => {
    let finish: () => void = () => {};
    const onJoinOrEnterGame = vi.fn(
      () => new Promise<void>((r) => (finish = r)),
    );
    const { user } = setup({ games: [OPEN], onJoinOrEnterGame });
    await user.click(within(card('Open Table')).getByText(/Claim Russia/));
    expect(onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_open',
      'RUSSIA',
    );
    expect(screen.getByText('Entering...')).toBeInTheDocument();
    await act(async () => finish());
    expect(screen.queryByText('Entering...')).not.toBeInTheDocument();
  });

  it('survives a refused join and clears the marker', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onJoinOrEnterGame = vi.fn(async () => {
      throw new Error('full');
    });
    const { user } = setup({ games: [OPEN], onJoinOrEnterGame });
    await user.click(within(card('Open Table')).getByText(/Claim Russia/));
    expect(err).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Entering...')).not.toBeInTheDocument();
    err.mockRestore();
  });

  it('asks a newcomer for the passcode of a private game', async () => {
    const { props, user } = setup({ games: [SECRET] });
    await user.click(within(card('Secret Table')).getByText(/Claim Italy/));
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
    expect(screen.getByText('Enter Campaign Passcode')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Passcode'), '  v1901 ');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Italy/ }),
    );
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_sec',
      'ITALY',
      'v1901',
    );
    expect(
      screen.queryByText('Enter Campaign Passcode'),
    ).not.toBeInTheDocument();
  });

  it('keeps the passcode box open with the reason when the passcode is refused', async () => {
    const onJoinOrEnterGame = vi.fn(async () => {
      throw new Error('Wrong passcode');
    });
    const { user } = setup({ games: [SECRET], onJoinOrEnterGame });
    await user.click(within(card('Secret Table')).getByText(/Claim Italy/));
    await user.type(screen.getByLabelText('Passcode'), 'nope');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Italy/ }),
    );
    expect(screen.getByText('Wrong passcode')).toBeInTheDocument();
    expect(screen.getByLabelText('Passcode')).toHaveValue('nope');
  });

  it('falls back to a standard message when the refusal has none', async () => {
    const onJoinOrEnterGame = vi.fn(async () => {
      throw new Error('');
    });
    const { user } = setup({ games: [SECRET], onJoinOrEnterGame });
    await user.click(within(card('Secret Table')).getByText(/Claim Italy/));
    await user.type(screen.getByLabelText('Passcode'), 'x');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Italy/ }),
    );
    expect(
      screen.getByText('Incorrect passcode for this private campaign.'),
    ).toBeInTheDocument();
  });

  it('clears the box, and its old error, when it is reopened', async () => {
    const onJoinOrEnterGame = vi.fn(async () => {
      throw new Error('Wrong passcode');
    });
    const { user } = setup({ games: [SECRET], onJoinOrEnterGame });
    await user.click(within(card('Secret Table')).getByText(/Claim Italy/));
    await user.type(screen.getByLabelText('Passcode'), 'nope');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Italy/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Enter Campaign Passcode'),
    ).not.toBeInTheDocument();
    await user.click(within(card('Secret Table')).getByText(/Claim Italy/));
    expect(screen.getByLabelText('Passcode')).toHaveValue('');
    expect(screen.queryByText('Wrong passcode')).not.toBeInTheDocument();
  });

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
