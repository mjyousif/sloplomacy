// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../../types/diplomacy';
import { DEFAULT_DISPLAY_PREFS } from '../../utils/displayPrefs';
import { TopHeader, type TopHeaderProps } from './TopHeader';

const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.test',
  displayName: 'Alice',
};

const MATCH = {
  game_id: 'game_2',
  name: 'Friday Night',
} as MultiplayerGameSummary;

function renderHeader(overrides: Partial<TopHeaderProps> = {}) {
  const props: TopHeaderProps = {
    viewMode: 'sandbox',
    turn: { season: 'Spring', year: 1901, phase: 'Movement' },
    winner: null,
    onBackToLobby: vi.fn(),
    onEnterSoloSandbox: vi.fn(),
    matchSummary: null,
    playerPower: 'FRANCE',
    displayPrefs: DEFAULT_DISPLAY_PREFS,
    displayPrefsSaveState: 'device',
    onChangeDisplayPrefs: vi.fn(),
    authUser: null,
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  };
  const view = render(<TopHeader {...props} />);
  return { ...view, props };
}

describe('TopHeader: brand and navigation', () => {
  it('goes back to the lobby from the brand', async () => {
    const { props } = renderHeader();
    await userEvent.click(screen.getByTitle('Return to Main Lobby'));
    expect(props.onBackToLobby).toHaveBeenCalledTimes(1);
  });

  it('opens Export to Solo Sandbox from Game Settings in multiplayer and omits it in Solo Sandbox', async () => {
    const { props, rerender } = renderHeader({
      viewMode: 'multiplayer',
      matchSummary: MATCH,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    const subtitle = screen.getByTestId('game-settings-subtitle');
    expect(subtitle).toHaveTextContent('Friday Night');
    expect(within(subtitle).getByTestId('power-flag-france')).toBeVisible();
    const item = screen.getByTestId('game-settings-solo-sandbox');
    expect(item).toHaveTextContent('Export to Solo Sandbox');
    expect(item).not.toHaveAttribute('data-active');
    await userEvent.click(item);
    expect(props.onEnterSoloSandbox).toHaveBeenCalledTimes(1);

    rerender(<TopHeader {...props} viewMode="sandbox" matchSummary={null} />);
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    expect(screen.getByTestId('game-settings-subtitle')).toHaveTextContent(
      'Solo Sandbox',
    );
    expect(
      screen.queryByTestId('game-settings-solo-sandbox'),
    ).not.toBeInTheDocument();
  });

  it('shows a flask icon on Game Settings in Solo Sandbox and a crown icon in a game, with no separate flask indicator', () => {
    const { rerender, props } = renderHeader({ viewMode: 'sandbox' });
    expect(
      screen.queryByTestId('sandbox-mode-indicator'),
    ).not.toBeInTheDocument();
    const sandboxBtn = screen.getByTestId('game-settings-trigger');
    expect(sandboxBtn).toHaveAttribute('data-icon', 'flask');
    expect(sandboxBtn).toHaveAttribute('data-solo-sandbox', 'true');

    rerender(
      <TopHeader {...props} viewMode="multiplayer" matchSummary={MATCH} />,
    );
    expect(
      screen.queryByTestId('sandbox-mode-indicator'),
    ).not.toBeInTheDocument();
    const matchBtn = screen.getByTestId('game-settings-trigger');
    expect(matchBtn).toHaveAttribute('data-icon', 'crown');
    expect(matchBtn).toHaveAttribute('data-solo-sandbox', 'false');

    rerender(<TopHeader {...props} viewMode="lobby" />);
    expect(
      screen.queryByTestId('sandbox-mode-indicator'),
    ).not.toBeInTheDocument();
  });

  it('hides Game Settings in the lobby and shows it on a board', () => {
    const { rerender, props } = renderHeader({ viewMode: 'lobby' });
    expect(
      screen.queryByTestId('game-settings-trigger'),
    ).not.toBeInTheDocument();

    rerender(<TopHeader {...props} viewMode="sandbox" />);
    expect(screen.getByTestId('game-settings-trigger')).toBeInTheDocument();
  });

  it('never renders a separate active-match pill next to the brand', () => {
    const { rerender, props } = renderHeader({
      viewMode: 'multiplayer',
      matchSummary: MATCH,
    });
    expect(screen.queryByTestId('nav-match-pill')).not.toBeInTheDocument();
    rerender(<TopHeader {...props} viewMode="sandbox" matchSummary={null} />);
    expect(screen.queryByTestId('nav-match-pill')).not.toBeInTheDocument();
  });

  it('wires Reset Sandbox... and Return to Previous Game in Solo Sandbox through Game Settings', async () => {
    const onResetSandbox = vi.fn();
    const onReturnToPreviousGame = vi.fn();
    renderHeader({
      viewMode: 'sandbox',
      matchSummary: null,
      isGameCreator: true,
      onResetSandbox,
      onReturnToPreviousGame,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-reset-sandbox'));
    expect(onResetSandbox).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-return-previous'));
    expect(onReturnToPreviousGame).toHaveBeenCalledTimes(1);
  });
});

describe('TopHeader: the turn and the winner', () => {
  it('shows the turn on a board', () => {
    renderHeader({ turn: { season: 'Fall', year: 1903, phase: 'Retreats' } });
    const pill = screen.getByTestId('turn-chronicle-pill');
    expect(pill).toHaveTextContent('Fall 1903 Retreats');
  });

  it('hides the board readout in the lobby', () => {
    renderHeader({ viewMode: 'lobby', winner: 'ENGLAND' });
    expect(screen.queryByTestId('turn-chronicle-pill')).not.toBeInTheDocument();
    expect(screen.queryByText(/WINS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
  });

  it('announces the winner', () => {
    renderHeader({ winner: 'ENGLAND' });
    expect(screen.getByText('ENGLAND WINS')).toBeInTheDocument();
  });

  it('shows no order-check pill: the order sidebar lists errors and warnings', () => {
    renderHeader({ winner: 'ENGLAND' });
    expect(screen.queryByTestId('header-error-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('header-warning-pill')).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Warning/)).not.toBeInTheDocument();
  });

  it('shows unified turn history controls when resolved turns exist', async () => {
    const onStepHistoryTurn = vi.fn();
    const onSelectHistoryTurn = vi.fn();
    renderHeader({
      turn: { season: 'Fall', year: 1901, phase: 'Movement' },
      historyEntries: [
        { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
      ],
      historyViewIndex: 0,
      onStepHistoryTurn,
      onSelectHistoryTurn,
    });
    expect(screen.getByTestId('turn-history')).toBeInTheDocument();
    expect(screen.getByTestId('turn-chronicle-pill')).toHaveAttribute(
      'data-viewing-past',
      'true',
    );
    await userEvent.click(screen.getByTestId('turn-history-select'));
    await userEvent.click(screen.getByTestId('turn-history-option-live'));
    expect(onSelectHistoryTurn).toHaveBeenCalledWith(null);
  });

  it('locks the turn chronicle controls when historyLocked is true', () => {
    renderHeader({
      turn: { season: 'Fall', year: 1901, phase: 'Movement' },
      historyEntries: [
        { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
      ],
      historyViewIndex: null,
      historyLocked: true,
    });
    expect(screen.getByTestId('turn-history-select')).toBeDisabled();
    expect(screen.getByTestId('turn-history-prev')).toBeDisabled();
  });
});

describe('TopHeader: Game Settings and Account dropdowns', () => {
  it('omits any Live Sync indicator', () => {
    renderHeader();
    expect(screen.queryByText('Live Sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
  });

  it('places Game Settings to the left of the Account dropdown', () => {
    renderHeader();
    const gameBtn = screen.getByTestId('game-settings-trigger');
    const accountBtn = screen.getByTestId('account-menu-trigger');
    expect(
      gameBtn.compareDocumentPosition(accountBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('puts display settings inside the Account dropdown only outside the lobby', async () => {
    const { rerender, props } = renderHeader();
    expect(
      screen.queryByRole('button', { name: 'Display settings' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-menu-trigger'));
    expect(
      screen.getByTestId('account-menu-display-settings'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('account-menu-display-settings'));
    expect(
      screen.getByRole('heading', { name: 'Display settings' }),
    ).toBeInTheDocument();

    rerender(<TopHeader {...props} viewMode="lobby" />);
    expect(
      screen.queryByTestId('account-menu-display-settings'),
    ).not.toBeInTheDocument();
  });

  it('shows the Administrator entry inside Game Settings only for the game creator outside the lobby', async () => {
    const onOpenAdminTools = vi.fn();
    const onToggleAdminOverride = vi.fn();
    const onResolveTurn = vi.fn();
    const onExitAdmin = vi.fn();
    const { rerender, props } = renderHeader({
      isGameCreator: true,
      onOpenAdminTools,
      onToggleAdminOverride,
      onResolveTurn,
      onExitAdmin,
    });

    const trigger = screen.getByTestId('game-settings-trigger');
    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    expect(screen.getByTestId('admin-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-direct-edit')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(screen.queryByTestId('btn-exit-admin-mode')).toBeNull();

    await userEvent.click(screen.getByTestId('btn-toggle-direct-edit'));
    expect(onToggleAdminOverride).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    await userEvent.click(screen.getByTestId('btn-open-admin-console'));
    expect(onOpenAdminTools).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    await userEvent.click(screen.getByTestId('btn-admin-resolve-turn'));
    expect(onResolveTurn).toHaveBeenCalledTimes(1);

    rerender(
      <TopHeader
        {...props}
        isGameCreator={true}
        winner="FRANCE"
        onOpenAdminTools={onOpenAdminTools}
        onToggleAdminOverride={onToggleAdminOverride}
        onResolveTurn={onResolveTurn}
        onExitAdmin={onExitAdmin}
      />,
    );
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-admin-settings'));
    expect(screen.getByTestId('btn-admin-resolve-turn')).toBeDisabled();

    rerender(
      <TopHeader
        {...props}
        isGameCreator={true}
        adminOverrideActive={true}
        onOpenAdminTools={onOpenAdminTools}
        onToggleAdminOverride={onToggleAdminOverride}
        onResolveTurn={onResolveTurn}
        onExitAdmin={onExitAdmin}
      />,
    );
    const exitBtn = screen.getByTestId('btn-exit-admin-mode');
    expect(exitBtn).toHaveTextContent('Exit Admin Mode');
    await userEvent.click(exitBtn);
    expect(onExitAdmin).toHaveBeenCalledTimes(1);

    rerender(
      <TopHeader
        {...props}
        viewMode="lobby"
        isGameCreator={true}
        onOpenAdminTools={onOpenAdminTools}
        onToggleAdminOverride={onToggleAdminOverride}
        onResolveTurn={onResolveTurn}
        onExitAdmin={onExitAdmin}
      />,
    );
    expect(
      screen.queryByTestId('game-settings-trigger'),
    ).not.toBeInTheDocument();
  });

  it('offers a guest sign-in inside the icon-only dropdown', async () => {
    const { props } = renderHeader();
    const trigger = screen.getByTestId('account-menu-trigger');
    expect(trigger).toHaveTextContent('');
    expect(trigger).toHaveAttribute('aria-label', 'Guest menu');
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign In / Register' }),
    );
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('shows the signed-in player details and signs them out from the icon-only dropdown', async () => {
    const onOpenAccount = vi.fn();
    const { props } = renderHeader({ authUser: ALICE, onOpenAccount });
    const trigger = screen.getByTestId('account-menu-trigger');
    expect(trigger).toHaveTextContent('');
    expect(trigger).toHaveAttribute(
      'aria-label',
      'Account and settings menu (Alice)',
    );
    await userEvent.click(trigger);
    expect(screen.getByTestId('account-menu-email')).toHaveTextContent(
      'alice@example.test',
    );
    expect(
      screen.queryByTestId('account-menu-edit-username'),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('account-menu-account-settings'));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    expect(props.onSignIn).not.toHaveBeenCalled();
  });

  it('triggers Surrender from Game Settings in multiplayer', async () => {
    const onSurrenderClick = vi.fn();
    renderHeader({
      viewMode: 'multiplayer',
      matchSummary: MATCH,
      onSurrenderClick,
    });
    await userEvent.click(screen.getByTestId('game-settings-trigger'));
    await userEvent.click(screen.getByTestId('game-settings-surrender'));
    expect(onSurrenderClick).toHaveBeenCalledTimes(1);
  });
});
