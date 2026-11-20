// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiplayerGameSummary } from '../types/diplomacy';
import {
  hostDialog,
  joinDialog,
  openHost,
  openJoin,
  resetLobbyEnv,
  setup,
} from './LobbyView.testkit';
import { game } from './lobby/lobby.testkit';

beforeEach(resetLobbyEnv);
afterEach(() => vi.useRealTimers());

describe('LobbyView hosting', () => {
  const nameField = () => screen.getByLabelText('Campaign Name');

  it('sends a guest to sign up instead', async () => {
    const { props, user } = setup({ user: null });
    openHost();
    await user.click(
      screen.getByRole('button', { name: 'Sign In to Host Campaign' }),
    );
    expect(hostDialog()).not.toBeInTheDocument();
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to host a new multiplayer Diplomacy campaign.',
      'signup',
    );
    expect(props.onCreateGame).not.toHaveBeenCalled();
  });

  it('creates a public game with the trimmed name and the picked country', async () => {
    const { props, user } = setup();
    openHost();
    await user.type(nameField(), '  Vienna ');
    await user.click(
      screen.getByText('Germany', {
        selector: '[data-testid="create-campaign-card"] span',
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
    // The dialog closes, and opens again with an empty name.
    expect(hostDialog()).not.toBeInTheDocument();
    openHost();
    expect(nameField()).toHaveValue('');
    expect(
      screen.queryByText('Private Campaign Created!'),
    ).not.toBeInTheDocument();
  });

  it('names an unnamed game after the player', async () => {
    const { props, user } = setup();
    openHost();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    const [name] = vi.mocked(props.onCreateGame).mock.calls[0];
    expect(name).toMatch(/^Ada's /);
  });

  it('wants a passcode for a private game', async () => {
    const { props, user } = setup();
    openHost();
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
    expect(hostDialog()).toBeInTheDocument();
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
    openHost();
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
    expect(hostDialog()).not.toBeInTheDocument();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByTitle('Copy Game ID'));
    expect(writeText).toHaveBeenLastCalledWith('mp_new');
    expect(screen.getByText('Copied')).toBeInTheDocument();
    // The link holds the game id alone; whoever opens it is asked for the passcode.
    expect(screen.getByTestId('private-campaign-link')).toHaveTextContent(
      `${window.location.origin}/game/mp_new`,
    );
    fireEvent.click(screen.getByTitle(/Copy Game Link/));
    expect(writeText).toHaveBeenLastCalledWith(
      `${window.location.origin}/game/mp_new`,
    );
    expect(screen.getAllByText('Copied')).toHaveLength(1);
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
    openHost();
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
    openHost();
    expect(screen.getByLabelText('Campaign Passcode / PIN')).toHaveValue('');
  });

  it('shows why creating failed, and its own words if there are none', async () => {
    const onCreateGame = vi
      .fn()
      .mockRejectedValueOnce(new Error('Name taken'))
      .mockRejectedValueOnce(new Error(''));
    const { user } = setup({ onCreateGame });
    openHost();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(screen.getByText('Name taken')).toBeInTheDocument();
    expect(hostDialog()).toBeInTheDocument();
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
    openHost();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(
      screen.getByRole('button', { name: 'Creating Campaign...' }),
    ).toBeDisabled();
    await act(async () => finish());
    expect(hostDialog()).not.toBeInTheDocument();
    openHost();
    expect(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    ).toBeEnabled();
  });
});

describe('LobbyView joining with a code', () => {
  const idField = () => screen.getByLabelText('Game ID');

  it('asks a guest to sign in', async () => {
    const { props } = setup({ user: null });
    openJoin();
    fireEvent.submit(idField().closest('form') as Element);
    expect(props.onOpenAuth).toHaveBeenCalledWith(
      'Sign in or create an account to join a campaign.',
      'signin',
    );
    expect(joinDialog()).not.toBeInTheDocument();
  });

  it('ignores a blank Game ID', () => {
    const { props } = setup();
    openJoin();
    fireEvent.submit(idField().closest('form') as Element);
    expect(props.onJoinOrEnterGame).not.toHaveBeenCalled();
    expect(joinDialog()).toBeInTheDocument();
  });

  it('joins with the trimmed id and passcode, then empties both', async () => {
    const { props, user } = setup();
    openJoin();
    await user.type(idField(), ' mp_77 ');
    await user.type(screen.getByLabelText('Lobby Passcode'), ' pw ');
    await user.click(
      screen.getByText('Turkey', {
        selector: '[data-testid="join-with-code-card"] span',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim Turkey/ }),
    );
    expect(props.onJoinOrEnterGame).toHaveBeenCalledExactlyOnceWith(
      'mp_77',
      'TURKEY',
      'pw',
    );
    // The dialog closes, and opens again with both fields empty.
    expect(joinDialog()).not.toBeInTheDocument();
    openJoin();
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
    openJoin();
    await user.type(idField(), 'mp_1');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    );
    expect(screen.getByText('No such game')).toBeInTheDocument();
    expect(joinDialog()).toBeInTheDocument();
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
    openJoin();
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
