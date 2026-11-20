// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LobbyView } from './LobbyView';
import {
  hostDialog,
  joinDialog,
  openHost,
  openJoin,
  resetLobbyEnv,
  setup,
} from './LobbyView.testkit';

beforeEach(resetLobbyEnv);

describe('LobbyView Host and Join dialogs', () => {
  it('opens each form in its own dialog, with focus on its first field', () => {
    setup();
    expect(hostDialog()).not.toBeInTheDocument();
    expect(joinDialog()).not.toBeInTheDocument();

    openHost();
    const host = screen.getByRole('dialog', { name: 'Host game' });
    expect(within(host).getByTestId('create-campaign-card')).toBeVisible();
    expect(screen.getByLabelText('Campaign Name')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close Host game' }));
    expect(hostDialog()).not.toBeInTheDocument();

    openJoin();
    const join = screen.getByRole('dialog', { name: 'Join with code' });
    expect(within(join).getByTestId('join-with-code-card')).toBeVisible();
    expect(screen.getByLabelText('Game ID')).toHaveFocus();
    expect(hostDialog()).not.toBeInTheDocument();
  });

  it('closes on Escape and on a click outside, but not on a click inside', () => {
    setup();
    openHost();
    fireEvent.click(screen.getByTestId('create-campaign-card'));
    expect(hostDialog()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(hostDialog()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(hostDialog()).not.toBeInTheDocument();

    openJoin();
    fireEvent.click(joinDialog() as HTMLElement);
    expect(joinDialog()).not.toBeInTheDocument();
  });

  it('keeps what was typed when a dialog is closed and opened again', async () => {
    const { user } = setup();
    openHost();
    await user.type(screen.getByLabelText('Campaign Name'), 'Vienna');
    fireEvent.keyDown(window, { key: 'Escape' });
    openHost();
    expect(screen.getByLabelText('Campaign Name')).toHaveValue('Vienna');
  });

  it('drops an old error when a dialog is opened again', async () => {
    const onCreateGame = vi.fn().mockRejectedValue(new Error('Name taken'));
    const onJoinOrEnterGame = vi.fn().mockRejectedValue(new Error('No seat'));
    const { user } = setup({ onCreateGame, onJoinOrEnterGame });

    openHost();
    await user.click(
      screen.getByRole('button', { name: /Create & Play as France/ }),
    );
    expect(screen.getByTestId('create-campaign-error')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    openHost();
    expect(
      screen.queryByTestId('create-campaign-error'),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    openJoin();
    await user.type(screen.getByLabelText('Game ID'), 'mp_1');
    await user.click(
      screen.getByRole('button', { name: /Unlock & Claim England/ }),
    );
    expect(screen.getByTestId('join-code-error')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    openJoin();
    expect(screen.queryByTestId('join-code-error')).not.toBeInTheDocument();
  });

  it('opens Join with code with the Game ID from a link, asking for the passcode', async () => {
    const onPasscodeRequestShown = vi.fn();
    const onWatchGame = vi.fn(async () => {});
    const { user, view, props } = setup({
      passcodeRequest: { gameId: 'mp_link' },
      onPasscodeRequestShown,
      onWatchGame,
    });
    const join = screen.getByRole('dialog', { name: 'Join with code' });
    expect(within(join).getByLabelText('Game ID')).toHaveValue('mp_link');
    expect(within(join).getByLabelText(/Passcode/)).toHaveValue('');
    expect(onPasscodeRequestShown).toHaveBeenCalledTimes(1);
    view.rerender(<LobbyView {...props} passcodeRequest={null} />);

    await user.type(within(join).getByLabelText(/Passcode/), 'pw');
    await user.click(within(join).getByRole('button', { name: /Watch/ }));
    expect(onWatchGame).toHaveBeenCalledWith('mp_link', 'pw');
  });
});
