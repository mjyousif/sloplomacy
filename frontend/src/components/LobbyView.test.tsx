// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  card,
  MINE,
  OPEN,
  resetLobbyEnv,
  SANDBOX,
  SECRET,
  setup,
  stubMatchMedia,
} from './LobbyView.testkit';
import { game } from './lobby/lobby.testkit';

beforeEach(resetLobbyEnv);
afterEach(() => vi.useRealTimers());

describe('LobbyView layout', () => {
  it('stacks the hero, both sections, both cards and the footer in order', () => {
    const { view } = setup();
    const root = view.container.firstElementChild as HTMLElement;
    expect([...root.children].map((c) => c.className)).toEqual([
      'lobby-hero',
      'lobby-main-grid',
      'lobby-footer-bar',
    ]);
    const grid = root.querySelector('.lobby-main-grid') as HTMLElement;
    expect([...grid.children].map((c) => c.className)).toEqual([
      'lobby-games-column',
      'lobby-create-column',
    ]);
    expect(
      [
        ...(grid.querySelector('.lobby-games-column') as HTMLElement).children,
      ].map((c) => c.tagName),
    ).toEqual(['SECTION', 'SECTION']);
    expect(
      [
        ...(grid.querySelector('.lobby-create-column') as HTMLElement).children,
      ].map((c) => c.className),
    ).toEqual(['lobby-create-card', 'lobby-create-card join-card']);
  });

  it('says "on the right" on a desktop and "below" on a phone', () => {
    const first = setup();
    expect(
      screen.getAllByText(/campaign on the right|match on the right/),
    ).toHaveLength(2);
    first.view.unmount();
    stubMatchMedia(true);
    setup();
    expect(screen.getAllByText(/campaign below|match below/)).toHaveLength(2);
  });

  it('sorts games: my list gets mine and saved sandboxes, the lobbies skip sandboxes', () => {
    setup({ games: [OPEN, MINE, SANDBOX] });
    expect(screen.getByText('2 Games')).toBeInTheDocument();
    const mine = document.querySelectorAll('.my-game-row');
    expect(
      [...mine].map((r) => r.querySelector('.my-game-name')?.textContent),
    ).toEqual(['My Table', 'Saved Study']);
    expect(
      [...document.querySelectorAll('.lobby-game-card h3')].map(
        (h) => h.textContent,
      ),
    ).toEqual(['Open Table', 'My Table']);
  });

  it('shows a guest the lock box and no "my games" for them', () => {
    setup({ user: null, games: [MINE] });
    expect(
      screen.getByText('Account Required to Save & Track Campaigns'),
    ).toBeInTheDocument();
    expect(document.querySelector('.my-game-row')).toBeNull();
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
      screen.getByText('Leave', { selector: '.leave-campaign-btn span' }),
    );
    expect(props.onOpenSurrenderModal).toHaveBeenCalledExactlyOnceWith(
      MINE,
      'AUSTRIA',
    );
  });
});
