// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnHistory } from '../hooks/useTurnHistory';
import type {
  GameState,
  MultiplayerGameSummary,
  TurnHistoryEntry,
  TurnRecord,
} from '../types/diplomacy';
import { GameWorkspace, type GameWorkspaceProps } from './GameWorkspace';

// Each child records the props it was last given, so the tests read the wiring directly.
const seen = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock('./ToolsSidebar', () => ({
  ToolsSidebar: (p: any) => {
    seen.tools = p;
    return <aside>{p.historyFooter}</aside>;
  },
}));
vi.mock('./EuropeMap', () => ({
  EuropeMap: (p: any) => {
    seen.map = p;
    return <section>{p.overlay}</section>;
  },
}));
vi.mock('./MacroSidebar', () => ({
  MacroSidebar: (p: any) => {
    seen.macro = p;
    return null;
  },
}));
vi.mock('./game/PhaseTimerWidget', () => ({
  PhaseTimerWidget: (p: any) => {
    seen.timer = p;
    return <i>timer</i>;
  },
}));

const LIVE = {
  season: 'Fall',
  year: 1902,
  phase: 'Movement',
  units: [
    { id: 'F1', power: 'FRANCE' },
    { id: 'G1', power: 'GERMANY' },
    { id: 'G2', power: 'GERMANY' },
    { id: 'G3', power: 'GERMANY' },
    { id: 'I1', power: 'ITALY' },
  ],
  orders: {
    F1: { order_type: 'MOVE' },
    G1: { order_type: 'MOVE' },
    G2: { order_type: 'HOLD', is_explicit: true },
    G3: { order_type: 'HOLD', is_explicit: false },
  },
  ownership: { PAR: 'FRANCE' },
  issues: [{ power: 'FRANCE' }],
  finalized_powers: ['ITALY'],
  surrendered_powers: [],
  builds: { FRANCE: 1 },
  retreats: { X: [] },
  unit_options: { F1: {} },
  winner: null,
} as unknown as GameState;
const PAST = {
  season: 'Spring',
  year: 1901,
  phase: 'Retreats',
  units: [{ id: 'P1' }],
  orders: { P1: {} },
  ownership: { MUN: 'GERMANY' },
  resolution: { results: [] },
} as unknown as TurnRecord;
const ENTRY = {
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
} as TurnHistoryEntry;

function history(over: Partial<TurnHistory> = {}): TurnHistory {
  return {
    entries: [ENTRY],
    viewIndex: null,
    turn: null,
    powers: [],
    actions: [],
    select: vi.fn(),
    step: vi.fn(),
    setPowers: vi.fn(),
    setActions: vi.fn(),
    goLive: vi.fn(),
    ...over,
  };
}

function props(over: Partial<GameWorkspaceProps> = {}): GameWorkspaceProps {
  return {
    viewMode: 'multiplayer',
    isCompact: false,
    gameState: LIVE,
    provinces: {},
    activeGameSummary: {
      status: 'active',
      participants: [],
    } as unknown as MultiplayerGameSummary,
    playerPower: 'FRANCE',
    lockedPower: 'FRANCE',
    leftSidebarCollapsed: false,
    setLeftSidebarCollapsed: vi.fn(),
    rightSidebarCollapsed: true,
    setRightSidebarCollapsed: vi.fn(),
    sheetSnap: 'peek',
    setSheetSnap: vi.fn(),
    toolsDrawerOpen: false,
    closeToolsDrawer: vi.fn(),
    handleDockedBarChange: vi.fn(),
    turnHistory: history(),
    historyTurn: null,
    viewedEntry: null,
    mapRef: { current: { stepZoom: vi.fn(), resetCamera: vi.fn() } as any },
    zoomPercent: 120,
    setZoomPercent: vi.fn(),
    displayPrefs: { pieceStyle: 'classic', unitMark: 'letters' } as any,
    selectedUnitId: 'F1',
    setSelectedUnitId: vi.fn(),
    hoveredUnitId: 'G1',
    setHoveredUnitId: vi.fn(),
    highlightedProvinces: ['BUR'],
    setHighlightedProvinces: vi.fn(),
    simulationResult: null,
    sandboxMode: false,
    sandboxGameId: null,
    showSimulationOverlay: false,
    setShowSimulationOverlay: vi.fn(),
    matchTimer: null,
    handleToggleSandboxMode: vi.fn(),
    handleClearForeignPreMoves: vi.fn(),
    handleLoadScenario: vi.fn(),
    handleOpenSaveSandboxModal: vi.fn(),
    handleUpdateOrder: vi.fn(),
    handleClearAllOrders: vi.fn(),
    handleFinalizeClick: vi.fn(),
    handleUnfinalizeClick: vi.fn(),
    handleAdjudicateTurn: vi.fn(),
    postTimerAction: vi.fn(),
    handleTimerExpired: vi.fn(),
    handleSelectPower: vi.fn(),
    isGameCreator: false,
    directEditActive: false,
    ...over,
  };
}

/** Runs a functional state update the way React would, on `prev`. */
function applied(setter: any, prev: unknown) {
  return setter.mock.calls[0][0](prev);
}

beforeEach(() => {
  for (const k of Object.keys(seen)) delete seen[k];
});

describe('GameWorkspace: the live turn', () => {
  it('lays out the tools, map and orders in the workspace', () => {
    const { container } = render(<GameWorkspace {...props()} />);
    expect(container.firstElementChild).toHaveAttribute(
      'data-testid',
      'game-workspace',
    );
    expect(container.firstElementChild?.tagName).toBe('MAIN');
    expect(seen.tools.variant).toBe('panel');
    expect(seen.macro.variant).toBe('panel');
  });

  it('tells the map which sidebars are collapsed, so its overlays keep clear of them', () => {
    const { getByTestId } = render(<GameWorkspace {...props()} />);
    const main = getByTestId('game-workspace');
    expect(main).not.toHaveAttribute('data-left-collapsed');
    expect(main).toHaveAttribute('data-right-collapsed', 'true');
  });

  it('puts the drawer and the sheet on a phone', () => {
    const p = props({ isCompact: true });
    render(<GameWorkspace {...p} />);
    expect(seen.tools.variant).toBe('drawer');
    expect(seen.macro.variant).toBe('sheet');
    expect(seen.map.compact).toBe(true);
    expect(seen.tools.historyFooter).toBeUndefined();
  });

  it('draws the live board with the selection and its issues', () => {
    const p = props();
    render(<GameWorkspace {...p} />);
    const m = seen.map;
    expect(m.units).toBe(LIVE.units);
    expect(m.orders).toBe(LIVE.orders);
    expect(m.ownership).toBe(LIVE.ownership);
    expect(m.selectedUnitId).toBe('F1');
    expect(m.hoveredUnitId).toBe('G1');
    expect(m.highlightedProvinces).toBe(p.highlightedProvinces);
    expect(m.issues).toBe(LIVE.issues);
    expect(m.suppressUnitMenu).toBe(false);
    expect(m.onHoverUnit).toBe(p.setHoveredUnitId);
    expect(m.onUpdateOrder).toBe(p.handleUpdateOrder);
    expect(m.historyView).toBe(false);
    expect(m.showSimulationOverlay).toBe(false);
    expect(m.phase).toBe('Movement');
    expect(m.season).toBe('Fall');
    expect(m.builds).toBe(LIVE.builds);
    expect(m.retreats).toBe(LIVE.retreats);
    expect(m.unitOptions).toBe(LIVE.unit_options);
    expect(m.pieceStyle).toBe('classic');
    expect(m.unitMark).toBe('letters');
  });

  it('shows no map menu for a unit picked on the sidebar, but does for one picked on the map', () => {
    const p = props();
    render(<GameWorkspace {...p} />);
    act(() => seen.macro.onSelectUnit('F1'));
    expect(p.setSelectedUnitId).toHaveBeenLastCalledWith('F1');
    expect(seen.map.suppressUnitMenu).toBe(true);
    // The map clicking the same unit again brings its menu up.
    act(() => seen.map.onSelectUnit('F1'));
    expect(p.setSelectedUnitId).toHaveBeenLastCalledWith('F1');
    expect(seen.map.suppressUnitMenu).toBe(false);
  });

  it("counts other powers' changed orders: any move, or an explicit hold", () => {
    render(<GameWorkspace {...props()} />);
    expect(seen.tools.foreignModifiedOrdersCount).toBe(2);
  });

  it('wires the zoom buttons to the map camera', () => {
    const p = props();
    render(<GameWorkspace {...p} />);
    seen.tools.onZoomIn();
    seen.tools.onZoomOut();
    seen.tools.onResetCamera();
    const cam = p.mapRef.current as any;
    expect(cam.stepZoom.mock.calls).toEqual([[0.2], [-0.2]]);
    expect(cam.resetCamera).toHaveBeenCalledTimes(1);
    expect(seen.tools.zoomPercent).toBe(120);
    expect(seen.map.onZoomChange).toBe(p.setZoomPercent);
  });

  it('flips the rails and passes directEditActive down', () => {
    const p = props({ directEditActive: true });
    render(<GameWorkspace {...p} />);
    seen.tools.onToggleCollapse();
    seen.macro.onToggleCollapse();
    expect(applied(p.setLeftSidebarCollapsed, false)).toBe(true);
    expect(applied(p.setRightSidebarCollapsed, true)).toBe(false);
    expect(seen.tools.adminOverrideActive).toBe(true);
    expect(seen.map.directEditActive).toBe(true);
  });

  it('toggles sandbox map move visibility from ToolsSidebar down to EuropeMap', () => {
    render(<GameWorkspace {...props({ viewMode: 'sandbox' })} />);
    expect(seen.tools.showAllMoves).toBe(true);
    expect(seen.map.showAllMoves).toBe(true);
    act(() => seen.tools.onChangeShowAllMoves(false));
    expect(seen.tools.showAllMoves).toBe(false);
    expect(seen.map.showAllMoves).toBe(false);
  });

  it('finalizes without forcing and omits surrender from the order sidebar', () => {
    const p = props();
    render(<GameWorkspace {...p} />);
    seen.macro.onFinalizeClick();
    expect(p.handleFinalizeClick).toHaveBeenCalledWith(false);
    expect(seen.macro.onSurrenderClick).toBeUndefined();
  });

  it('marks a match as multiplayer, and a sandbox as not', () => {
    render(<GameWorkspace {...props()} />);
    expect(seen.tools.isMultiplayer).toBe(true);
    expect(seen.macro.isMultiplayer).toBe(true);
    render(<GameWorkspace {...props({ viewMode: 'sandbox' })} />);
    expect(seen.tools.isMultiplayer).toBe(false);
    expect(seen.macro.isMultiplayer).toBe(false);
    expect(seen.macro.gameOver).toBe(false);
  });

  it('closes the simulation overlay from the map', () => {
    const p = props();
    render(<GameWorkspace {...p} />);
    seen.map.onClearSimulationOverlay();
    expect(p.setShowSimulationOverlay).toHaveBeenCalledWith(false);
  });
});

describe('GameWorkspace: the turn clock', () => {
  it('shows the clock in an active match and sends its buttons', () => {
    // The seat, not the power on show, votes.
    const p = props({
      isGameCreator: true,
      sandboxGameId: 'sbx_1',
      playerPower: 'ENGLAND',
    });
    const { getByText } = render(<GameWorkspace {...p} />);
    expect(getByText('timer')).toBeInTheDocument();
    expect(seen.timer.seatPower).toBe('FRANCE');
    expect(seen.timer.isHost).toBe(true);
    expect(seen.timer.hypothetical).toBe(true);
    expect(seen.timer.onExpire).toBe(p.handleTimerExpired);
    seen.timer.onStart();
    seen.timer.onVote('pause');
    seen.timer.onExtend(true);
    seen.timer.onReady(false);
    expect(vi.mocked(p.postTimerAction).mock.calls).toEqual([
      ['start'],
      ['vote', { power: 'FRANCE', choice: 'pause' }],
      ['extend', { power: 'FRANCE', active: true }],
      ['ready', { power: 'FRANCE', active: false }],
    ]);
  });

  it('hides the clock in a sandbox, a lobby that has not started, or a won game', () => {
    const cases = [
      props({ viewMode: 'sandbox' }),
      props({
        activeGameSummary: { status: 'waiting' } as MultiplayerGameSummary,
      }),
      props({ activeGameSummary: null }),
      props({ gameState: { ...LIVE, winner: 'FRANCE' } as GameState }),
    ];
    for (const p of cases) {
      const { queryByText, unmount } = render(<GameWorkspace {...p} />);
      expect(queryByText('timer')).toBeNull();
      unmount();
    }
  });
});

describe('GameWorkspace: a past turn', () => {
  it('draws the past turn with nothing on it selectable', () => {
    const p = props({ historyTurn: PAST, showSimulationOverlay: false });
    render(<GameWorkspace {...p} />);
    const m = seen.map;
    expect(m.units).toBe(PAST.units);
    expect(m.orders).toBe(PAST.orders);
    expect(m.ownership).toBe(PAST.ownership);
    expect(m.phase).toBe('Retreats');
    expect(m.season).toBe('Spring');
    expect(m.builds).toBeNull();
    expect(m.retreats).toBeNull();
    expect(m.unitOptions).toBeNull();
    expect(m.selectedUnitId).toBeNull();
    expect(m.hoveredUnitId).toBeNull();
    expect(m.highlightedProvinces).toEqual([]);
    expect(m.issues).toEqual([]);
    expect(m.simulationResult).toBe(PAST.resolution);
    expect(m.showSimulationOverlay).toBe(true);
    expect(m.historyView).toBe(true);
    for (const cb of ['onSelectUnit', 'onHoverUnit', 'onUpdateOrder']) {
      expect(m[cb]).not.toBe(p.setSelectedUnitId);
      m[cb]('F1');
    }
    expect(p.setSelectedUnitId).not.toHaveBeenCalled();
    expect(p.setHoveredUnitId).not.toHaveBeenCalled();
    expect(p.handleUpdateOrder).not.toHaveBeenCalled();
    // The right sidebar still shows the live orders; the left scoreboard tracks the past turn.
    expect(seen.macro.units).toBe(LIVE.units);
    expect(seen.macro.selectedUnitId).toBe('F1');
    expect(seen.tools.units).toBe(PAST.units);
    expect(seen.tools.ownership).toEqual({});
    expect(seen.tools.viewingHistory).toBe(true);
    expect(seen.tools.finalizedPowers).toEqual([]);
    expect(seen.tools.surrenderedPowers).toEqual([]);
    expect(seen.tools.issues).toEqual([]);
  });

  it('syncs the left standings scoreboard SC counts, units, and ranks to the viewed turn', () => {
    const provinces = {
      PAR: { is_supply_center: true },
      MUN: { is_supply_center: true },
      BEL: { is_supply_center: true },
    } as any;
    const p = props({
      provinces,
      historyTurn: {
        ...PAST,
        ownership: { MUN: 'GERMANY', BEL: 'GERMANY' },
        units: [{ id: 'G_M', power: 'GERMANY' } as any],
      },
    });
    const { rerender } = render(<GameWorkspace {...p} />);
    expect(seen.tools.ownership).toEqual({ MUN: 'GERMANY', BEL: 'GERMANY' });
    expect(seen.tools.units).toEqual([{ id: 'G_M', power: 'GERMANY' }]);
    expect(seen.tools.finalizedPowers).toEqual([]);
    expect(seen.tools.issues).toEqual([]);

    // Admin history snapshots use the post-edit ownership and units on the scoreboard.
    rerender(
      <GameWorkspace
        {...props({
          provinces,
          historyTurn: {
            ...PAST,
            phase: 'Admin',
            resolution: {
              resolutions: {},
              summary: [],
              new_units: [{ id: 'F_B', power: 'FRANCE' } as any],
              new_ownership: { PAR: 'FRANCE', BEL: 'FRANCE' },
            } as any,
          },
        })}
      />,
    );
    expect(seen.tools.ownership).toEqual({ PAR: 'FRANCE', BEL: 'FRANCE' });
    expect(seen.tools.units).toEqual([{ id: 'F_B', power: 'FRANCE' }]);

    // Returning to live restores live SC counts, units, finalized marks, and issues.
    rerender(<GameWorkspace {...props({ provinces, historyTurn: null })} />);
    expect(seen.tools.viewingHistory).toBe(false);
    expect(seen.tools.ownership).toEqual({ PAR: 'FRANCE' });
    expect(seen.tools.units).toBe(LIVE.units);
    expect(seen.tools.finalizedPowers).toBe(LIVE.finalized_powers);
    expect(seen.tools.issues).toBe(LIVE.issues);
  });

  it('keeps the same empties across renders, so memoized layers hold', () => {
    const p = props({ historyTurn: PAST });
    const { rerender } = render(<GameWorkspace {...p} />);
    const first = seen.map;
    rerender(<GameWorkspace {...p} zoomPercent={130} />);
    expect(seen.map.issues).toBe(first.issues);
    expect(seen.map.highlightedProvinces).toBe(first.highlightedProvinces);
  });

  it('keeps a past turn’s own builds and retreats', () => {
    const turn = { ...PAST, builds: { G: 1 }, retreats: { R: [] } };
    render(<GameWorkspace {...props({ historyTurn: turn as any })} />);
    expect(seen.map.builds).toBe(turn.builds);
    expect(seen.map.retreats).toBe(turn.retreats);
  });

  it('passes history state down to MacroSidebar and EuropeMap without rendering a drawer footer or map pill', () => {
    const th = history({ viewIndex: 0, powers: ['ITALY', 'FRANCE'] });
    const p = props({ isCompact: true, turnHistory: th, viewedEntry: ENTRY });
    const { queryByTestId } = render(<GameWorkspace {...p} />);
    expect(queryByTestId('turn-history')).toBeNull();
    expect(queryByTestId('turn-history-pill')).toBeNull();
    expect(seen.tools.historyFooter).toBeUndefined();
    expect(seen.map.historyPowers).toEqual(['ITALY', 'FRANCE']);
    expect(seen.macro.historyLabel).toBe('Spring 1901 Movement');
    expect(seen.macro.historyPowers).toEqual(['ITALY', 'FRANCE']);
    expect(seen.macro.onSelectHistoryPowers).toBe(th.setPowers);
    expect(seen.macro.onReturnToLive).toBe(th.goLive);
  });

  it('has no history label on the live turn', () => {
    render(<GameWorkspace {...props({ isCompact: true })} />);
    expect(seen.macro.historyLabel).toBeNull();
  });
});
