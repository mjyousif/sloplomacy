// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiplayerGameSummary } from '../types/diplomacy';
import { LobbyView } from './LobbyView';
import { game, ME, seat } from './lobby/lobby.testkit';

function stubMatchMedia(compact: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: compact,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

beforeEach(() => stubMatchMedia(false));
afterEach(() => vi.useRealTimers());

type Props = React.ComponentProps<typeof LobbyView>;
function setup(over: Partial<Props> = {}) {
  const props: Props = {
    user: ME,
    games: [],
    loadingGames: false,
    onRefreshGames: vi.fn(),
    onEnterSandbox: vi.fn(),
    onOpenAuth: vi.fn(),
    onCreateGame: vi.fn(async () => {}),
    onJoinOrEnterGame: vi.fn(async () => {}),
    onOpenSurrenderModal: vi.fn(),
    ...over,
  };
  const user = userEvent.setup();
  const view = render(<LobbyView {...props} />);
  return { props, user, view };
}

const OPEN = game({ game_id: 'mp_open', name: 'Open Table' });
const SECRET = game({
  game_id: 'mp_sec',
  name: 'Secret Table',
  is_private: true,
  has_passcode: true,
});
const MINE = game({
  game_id: 'mp_mine',
  name: 'My Table',
  has_passcode: true,
  participants: { AUSTRIA: seat('AUSTRIA', 'me') },
});
const SANDBOX = game({
  game_id: 'sbx',
  name: 'Saved Study',
  is_sandbox: true,
  participants: { ITALY: seat('ITALY', 'me') },
});
const card = (name: string) =>
  screen.getByText(name).closest('.lobby-game-card') as HTMLElement;

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

describe('LobbyView claiming a seat', () => {
  it('asks a guest to sign in, naming the country and game', async () => {
    const { props, user } = setup({ user: null, games: [OPEN] });
    await user.click(within(card('Open Table')).getByText('+ Claim France'));
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
    await user.click(within(card('Open Table')).getByText('+ Claim Russia'));
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
    await user.click(within(card('Open Table')).getByText('+ Claim Russia'));
    expect(err).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Entering...')).not.toBeInTheDocument();
    err.mockRestore();
  });

  it('asks a newcomer for the passcode of a private game', async () => {
    const { props, user } = setup({ games: [SECRET] });
    await user.click(within(card('Secret Table')).getByText('🔒 Claim Italy'));
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
    await user.click(within(card('Secret Table')).getByText('🔒 Claim Italy'));
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
    await user.click(within(card('Secret Table')).getByText('🔒 Claim Italy'));
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
    await user.click(within(card('Secret Table')).getByText('🔒 Claim Italy'));
    await user.type(screen.getByLabelText('Passcode'), 'nope');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Italy/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Enter Campaign Passcode'),
    ).not.toBeInTheDocument();
    await user.click(within(card('Secret Table')).getByText('🔒 Claim Italy'));
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

describe('LobbyView hosting', () => {
  const nameField = () => screen.getByLabelText('Campaign Name');

  it('sends a guest to sign up instead', async () => {
    const { props, user } = setup({ user: null });
    await user.click(
      screen.getByRole('button', { name: 'Sign In to Host Campaign' }),
    );
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to host a new multiplayer Diplomacy campaign.',
      'signup',
    );
    expect(props.onCreateGame).not.toHaveBeenCalled();
  });

  it('creates a public game with the trimmed name and the picked country', async () => {
    const { props, user } = setup();
    await user.type(nameField(), '  Vienna ');
    await user.click(
      screen.getByText('Germany', {
        selector: '.lobby-create-card:not(.join-card) span',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: /Create & Play as Germany/ }),
    );
    expect(props.onCreateGame).toHaveBeenCalledExactlyOnceWith(
      'Vienna',
      'GERMANY',
      false,
      '',
    );
    expect(nameField()).toHaveValue('');
    expect(
      screen.queryByText('Private Campaign Created!'),
    ).not.toBeInTheDocument();
  });

  it('names an unnamed game after the player', async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    const [name] = vi.mocked(props.onCreateGame).mock.calls[0];
    expect(name).toMatch(/^Ada's /);
  });

  it('wants a passcode for a private game', async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole('button', { name: /Private \(Passcode\)/ }),
    );
    fireEvent.submit(
      screen
        .getByLabelText('Campaign Passcode / PIN')
        .closest('form') as Element,
    );
    expect(
      screen.getByText('Please specify a passcode for your private campaign.'),
    ).toBeInTheDocument();
    expect(props.onCreateGame).not.toHaveBeenCalled();
  });

  it('shows the credentials of a private game, and copies them with a 2.5 s tick', async () => {
    const writeText = vi.fn(async () => {});
    const onCreateGame = vi.fn(async () =>
      game({ game_id: 'mp_new', name: 'Fresh' }),
    );
    const { user } = setup({ onCreateGame });
    // user-event installs its own clipboard when it is set up, so replace that one.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    await user.type(nameField(), 'Fresh');
    await user.click(
      screen.getByRole('button', { name: /Private \(Passcode\)/ }),
    );
    await user.type(
      screen.getByLabelText('Campaign Passcode / PIN'),
      ' sekret ',
    );
    await user.click(
      screen.getByRole('button', { name: /Create Private & Play as France/ }),
    );
    expect(onCreateGame).toHaveBeenCalledExactlyOnceWith(
      'Fresh',
      'FRANCE',
      true,
      'sekret',
    );
    expect(screen.getByText('Private Campaign Created!')).toBeInTheDocument();
    expect(nameField()).toHaveValue('');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByTitle('Copy Game ID'));
    expect(writeText).toHaveBeenLastCalledWith('mp_new');
    expect(screen.getByText('Copied')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Copy Passcode'));
    expect(writeText).toHaveBeenLastCalledWith('sekret');
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(screen.getByText('Copied')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('Copied')).not.toBeInTheDocument();
  });

  it('empties the passcode after creating, and shows no credentials when none come back', async () => {
    const { props, user } = setup();
    await user.click(
      screen.getByRole('button', { name: /Private \(Passcode\)/ }),
    );
    await user.type(screen.getByLabelText('Campaign Passcode / PIN'), 'sekret');
    await user.click(
      screen.getByRole('button', { name: /Create Private & Play as France/ }),
    );
    expect(props.onCreateGame).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('Private Campaign Created!'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Cannot read/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Campaign Passcode / PIN')).toHaveValue('');
  });

  it('shows why creating failed, and its own words if there are none', async () => {
    const onCreateGame = vi
      .fn()
      .mockRejectedValueOnce(new Error('Name taken'))
      .mockRejectedValueOnce(new Error(''));
    const { user } = setup({ onCreateGame });
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(screen.getByText('Name taken')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(screen.getByText('Failed to create campaign.')).toBeInTheDocument();
  });

  it('locks the button while creating', async () => {
    let finish: (v?: MultiplayerGameSummary) => void = () => {};
    const onCreateGame = vi.fn(
      () => new Promise<MultiplayerGameSummary | void>((r) => (finish = r)),
    );
    const { user } = setup({ onCreateGame });
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Creating Campaign...' }),
    ).toBeDisabled();
    await act(async () => finish());
    expect(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    ).toBeEnabled();
  });
});

describe('LobbyView joining with a code', () => {
  const idField = () => screen.getByLabelText('Game ID');

  it('asks a guest to sign in', async () => {
    const { props } = setup({ user: null });
    fireEvent.submit(idField().closest('form') as Element);
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to join a campaign.',
      'signin',
    );
  });

  it('ignores a blank Game ID', () => {
    const { props } = setup();
    fireEvent.submit(idField().closest('form') as Element);
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
  });

  it('joins with the trimmed id and passcode, then empties both', async () => {
    const { props, user } = setup();
    await user.type(idField(), ' mp_77 ');
    await user.type(screen.getByLabelText('Lobby Passcode'), ' pw ');
    await user.click(
      screen.getByText('Turkey', { selector: '.join-card span' }),
    );
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Turkey/ }),
    );
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_77',
      'TURKEY',
      'pw',
    );
    expect(idField()).toHaveValue('');
    expect(screen.getByLabelText('Lobby Passcode')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: /Unlock & Claim Turkey/ }),
    ).toBeDisabled();
  });

  it('keeps what was typed and says why when joining fails', async () => {
    const onJoinOrEnterGame = vi
      .fn()
      .mockRejectedValueOnce(new Error('No such game'))
      .mockRejectedValueOnce(new Error(''));
    const { user } = setup({ onJoinOrEnterGame });
    await user.type(idField(), 'mp_1');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    );
    expect(screen.getByText('No such game')).toBeInTheDocument();
    expect(idField()).toHaveValue('mp_1');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    );
    expect(
      screen.getByText(
        'Could not join campaign. Please verify Game ID and passcode.',
      ),
    ).toBeInTheDocument();
  });

  it('shows Verifying while the join is out', async () => {
    let finish: () => void = () => {};
    const onJoinOrEnterGame = vi.fn(
      () => new Promise<void>((r) => (finish = r)),
    );
    const { user } = setup({ onJoinOrEnterGame });
    await user.type(idField(), 'mp_1');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Verifying & Joining...' }),
    ).toBeDisabled();
    await act(async () => finish());
    expect(
      screen.queryByText('Verifying & Joining...'),
    ).not.toBeInTheDocument();
  });
});
