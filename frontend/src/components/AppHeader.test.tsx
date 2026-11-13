// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, MultiplayerGameSummary } from '../types/diplomacy';
import { AppHeader, type AppHeaderProps } from './AppHeader';

const seen = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock('./CompactTopBar', () => ({
  CompactTopBar: (p: any) => {
    seen.compact = p;
    return <nav>compact bar</nav>;
  },
}));
vi.mock('./TopHeader', () => ({
  TopHeader: (p: any) => {
    seen.wide = p;
    return <header>top header</header>;
  },
}));

const STATE = {
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
  winner: null,
  issues: [
    { power: 'FRANCE', severity: 'error' },
    { power: 'FRANCE', severity: 'warning' },
    { power: 'FRANCE', severity: 'warning' },
    { power: 'GERMANY', severity: 'error' },
    { power: 'FRANCE', severity: 'info' },
  ],
} as unknown as GameState;
const MATCH = { name: 'Friday Night' } as MultiplayerGameSummary;

function props(over: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    viewMode: 'multiplayer',
    isCompact: false,
    gameState: STATE,
    activeGameId: 'mp_1',
    activeGameSummary: MATCH,
    playerPower: 'FRANCE',
    wsConnected: true,
    displayPrefs: { pieceStyle: 'classic', unitMark: 'letters' } as any,
    displayPrefsSaveState: 'device',
    updateDisplayPrefs: vi.fn(),
    authUser: null,
    openAuthPrompt: vi.fn(),
    handleSignOut: vi.fn(),
    handleBackToLobby: vi.fn(),
    handleEnterSoloSandbox: vi.fn(),
    handleFinalizeClick: vi.fn(),
    toolsDrawerOpen: false,
    setToolsDrawerOpen: vi.fn(),
    toolsToggleRef: { current: null },
    directEditActive: false,
    openAdminTools: vi.fn(),
    onToggleDirectEdit: vi.fn(),
    toastBanner: null,
    ...over,
  };
}

beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
});

describe('AppHeader: the top bar', () => {
  it("gives the desktop header the board and the player's own problems", () => {
    const p = props();
    render(<AppHeader {...p} />);
    expect(screen.getByText('top header')).toBeInTheDocument();
    expect(seen.compact).toBeUndefined();
    const h = seen.wide;
    expect(h.viewMode).toBe('multiplayer');
    expect(h.turn).toBe(STATE);
    expect(h.winner).toBeNull();
    expect(h.errorCount).toBe(1);
    expect(h.warningCount).toBe(2);
    expect(h.matchSummary).toBe(MATCH);
    expect(h.playerPower).toBe('FRANCE');
    expect(h.onBackToLobby).toBe(p.handleBackToLobby);
    expect(h.onEnterSoloSandbox).toBe(p.handleEnterSoloSandbox);
    expect(h.onChangeDisplayPrefs).toBe(p.updateDisplayPrefs);
    expect(h.onSignOut).toBe(p.handleSignOut);
    h.onOpenOrderCheck();
    expect(p.handleFinalizeClick).toHaveBeenCalledWith(false);
    h.onSignIn();
    expect(p.openAuthPrompt).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('gives a phone the one-row bar, with the match label and the tools toggle', () => {
    const p = props({ isCompact: true, toolsDrawerOpen: true });
    render(<AppHeader {...p} />);
    expect(screen.getByText('compact bar')).toBeInTheDocument();
    expect(seen.wide).toBeUndefined();
    const c = seen.compact;
    expect(c.turn).toBe(STATE);
    expect(c.errorCount).toBe(1);
    expect(c.warningCount).toBe(2);
    expect(c.syncDetail).toBe('Game mp_1');
    expect(c.matchLabel).toBe('Friday Night (France)');
    expect(c.toolsOpen).toBe(true);
    expect(c.toolsToggleRef).toBe(p.toolsToggleRef);
    c.onToggleTools();
    const update = vi.mocked(p.setToolsDrawerOpen).mock.calls[0][0] as (
      open: boolean,
    ) => boolean;
    expect(update(false)).toBe(true);
    expect(update(true)).toBe(false);
    c.onOpenOrderCheck();
    expect(p.handleFinalizeClick).toHaveBeenCalledWith(false);
    c.onSignIn();
    expect(p.openAuthPrompt).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('shows the phone no turn and no match name in the lobby or a sandbox', () => {
    render(<AppHeader {...props({ isCompact: true, viewMode: 'lobby' })} />);
    expect(seen.compact.turn).toBeNull();
    expect(seen.compact.syncDetail).toBe('Lobby feed');
    expect(seen.compact.matchLabel).toBeNull();
    render(<AppHeader {...props({ isCompact: true, viewMode: 'sandbox' })} />);
    expect(seen.compact.turn).toBe(STATE);
    expect(seen.compact.matchLabel).toBeNull();
    render(
      <AppHeader {...props({ isCompact: true, activeGameSummary: null })} />,
    );
    expect(seen.compact.matchLabel).toBeNull();
  });

  it('passes the winner and turn history props on', () => {
    const won = { ...STATE, winner: 'ITALY' } as GameState;
    const onSelectHistoryTurn = vi.fn();
    const onStepHistoryTurn = vi.fn();
    const onSelectHistoryPower = vi.fn();
    const historyEntries = [
      { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
    ];
    render(
      <AppHeader
        {...props({
          gameState: won,
          historyEntries,
          historyViewIndex: 0,
          historyPower: 'FRANCE',
          onSelectHistoryTurn,
          onStepHistoryTurn,
          onSelectHistoryPower,
        })}
      />,
    );
    expect(seen.wide.winner).toBe('ITALY');
    expect(seen.wide.historyEntries).toBe(historyEntries);
    expect(seen.wide.historyViewIndex).toBe(0);
    expect(seen.wide.historyPower).toBe('FRANCE');
    expect(seen.wide.onSelectHistoryTurn).toBe(onSelectHistoryTurn);
    expect(seen.wide.onStepHistoryTurn).toBe(onStepHistoryTurn);
    expect(seen.wide.onSelectHistoryPower).toBe(onSelectHistoryPower);
    render(<AppHeader {...props({ gameState: won, isCompact: true })} />);
    expect(seen.compact.winner).toBe('ITALY');
  });
});

describe('AppHeader: the toast and no red Direct-Edit banner', () => {
  it('shows no banner or toast by default, and never renders a red Direct-Edit banner when directEditActive is true', () => {
    const { container, rerender } = render(<AppHeader {...props()} />);
    expect(container.querySelector('.admin-override-banner')).toBeNull();
    expect(container.querySelector('.imperial-toast-banner')).toBeNull();

    rerender(<AppHeader {...props({ directEditActive: true })} />);
    expect(container.querySelector('.admin-override-banner')).toBeNull();
  });

  it('shows the toast after the header', () => {
    const { container } = render(
      <AppHeader {...props({ toastBanner: 'Left campaign.' })} />,
    );
    const toast = container.querySelector('.imperial-toast-banner');
    expect(toast).toHaveTextContent('Left campaign.');
    expect(container.lastElementChild).toBe(toast);
    expect(container.firstElementChild?.textContent).toBe('top header');
  });
});
