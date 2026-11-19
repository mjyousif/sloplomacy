// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState, MultiplayerGameSummary } from '../types/diplomacy';
import { AppHeader, type AppHeaderProps } from './AppHeader';

const seen = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock('./header/CompactTopBar', () => ({
  CompactTopBar: (p: any) => {
    seen.compact = p;
    return <nav>compact bar</nav>;
  },
}));
vi.mock('./header/TopHeader', () => ({
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
  surrendered_powers: [],
  issues: [],
} as unknown as GameState;
const MATCH = {
  game_id: 'mp_1',
  name: 'Friday Night',
  status: 'active',
  participants: {
    FRANCE: {
      user_id: 'user-alice',
      email: 'alice@example.test',
      display_name: 'Alice',
      power: 'FRANCE',
      joined_at: '2026-11-01T00:00:00Z',
    },
  },
} as unknown as MultiplayerGameSummary;

function props(over: Partial<AppHeaderProps> = {}): AppHeaderProps {
  return {
    viewMode: 'multiplayer',
    isCompact: false,
    gameState: STATE,
    activeGameId: 'mp_1',
    activeGameSummary: MATCH,
    playerPower: 'FRANCE',
    displayPrefs: { pieceStyle: 'classic', unitMark: 'letters' } as any,
    displayPrefsSaveState: 'device',
    updateDisplayPrefs: vi.fn(),
    authUser: null,
    openAuthPrompt: vi.fn(),
    handleSignOut: vi.fn(),
    handleBackToLobby: vi.fn(),
    handleEnterSoloSandbox: vi.fn(),
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
  it('gives the desktop header the shared board, history, and menu props', () => {
    const p = props();
    render(<AppHeader {...p} />);
    expect(screen.getByText('top header')).toBeInTheDocument();
    expect(seen.compact).toBeUndefined();
    const h = seen.wide;
    expect(h.viewMode).toBe('multiplayer');
    expect(h.turn).toBe(STATE);
    expect(h.winner).toBeNull();
    expect(h.matchSummary).toBe(MATCH);
    expect(h.playerPower).toBe('FRANCE');
    expect(h.onBackToLobby).toBe(p.handleBackToLobby);
    expect(h.onEnterSoloSandbox).toBe(p.handleEnterSoloSandbox);
    expect(h.activeGameId).toBe('mp_1');
    expect(h.myGames).toEqual([]);
    expect(h.onChangeDisplayPrefs).toBe(p.updateDisplayPrefs);
    expect(h.onSignOut).toBe(p.handleSignOut);
    h.onSignIn();
    expect(p.openAuthPrompt).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('gives the phone header the exact same shared header props plus the drawer toggle', () => {
    const onSaveSandbox = vi.fn();
    const onResetSandbox = vi.fn();
    const onDeleteSandbox = vi.fn();
    const onReturnToPreviousGame = vi.fn();
    const onSwitchToSoloSandbox = vi.fn();
    const onSelectGame = vi.fn();
    const onSelectHistoryTurn = vi.fn();
    const onStepHistoryTurn = vi.fn();
    const historyEntries = [
      { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
    ];
    const p = props({
      isCompact: true,
      toolsDrawerOpen: true,
      playerPower: 'GERMANY',
      lockedPower: 'FRANCE',
      authUser: {
        id: 'user-alice',
        email: 'alice@example.test',
        displayName: 'Alice',
      },
      games: [MATCH],
      onSaveSandbox,
      onResetSandbox,
      onDeleteSandbox,
      onReturnToPreviousGame,
      onSwitchToSoloSandbox,
      onSelectGame,
      historyEntries,
      historyViewIndex: 0,
      historyLocked: true,
      onSelectHistoryTurn,
      onStepHistoryTurn,
    });
    render(<AppHeader {...p} />);
    expect(screen.getByText('compact bar')).toBeInTheDocument();
    expect(seen.wide).toBeUndefined();
    const c = seen.compact;
    expect(c.turn).toBe(STATE);
    expect(c.matchSummary).toBe(MATCH);
    expect(c.activeGameId).toBe('mp_1');
    expect(c.myGames).toEqual([MATCH]);
    expect(c.playerPower).toBe('FRANCE');
    expect(c.onSaveSandbox).toBe(onSaveSandbox);
    expect(c.onResetSandbox).toBe(onResetSandbox);
    expect(c.onDeleteSandbox).toBe(onDeleteSandbox);
    expect(c.onReturnToPreviousGame).toBe(onReturnToPreviousGame);
    expect(c.onSwitchToSoloSandbox).toBe(onSwitchToSoloSandbox);
    expect(c.onSelectGame).toBe(onSelectGame);
    expect(c.historyEntries).toBe(historyEntries);
    expect(c.historyViewIndex).toBe(0);
    expect(c.historyLocked).toBe(true);
    expect(c.onSelectHistoryTurn).toBe(onSelectHistoryTurn);
    expect(c.onStepHistoryTurn).toBe(onStepHistoryTurn);
    expect(c.toolsOpen).toBe(true);
    expect(c.toolsToggleRef).toBe(p.toolsToggleRef);
    c.onToggleTools();
    const update = vi.mocked(p.setToolsDrawerOpen).mock.calls[0][0] as (
      open: boolean,
    ) => boolean;
    expect(update(false)).toBe(true);
    expect(update(true)).toBe(false);
    c.onSignIn();
    expect(p.openAuthPrompt).toHaveBeenCalledWith(undefined, 'signin');
  });

  it('passes the winner and turn history props to both desktop and phone headers', () => {
    const won = { ...STATE, winner: 'ITALY' } as GameState;
    const onSelectHistoryTurn = vi.fn();
    const onStepHistoryTurn = vi.fn();
    const historyEntries = [
      { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
    ];
    render(
      <AppHeader
        {...props({
          gameState: won,
          historyEntries,
          historyViewIndex: 0,
          onSelectHistoryTurn,
          onStepHistoryTurn,
        })}
      />,
    );
    expect(seen.wide.winner).toBe('ITALY');
    expect(seen.wide.historyEntries).toBe(historyEntries);
    expect(seen.wide.historyViewIndex).toBe(0);
    expect(seen.wide.onSelectHistoryTurn).toBe(onSelectHistoryTurn);
    expect(seen.wide.onStepHistoryTurn).toBe(onStepHistoryTurn);

    render(
      <AppHeader
        {...props({
          gameState: won,
          isCompact: true,
          historyEntries,
          historyViewIndex: 0,
          onSelectHistoryTurn,
          onStepHistoryTurn,
        })}
      />,
    );
    expect(seen.compact.winner).toBe('ITALY');
    expect(seen.compact.historyEntries).toBe(historyEntries);
    expect(seen.compact.historyViewIndex).toBe(0);
    expect(seen.compact.onSelectHistoryTurn).toBe(onSelectHistoryTurn);
    expect(seen.compact.onStepHistoryTurn).toBe(onStepHistoryTurn);
  });

  it('wires onSurrenderClick only for a live non-surrendered multiplayer seat and prefers lockedPower for flag', () => {
    const onOpenSurrenderModal = vi.fn();
    render(
      <AppHeader
        {...props({
          playerPower: 'GERMANY',
          lockedPower: 'FRANCE',
          onOpenSurrenderModal,
        })}
      />,
    );
    expect(seen.wide.playerPower).toBe('FRANCE');
    expect(seen.wide.isSurrendered).toBe(false);
    seen.wide.onSurrenderClick();
    expect(onOpenSurrenderModal).toHaveBeenCalledWith(MATCH, 'FRANCE');

    const surrendered = {
      ...STATE,
      surrendered_powers: ['FRANCE'],
    } as unknown as GameState;
    render(
      <AppHeader
        {...props({
          gameState: surrendered,
          lockedPower: 'FRANCE',
          onOpenSurrenderModal,
        })}
      />,
    );
    expect(seen.wide.isSurrendered).toBe(true);
    expect(seen.wide.onSurrenderClick).toBeUndefined();
  });
});

describe('AppHeader: the toast and no red Direct-Edit banner', () => {
  it('shows no banner or toast by default, and never renders a red Direct-Edit banner when directEditActive is true', () => {
    render(<AppHeader {...props()} />);
    expect(screen.queryByText(/Direct-Edit Mode Active/i)).toBeNull();
    expect(screen.queryByTestId('toast-banner')).toBeNull();

    render(<AppHeader {...props({ directEditActive: true })} />);
    expect(screen.queryByText(/Direct-Edit Mode Active/i)).toBeNull();
  });

  it('shows the toast after the header', () => {
    const { container } = render(
      <AppHeader {...props({ toastBanner: 'Left campaign.' })} />,
    );
    const toast = screen.getByTestId('toast-banner');
    expect(toast).toHaveTextContent('Left campaign.');
    expect(container.lastElementChild).toBe(toast);
    expect(container.firstElementChild?.textContent).toBe('top header');
  });
});
