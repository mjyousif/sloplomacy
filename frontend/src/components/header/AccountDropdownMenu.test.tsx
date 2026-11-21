// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../../types/diplomacy';
import { DEFAULT_DISPLAY_PREFS } from '../../utils/displayPrefs';
import {
  AccountDropdownMenu,
  type AccountDropdownMenuProps,
} from './AccountDropdownMenu';

const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.test',
  displayName: 'AliceHandle',
  fullName: 'Alice Wonderland',
};

function makeGame(
  overrides: Partial<MultiplayerGameSummary> = {},
): MultiplayerGameSummary {
  return {
    game_id: 'mp_1',
    name: 'Imperial Concert',
    status: 'active',
    season: 'Spring',
    year: 1902,
    phase: 'Movement',
    created_by: 'alice@example.test',
    creator_id: 'user-alice',
    created_at: '2026-11-01T00:00:00Z',
    participants: {
      FRANCE: {
        user_id: 'user-alice',
        display_name: 'AliceHandle',
        power: 'FRANCE',
        joined_at: '2026-11-01T00:00:00Z',
      },
    },
    finalized_powers: [],
    is_sandbox: false,
    ...overrides,
  };
}

function renderMenu(overrides: Partial<AccountDropdownMenuProps> = {}) {
  const props: AccountDropdownMenuProps = {
    viewMode: 'multiplayer',
    activeGameId: 'mp_1',
    activeGameSummary: makeGame(),
    myGames: [
      makeGame(),
      makeGame({
        game_id: 'sbx_saved_1',
        name: 'Balkans Study',
        is_sandbox: true,
        participants: {},
      }),
    ],
    authUser: ALICE,
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onOpenAccount: vi.fn(),
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    displayPrefsSaveState: 'device',
    onChangeDisplayPrefs: vi.fn(),
    onSwitchToSoloSandbox: vi.fn(),
    onSelectGame: vi.fn(),
    ...overrides,
  };
  const view = render(<AccountDropdownMenu {...props} />);
  return { ...view, props };
}

describe('AccountDropdownMenu: profile header and structure', () => {
  it('shows distinct name, username, and email first in the dropdown', async () => {
    renderMenu();
    expect(screen.queryByTestId('account-menu-panel')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    const panel = screen.getByTestId('account-menu-panel');
    expect(panel).toBeInTheDocument();

    expect(screen.getByTestId('account-menu-name')).toHaveTextContent(
      'Alice Wonderland',
    );
    expect(screen.getByTestId('account-menu-username')).toHaveTextContent(
      '@AliceHandle',
    );
    expect(screen.getByTestId('account-menu-email')).toHaveTextContent(
      'alice@example.test',
    );

    // Order of sections: Profile -> Display Settings -> Account Settings -> Switch Game -> Sign Out
    const profile = screen.getByTestId('account-menu-profile');
    const displayBtn = screen.getByTestId('account-menu-display-settings');
    const accountSettingsBtn = screen.getByTestId(
      'account-menu-account-settings',
    );
    const changeGameBtn = screen.getByTestId('account-menu-change-game');
    const signOutBtn = screen.getByTestId('account-menu-signout');

    expect(
      screen.queryByTestId('account-menu-edit-username'),
    ).not.toBeInTheDocument();
    expect(accountSettingsBtn).toHaveTextContent('Account Settings');

    expect(
      profile.compareDocumentPosition(displayBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      displayBtn.compareDocumentPosition(accountSettingsBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      accountSettingsBtn.compareDocumentPosition(changeGameBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      changeGameBtn.compareDocumentPosition(signOutBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not duplicate the username when fullName is absent or matches displayName and opens Account Settings from menu', async () => {
    const { props, rerender } = renderMenu({
      authUser: {
        id: 'user-bob',
        email: 'bob@example.test',
        displayName: 'Bob',
      },
    });
    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    expect(screen.queryByTestId('account-menu-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('account-menu-username')).toHaveTextContent(
      '@Bob',
    );
    expect(screen.getByTestId('account-menu-email')).toHaveTextContent(
      'bob@example.test',
    );

    rerender(
      <AccountDropdownMenu
        {...props}
        authUser={{
          id: 'user-bob',
          email: 'bob@example.test',
          displayName: 'Bob',
          fullName: 'Bob',
        }}
      />,
    );
    expect(screen.queryByTestId('account-menu-name')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-menu-account-settings'));
    expect(props.onOpenAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('account-menu-panel')).not.toBeInTheDocument();
  });

  it('shows an icon-only trigger for guests and Sign In / Register when signed out', async () => {
    const { props } = renderMenu({ authUser: null });
    const trigger = screen.getByTestId('account-menu-trigger');
    expect(trigger).toHaveTextContent('');
    expect(trigger).toHaveAttribute('aria-label', 'Guest menu');
    await userEvent.click(trigger);
    expect(screen.getByTestId('account-menu-name')).toHaveTextContent(
      'Guest Mode',
    );
    expect(
      screen.queryByTestId('account-menu-account-settings'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('account-menu-signin'));
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('signs out from the bottom button and closes the menu', async () => {
    const { props } = renderMenu();
    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    await userEvent.click(screen.getByTestId('account-menu-signout'));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('account-menu-panel')).not.toBeInTheDocument();
  });
});

describe('AccountDropdownMenu: Display Settings subview', () => {
  it('shows Display Settings only outside the lobby and opens existing options including Spacing', async () => {
    const { rerender, props } = renderMenu({ viewMode: 'sandbox' });
    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    await userEvent.click(screen.getByTestId('account-menu-display-settings'));

    expect(
      screen.getByRole('heading', { name: 'Display settings' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Spacing')).toBeInTheDocument();
    const compactRadio = screen.getByRole('radio', { name: 'Compact' });
    const normalRadio = screen.getByRole('radio', { name: 'Normal' });
    expect(normalRadio).toBeChecked();
    expect(compactRadio).not.toBeChecked();

    await userEvent.click(compactRadio);
    expect(props.onChangeDisplayPrefs).toHaveBeenCalledWith({
      uiSpacing: 'compact',
    });

    await userEvent.click(screen.getByTestId('account-menu-back'));
    expect(screen.getByTestId('account-menu-profile')).toBeInTheDocument();

    rerender(<AccountDropdownMenu {...props} viewMode="lobby" />);
    expect(
      screen.queryByTestId('account-menu-display-settings'),
    ).not.toBeInTheDocument();
  });
});

describe('AccountDropdownMenu: Switch Game', () => {
  it('shows Switch Game with inline current game subtext and switches on click', async () => {
    const otherGame = makeGame({
      game_id: 'mp_2',
      name: 'Mediterranean Storm',
      season: 'Fall',
      year: 1903,
    });
    const { props, rerender } = renderMenu({
      viewMode: 'multiplayer',
      activeGameId: 'mp_1',
      myGames: [makeGame(), otherGame],
    });

    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    const switchBtn = screen.getByTestId('account-menu-change-game');
    expect(switchBtn).toHaveTextContent('Switch Game');
    expect(screen.getByTestId('switch-game-current')).toHaveTextContent(
      'Imperial Concert',
    );
    expect(screen.queryByTestId('change-game-list')).not.toBeInTheDocument();

    await userEvent.click(switchBtn);
    const list = screen.getByTestId('change-game-list');
    expect(list).toBeInTheDocument();

    const soloItem = within(list).getByTestId('change-game-item-solo');
    const currentItem = within(list).getByTestId('change-game-item-mp_1');
    const otherItem = within(list).getByTestId('change-game-item-mp_2');

    expect(soloItem).toHaveAttribute('data-current', 'false');
    expect(currentItem).toHaveAttribute('data-current', 'true');
    expect(otherItem).toHaveAttribute('data-current', 'false');

    await userEvent.click(otherItem);
    expect(props.onSelectGame).toHaveBeenCalledWith(otherGame);
    expect(screen.queryByTestId('account-menu-panel')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    await userEvent.click(screen.getByTestId('account-menu-change-game'));
    await userEvent.click(screen.getByTestId('change-game-item-solo'));
    expect(props.onSwitchToSoloSandbox).toHaveBeenCalledTimes(1);

    rerender(
      <AccountDropdownMenu
        {...props}
        viewMode="sandbox"
        activeGameSummary={null}
      />,
    );
    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    expect(screen.getByTestId('switch-game-current')).toHaveTextContent(
      'Solo Sandbox',
    );
  });

  it('closes on Escape and returns focus to trigger', async () => {
    renderMenu();
    const trigger = screen.getByTestId('account-menu-trigger');
    await userEvent.click(trigger);
    expect(screen.getByTestId('account-menu-panel')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('account-menu-panel')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
