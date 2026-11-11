// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameState,
  MultiplayerGameSummary,
  PhaseTimer,
  SimulationResult,
  WebSocketGameUpdate,
} from '../types/diplomacy';
import { SOLO_SANDBOX_STORAGE_KEY } from '../utils/soloSandboxStorage';
import { type GameSyncOptions, useGameSync } from './useGameSync';

const supabase = vi.hoisted(() => ({ getAuthHeaders: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);

/** The socket hook, replaced so a test can deliver messages and pick whether it is up. */
const socket = vi.hoisted(() => ({
  connected: false,
  sendRefresh: vi.fn(),
  options: null as any,
  useDiplomacyWebSocket: vi.fn(),
}));
vi.mock('./useDiplomacyWebSocket', () => ({
  useDiplomacyWebSocket: socket.useDiplomacyWebSocket,
}));

const RESOLUTION = { results: [] } as unknown as SimulationResult;
const TIMER = { deadline: '2026-11-10T12:00:00Z' } as unknown as PhaseTimer;
const SUMMARY = {
  game_id: 'mp_1',
  name: 'Friday Night',
} as MultiplayerGameSummary;
const OTHER = { game_id: 'mp_2', name: 'Other' } as MultiplayerGameSummary;
const state = (over: Partial<GameState> = {}) =>
  ({
    game_id: 'mp_1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    timer: TIMER,
    ...over,
  }) as GameState;

const update = (st: GameState, over: Partial<WebSocketGameUpdate> = {}) =>
  ({
    type: 'game_update',
    game_id: 'mp_1',
    state: st,
    ...over,
  }) as WebSocketGameUpdate;

let fetchMock: ReturnType<typeof vi.fn>;
let opts: GameSyncOptions;
/** What App's state would hold, so updater functions can be checked. */
let board: GameState | null;

function makeOptions(over: Partial<GameSyncOptions> = {}): GameSyncOptions {
  return {
    viewMode: 'multiplayer',
    activeGameId: 'mp_1',
    playerPower: 'FRANCE',
    sandboxGameId: null,
    matchPasscodes: {},
    authKey: 'user-alice',
    triggerToast: vi.fn(),
    setActiveGameSummary: vi.fn(),
    setGameState: vi.fn((next) => {
      board = typeof next === 'function' ? next(board) : next;
    }),
    setGamesList: vi.fn(),
    setSimulationResult: vi.fn(),
    setHypotheticalMatchTimer: vi.fn(),
    applyServerState: vi.fn(),
    fetchGame: vi.fn(async () => {}),
    fetchGamesList: vi.fn(async () => {}),
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  board = null;
  socket.connected = false;
  socket.sendRefresh = vi.fn();
  socket.useDiplomacyWebSocket.mockReset();
  socket.useDiplomacyWebSocket.mockImplementation((o: unknown) => {
    socket.options = o;
    return { isConnected: socket.connected, sendRefresh: socket.sendRefresh };
  });
  supabase.getAuthHeaders.mockReset();
  supabase.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer t' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  opts = makeOptions();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});

function renderSync(o: GameSyncOptions = opts) {
  return renderHook((props: GameSyncOptions) => useGameSync(props), {
    initialProps: o,
  });
}

describe('useGameSync: the socket', () => {
  it('follows the open game for the player’s seat, token and passcode', () => {
    renderSync(
      makeOptions({ matchPasscodes: { mp_1: 'Vienna1901', mp_2: 'x' } }),
    );
    expect(socket.options).toMatchObject({
      activeGameId: 'mp_1',
      viewMode: 'multiplayer',
      power: 'FRANCE',
      passcode: 'Vienna1901',
      authKey: 'user-alice',
    });
  });

  it('sends no passcode for a game without one', () => {
    renderSync();
    expect(socket.options.passcode).toBeNull();
  });

  it('reports whether the socket is up', () => {
    socket.connected = true;
    expect(renderSync().result.current.wsConnected).toBe(true);
  });

  it('asks the server to run the clock when the timer runs out', () => {
    const { result } = renderSync();
    result.current.handleTimerExpired();
    expect(socket.sendRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('useGameSync: game updates', () => {
  it('ignores another game’s update', () => {
    renderSync();
    socket.options.onGameUpdate(
      update(state(), { game_id: 'mp_2', summary: OTHER }),
    );
    expect(opts.setActiveGameSummary).not.toHaveBeenCalled();
    expect(opts.setGameState).not.toHaveBeenCalled();
  });

  it('takes the new board and summary, with a resolution', () => {
    renderSync();
    const st = state({ last_resolution: RESOLUTION });
    socket.options.onGameUpdate(update(st, { summary: SUMMARY }));
    expect(opts.setActiveGameSummary).toHaveBeenCalledWith(SUMMARY);
    expect(board).toBe(st);
    expect(opts.setSimulationResult).toHaveBeenCalledWith(RESOLUTION);
    expect(opts.setHypotheticalMatchTimer).not.toHaveBeenCalled();
  });

  it('leaves the summary and resolution alone when the update has neither', () => {
    renderSync();
    socket.options.onGameUpdate(update(state()));
    expect(opts.setActiveGameSummary).not.toHaveBeenCalled();
    expect(opts.setSimulationResult).not.toHaveBeenCalled();
  });

  it.each([
    ['season', { season: 'Fall' }, 'Phase advanced: Fall 1901 (Movement)'],
    ['year', { year: 1902 }, 'Phase advanced: Spring 1902 (Movement)'],
    ['phase', { phase: 'Retreats' }, 'Phase advanced: Spring 1901 (Retreats)'],
  ] as const)('announces a new %s', (_label, change, message) => {
    board = state();
    renderSync();
    socket.options.onGameUpdate(update(state(change as Partial<GameState>)));
    expect(opts.triggerToast).toHaveBeenCalledWith(message);
  });

  it('says nothing for the same turn or the first board', () => {
    renderSync();
    socket.options.onGameUpdate(update(state()));
    socket.options.onGameUpdate(update(state()));
    expect(opts.triggerToast).not.toHaveBeenCalled();
  });
});

describe('useGameSync: game updates behind a private sandbox', () => {
  it('keeps the summary and the clock, not the board', () => {
    const o = makeOptions({ sandboxGameId: 'sbx_1' });
    renderSync(o);
    socket.options.onGameUpdate(
      update(state({ last_resolution: RESOLUTION }), { summary: SUMMARY }),
    );
    expect(o.setActiveGameSummary).toHaveBeenCalledWith(SUMMARY);
    expect(o.setHypotheticalMatchTimer).toHaveBeenCalledWith(TIMER);
    expect(o.setGameState).not.toHaveBeenCalled();
    expect(o.setSimulationResult).not.toHaveBeenCalled();
  });

  it('notices the sandbox opening even when nothing else changes', () => {
    const { rerender } = renderSync();
    rerender({ ...opts, sandboxGameId: 'sbx_1' });
    socket.options.onGameUpdate(update(state()));
    expect(opts.setHypotheticalMatchTimer).toHaveBeenCalledWith(TIMER);
    expect(opts.setGameState).not.toHaveBeenCalled();
  });

  it('clears the clock when the match has none', () => {
    const o = makeOptions({ sandboxGameId: 'sbx_1' });
    renderSync(o);
    socket.options.onGameUpdate(update(state({ timer: undefined })));
    expect(o.setHypotheticalMatchTimer).toHaveBeenCalledWith(null);
  });
});

describe('useGameSync: lobby updates', () => {
  it('takes the list and the open game’s summary', () => {
    renderSync();
    socket.options.onLobbyUpdate({
      type: 'lobby_update',
      games: [OTHER, SUMMARY],
    });
    expect(opts.setGamesList).toHaveBeenCalledWith([OTHER, SUMMARY]);
    expect(opts.setActiveGameSummary).toHaveBeenCalledWith(SUMMARY);
  });

  it('keeps the summary when the open game is not listed', () => {
    renderSync();
    socket.options.onLobbyUpdate({ type: 'lobby_update', games: [OTHER] });
    expect(opts.setActiveGameSummary).not.toHaveBeenCalled();
  });

  it('follows the game now open', () => {
    const { rerender } = renderSync();
    const next = makeOptions({ activeGameId: 'mp_2' });
    rerender(next);
    socket.options.onLobbyUpdate({
      type: 'lobby_update',
      games: [OTHER, SUMMARY],
    });
    expect(next.setActiveGameSummary).toHaveBeenCalledWith(OTHER);
  });
});

describe('useGameSync: the first load', () => {
  it('loads proto_1901 and the lobby list once', () => {
    const { rerender } = renderSync();
    rerender({ ...opts, activeGameId: 'mp_2' });
    rerender({ ...opts, viewMode: 'lobby' });
    expect(opts.fetchGame).toHaveBeenCalledTimes(1);
    expect(opts.fetchGame).toHaveBeenCalledWith('proto_1901');
    expect(opts.fetchGamesList).toHaveBeenCalledTimes(1);
  });

  it('resumes the solo sandbox this browser remembers', () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_ab12');
    renderSync();
    expect(opts.fetchGame).toHaveBeenCalledWith('solo_ab12');
  });
});

describe('useGameSync: the fallback poll', () => {
  const POLL_REPLY = { state: state({ season: 'Fall' }), summary: SUMMARY };

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true, json: async () => POLL_REPLY });
  });

  const tick = (ms = 4000) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it('polls a multiplayer match every four seconds while the socket is down', async () => {
    renderSync();
    await tick(3999);
    expect(fetchMock).not.toHaveBeenCalled();
    await tick(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/game?game_id=mp_1&power=FRANCE',
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: 'Bearer t' },
    });
    expect(opts.applyServerState).toHaveBeenCalledWith(POLL_REPLY.state);
    expect(opts.setActiveGameSummary).toHaveBeenCalledWith(SUMMARY);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not poll while the socket is up, in a sandbox or in the lobby', async () => {
    socket.connected = true;
    const { rerender } = renderSync();
    await tick();
    socket.connected = false;
    rerender(makeOptions({ viewMode: 'sandbox' }));
    await tick();
    rerender(makeOptions({ viewMode: 'lobby' }));
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops when the socket comes back', async () => {
    const { rerender } = renderSync();
    socket.connected = true;
    rerender(makeOptions());
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only follows the clock behind a private sandbox', async () => {
    const o = makeOptions({ sandboxGameId: 'sbx_1' });
    renderSync(o);
    await tick();
    expect(o.setHypotheticalMatchTimer).toHaveBeenCalledWith(TIMER);
    expect(o.applyServerState).not.toHaveBeenCalled();
    expect(o.setActiveGameSummary).toHaveBeenCalledWith(SUMMARY);
  });

  it('asks without a power when there is none', async () => {
    renderSync(makeOptions({ playerPower: '' as never }));
    await tick();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/game?game_id=mp_1');
  });

  it('ignores failed replies, replies without a board and network errors', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => POLL_REPLY })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockRejectedValueOnce(new Error('offline'));
    renderSync();
    await tick();
    await tick();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(opts.applyServerState).not.toHaveBeenCalled();
    expect(opts.setActiveGameSummary).not.toHaveBeenCalled();
  });

  it('keeps a reply without a summary from clearing it', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ state: state() }),
    });
    renderSync();
    await tick();
    expect(opts.applyServerState).toHaveBeenCalled();
    expect(opts.setActiveGameSummary).not.toHaveBeenCalled();
  });

  it('drops a reply that comes back after the player left the match', async () => {
    let answer!: (r: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((r) => {
        answer = r;
      }),
    );
    const { rerender } = renderSync();
    await tick();
    rerender(makeOptions({ viewMode: 'lobby' }));
    await act(async () => {
      answer({ ok: true, json: async () => POLL_REPLY });
    });
    expect(opts.applyServerState).not.toHaveBeenCalled();
  });

  it('skips while the tab is hidden, and polls at once when it is shown', async () => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    renderSync();
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows the open game, seat and view as they change', async () => {
    const { rerender } = renderSync();
    rerender({ ...opts, activeGameId: 'mp_2' });
    await tick();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      '/api/game?game_id=mp_2&power=FRANCE',
    );
    rerender({ ...opts, activeGameId: 'mp_2', playerPower: 'ITALY' });
    await tick();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      '/api/game?game_id=mp_2&power=ITALY',
    );
    const polls = fetchMock.mock.calls.length;
    rerender({
      ...opts,
      activeGameId: 'mp_2',
      playerPower: 'ITALY',
      viewMode: 'sandbox',
    });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(polls);
  });

  it('switches to the clock alone once a private sandbox opens', async () => {
    const { rerender } = renderSync();
    rerender({ ...opts, sandboxGameId: 'sbx_1' });
    await tick();
    expect(opts.setHypotheticalMatchTimer).toHaveBeenCalledWith(TIMER);
    expect(opts.applyServerState).not.toHaveBeenCalled();
  });

  it('removes its tab listener when it stops', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderSync();
    const added = vi.spyOn(document, 'addEventListener');
    unmount();
    expect(added).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    remove.mockRestore();
    added.mockRestore();
  });

  it('stops listening for the tab when it stops polling', async () => {
    const { unmount } = renderSync();
    unmount();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
