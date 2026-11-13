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
    wsConnected: true,
    gameId: 'proto_1901',
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
    expect(tab).toHaveClass('nav-tab-btn', 'active');
    await userEvent.click(tab);
    expect(props.onEnterSoloSandbox).toHaveBeenCalledTimes(1);
  });

  it('leaves the sandbox tab unmarked elsewhere', () => {
    renderHeader({ viewMode: 'lobby' });
    expect(screen.getByTestId('nav-tab-sandbox')).not.toHaveClass('active');
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
    expect(
      document.querySelector('.nav-active-match-pill'),
    ).not.toBeInTheDocument();
  });
});

describe('TopHeader: the turn and order check', () => {
  it('shows the turn on a board', () => {
    renderHeader({ turn: { season: 'Fall', year: 1903, phase: 'Retreats' } });
    const pill = screen.getByTestId('turn-chronicle-pill');
    expect(pill).toHaveTextContent('FALL 1903•RETREATS PHASE');
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

  it('says the moves are valid with no problems', () => {
    renderHeader();
    expect(screen.getByText('Valid Moves')).toBeInTheDocument();
  });

  it('counts errors and warnings, and opens the order check', async () => {
    const { props } = renderHeader({ errorCount: 2, warningCount: 1 });
    const pill = screen.getByText('Error: 2 • Warning: 1');
    expect(pill.closest('div')).toHaveClass('header-error-pill');
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
    expect(pill.closest('div')).toHaveClass('header-warning-pill');
    await userEvent.click(pill);
    expect(props.onOpenOrderCheck).toHaveBeenCalledTimes(1);
  });
});

describe('TopHeader: live sync, display settings and account', () => {
  it('shows a live connection to the game', () => {
    renderHeader();
    const badge = screen.getByText('Live Sync').parentElement;
    expect(badge).toHaveClass('header-ws-badge', 'ws-connected');
    expect(badge).toHaveAttribute(
      'title',
      'Real-time synchronization connected (proto_1901)',
    );
    expect(badge?.querySelector('.ws-status-dot')).toHaveClass('dot-online');
  });

  it('names the lobby feed in the lobby', () => {
    renderHeader({ viewMode: 'lobby' });
    expect(screen.getByText('Live Sync').parentElement).toHaveAttribute(
      'title',
      'Real-time synchronization connected (Lobby Feed)',
    );
  });

  it('shows a connection still being made', () => {
    renderHeader({ wsConnected: false });
    const badge = screen.getByText('Connecting...').parentElement;
    expect(badge).toHaveClass('ws-disconnected');
    expect(badge).toHaveAttribute(
      'title',
      'Connecting to real-time synchronization...',
    );
    expect(badge?.querySelector('.ws-status-dot')).toHaveClass('dot-offline');
  });

  it('includes the display settings menu', () => {
    renderHeader();
    expect(
      screen.getByRole('button', { name: 'Display settings' }),
    ).toBeInTheDocument();
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
