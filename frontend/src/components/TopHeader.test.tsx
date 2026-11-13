// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../types/diplomacy';
import { DEFAULT_DISPLAY_PREFS } from '../utils/displayPrefs';
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
    errorCount: 0,
    warningCount: 0,
    onOpenOrderCheck: vi.fn(),
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

  it('opens the solo sandbox and marks it while in one', async () => {
    const { props } = renderHeader();
    const tab = screen.getByTestId('nav-tab-sandbox');
    expect(tab).toHaveAttribute('data-active', 'true');
    await userEvent.click(tab);
    expect(props.onEnterSoloSandbox).toHaveBeenCalledTimes(1);
  });

  it('leaves the sandbox tab unmarked elsewhere', () => {
    renderHeader({ viewMode: 'lobby' });
    expect(screen.getByTestId('nav-tab-sandbox')).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  it('names the match and the player’s power in multiplayer', () => {
    renderHeader({ viewMode: 'multiplayer', matchSummary: MATCH });
    expect(screen.getByText('Friday Night (France)')).toBeInTheDocument();
  });

  it('names no match outside multiplayer or before it loads', () => {
    const { rerender, props } = renderHeader({ matchSummary: MATCH });
    expect(screen.queryByText(/Friday Night/)).not.toBeInTheDocument();
    rerender(
      <TopHeader {...props} viewMode="multiplayer" matchSummary={null} />,
    );
    expect(screen.queryByTestId('nav-match-pill')).not.toBeInTheDocument();
  });
});

describe('TopHeader: the turn and order check', () => {
  it('shows the turn on a board', () => {
    renderHeader({ turn: { season: 'Fall', year: 1903, phase: 'Retreats' } });
    const pill = screen.getByTestId('turn-chronicle-pill');
    expect(pill).toHaveTextContent('Fall 1903 Retreats');
  });

  it('hides the board readout in the lobby', () => {
    renderHeader({ viewMode: 'lobby', winner: 'ENGLAND', errorCount: 2 });
    expect(screen.queryByTestId('turn-chronicle-pill')).not.toBeInTheDocument();
    expect(screen.queryByText(/WINS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
  });

  it('announces the winner', () => {
    renderHeader({ winner: 'ENGLAND' });
    expect(screen.getByText('ENGLAND WINS')).toBeInTheDocument();
  });

  it('shows no status pill when there are no errors or warnings', () => {
    renderHeader();
    expect(screen.queryByText('Valid Moves')).not.toBeInTheDocument();
    expect(screen.queryByText(/Error/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Warning/)).not.toBeInTheDocument();
  });

  it('counts errors and warnings, and opens the order check', async () => {
    const { props } = renderHeader({ errorCount: 2, warningCount: 1 });
    const pill = screen.getByText('Error: 2 • Warning: 1');
    expect(pill.closest('div')).toBe(screen.getByTestId('header-error-pill'));
    await userEvent.click(pill);
    expect(props.onOpenOrderCheck).toHaveBeenCalledTimes(1);
  });

  it('counts errors alone without a warning tail', () => {
    renderHeader({ errorCount: 1 });
    expect(screen.getByText('Error: 1')).toBeInTheDocument();
  });

  it('shows a single warning', () => {
    renderHeader({ warningCount: 1 });
    expect(screen.getByText('Warning: 1')).toBeInTheDocument();
    expect(screen.queryByText('Valid Moves')).not.toBeInTheDocument();
  });

  it('shows warnings alone, which also open the order check', async () => {
    const { props } = renderHeader({ warningCount: 3 });
    const pill = screen.getByText('Warning: 3');
    expect(pill.closest('div')).toBe(screen.getByTestId('header-warning-pill'));
    await userEvent.click(pill);
    expect(props.onOpenOrderCheck).toHaveBeenCalledTimes(1);
  });

  it('shows unified turn history controls when resolved turns exist', async () => {
    const onStepHistoryTurn = vi.fn();
    const onSelectHistoryTurn = vi.fn();
    const onSelectHistoryPower = vi.fn();
    renderHeader({
      turn: { season: 'Fall', year: 1901, phase: 'Movement' },
      historyEntries: [
        { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
      ],
      historyViewIndex: 0,
      historyPower: 'FRANCE',
      onStepHistoryTurn,
      onSelectHistoryTurn,
      onSelectHistoryPower,
    });
    expect(screen.getByTestId('turn-history')).toBeInTheDocument();
    expect(screen.getByTestId('turn-chronicle-pill')).toHaveClass(
      'viewing-past',
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
    expect(screen.getByTestId('turn-history-filter-toggle')).toBeDisabled();
  });
});

describe('TopHeader: display settings and account', () => {
  it('omits any Live Sync indicator', () => {
    renderHeader();
    expect(screen.queryByText('Live Sync')).not.toBeInTheDocument();
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
  });

  it('includes the display settings menu only outside the lobby', () => {
    const { rerender, props } = renderHeader();
    expect(
      screen.getByRole('button', { name: 'Display settings' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('btn-admin-menu')).not.toBeInTheDocument();

    rerender(<TopHeader {...props} viewMode="lobby" />);
    expect(
      screen.queryByRole('button', { name: 'Display settings' }),
    ).not.toBeInTheDocument();
  });

  it('shows the administrator dropdown next to display settings only for the game creator outside the lobby', async () => {
    const onOpenAdminTools = vi.fn();
    const onToggleAdminOverride = vi.fn();
    const onExitAdmin = vi.fn();
    const { rerender, props } = renderHeader({
      isGameCreator: true,
      onOpenAdminTools,
      onToggleAdminOverride,
      onExitAdmin,
    });

    const adminMenuBtn = screen.getByTestId('btn-admin-menu');
    expect(adminMenuBtn).toBeInTheDocument();
    await userEvent.click(adminMenuBtn);
    expect(screen.getByTestId('admin-settings-panel')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-direct-edit')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(
      screen
        .getByTestId('btn-toggle-direct-edit')
        .querySelector('.lucide-pencil'),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId('btn-open-admin-console')
        .querySelector('.lucide-clock'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('btn-exit-admin-mode')).toBeNull();

    await userEvent.click(screen.getByTestId('btn-toggle-direct-edit'));
    expect(onToggleAdminOverride).toHaveBeenCalledTimes(1);

    await userEvent.click(adminMenuBtn);
    await userEvent.click(screen.getByTestId('btn-open-admin-console'));
    expect(onOpenAdminTools).toHaveBeenCalledTimes(1);

    rerender(
      <TopHeader
        {...props}
        isGameCreator={true}
        adminOverrideActive={true}
        onOpenAdminTools={onOpenAdminTools}
        onToggleAdminOverride={onToggleAdminOverride}
        onExitAdmin={onExitAdmin}
      />,
    );
    await userEvent.click(screen.getByTestId('btn-admin-menu'));
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
        onExitAdmin={onExitAdmin}
      />,
    );
    expect(screen.queryByTestId('btn-admin-menu')).not.toBeInTheDocument();
  });

  it('offers a guest sign-in', async () => {
    const { props } = renderHeader();
    expect(screen.getByText('Guest Mode')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Sign In / Register' }),
    );
    expect(props.onSignIn).toHaveBeenCalledTimes(1);
    expect(props.onSignOut).not.toHaveBeenCalled();
  });

  it('names a signed-in player and signs them out', async () => {
    const onOpenAccount = vi.fn();
    const { props } = renderHeader({ authUser: ALICE, onOpenAccount });
    expect(screen.getByText('Alice').parentElement).toHaveAttribute(
      'title',
      'Account Settings (alice@example.test)',
    );
    expect(screen.queryByText('Guest Mode')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Alice' }));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    expect(props.onSignIn).not.toHaveBeenCalled();
  });
});
