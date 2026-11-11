// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { FRANCE_PROVINCES } from '../test/mapFixtures';
import type {
  GameState,
  MultiplayerGameSummary,
  SimulationResult,
} from '../types/diplomacy';
import { SOLO_SANDBOX_STORAGE_KEY } from '../utils/soloSandboxStorage';
import { type GameSessionOptions, useGameSession } from './useGameSession';

const supabase = vi.hoisted(() => ({ getAuthHeaders: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);

const RESOLUTION = { results: [] } as unknown as SimulationResult;
const state = (over: Partial<GameState> = {}) =>
  ({
    game_id: 'proto_1901',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    active_power: 'ENGLAND',
    ...over,
  }) as GameState;
const SUMMARY = {
  game_id: 'mp_1',
  name: 'Friday Night',
} as MultiplayerGameSummary;

interface Reply {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}
const reply = (status: number, body: unknown): Reply => ({
  ok: status < 400,
  status,
  json: async () => body,
});
/** A reply the test sends by hand, to hold a request open. */
function deferred() {
  let resolve!: (r: Reply) => void;
  const promise = new Promise<Reply>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let fetchMock: ReturnType<typeof vi.fn>;
let setSimulationResult: Mock<(result: SimulationResult) => void>;

beforeEach(() => {
  localStorage.clear();
  supabase.getAuthHeaders.mockReset();
  supabase.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer t' });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setSimulationResult = vi.fn<(result: SimulationResult) => void>();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSession(viewMode: GameSessionOptions['viewMode'] = 'sandbox') {
  return renderHook((props: GameSessionOptions) => useGameSession(props), {
    initialProps: { viewMode, setSimulationResult },
  });
}

const urlOf = (call: number) => fetchMock.mock.calls[call][0] as string;

describe('useGameSession: starting state', () => {
  it('opens proto_1901, loading, with nothing loaded yet', () => {
    const { result } = renderSession();
    expect(result.current.activeGameId).toBe('proto_1901');
    expect(result.current.activeGameSummary).toBeNull();
    expect(result.current.lockedPower).toBeNull();
    expect(result.current.gameState).toBeNull();
    expect(result.current.provinces).toEqual({});
    expect(result.current.gamesList).toEqual([]);
    expect(result.current.loadingGames).toBe(false);
    expect(result.current.loading).toBe(true);
    expect(result.current.errorMsg).toBeNull();
  });

  it('opens the solo sandbox this browser remembers', () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_ab12');
    expect(renderSession().result.current.activeGameId).toBe('solo_ab12');
  });
});

describe('useGameSession: the player’s power', () => {
  it('is the board’s active power in a sandbox, France before a board', () => {
    const { result } = renderSession();
    expect(result.current.playerPower).toBe('FRANCE');
    act(() => result.current.setGameState(state()));
    expect(result.current.playerPower).toBe('ENGLAND');
  });

  it('is the claimed seat in multiplayer, never the shared active power', () => {
    const { result, rerender } = renderSession('multiplayer');
    act(() => {
      result.current.setGameState(state());
      result.current.setLockedPower('TURKEY');
    });
    expect(result.current.playerPower).toBe('TURKEY');
    rerender({ viewMode: 'sandbox', setSimulationResult });
    expect(result.current.playerPower).toBe('ENGLAND');
  });
});

describe('useGameSession: applyServerState', () => {
  it('sets the board and passes on a resolution', () => {
    const { result } = renderSession();
    const st = state({ last_resolution: RESOLUTION });
    act(() => result.current.applyServerState(st));
    expect(result.current.gameState).toBe(st);
    expect(setSimulationResult).toHaveBeenCalledWith(RESOLUTION);
  });

  it('keeps the last resolution when the state has none', () => {
    const { result } = renderSession();
    act(() => result.current.applyServerState(state()));
    expect(setSimulationResult).not.toHaveBeenCalled();
  });
});

describe('useGameSession: fetchGamesList', () => {
  it('loads the lobby list, showing it is loading meanwhile', async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    const { result } = renderSession();
    let done!: Promise<void>;
    act(() => {
      done = result.current.fetchGamesList();
    });
    expect(urlOf(0)).toBe('/api/games');
    expect(result.current.loadingGames).toBe(true);
    await act(async () => {
      pending.resolve(reply(200, [SUMMARY]));
      await done;
    });
    expect(result.current.gamesList).toEqual([SUMMARY]);
    expect(result.current.loadingGames).toBe(false);
  });

  it('keeps the list on a failed reply or a network error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderSession();
    act(() => result.current.setGamesList([SUMMARY]));
    fetchMock.mockResolvedValueOnce(reply(500, []));
    await act(() => result.current.fetchGamesList());
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await act(() => result.current.fetchGamesList());
    expect(result.current.gamesList).toEqual([SUMMARY]);
    expect(result.current.loadingGames).toBe(false);
  });
});

describe('useGameSession: fetchGame', () => {
  const BOARD = {
    state: state({ last_resolution: RESOLUTION }),
    provinces: FRANCE_PROVINCES,
    summary: SUMMARY,
  };

  it('loads the open game for the player’s power, with their token', async () => {
    fetchMock.mockResolvedValue(reply(200, BOARD));
    const { result } = renderSession();
    await act(() => result.current.fetchGame());
    expect(urlOf(0)).toBe('/api/game?game_id=proto_1901&power=FRANCE');
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: 'Bearer t' },
    });
    expect(result.current.gameState).toBe(BOARD.state);
    expect(result.current.provinces).toBe(FRANCE_PROVINCES);
    expect(result.current.activeGameSummary).toBe(SUMMARY);
    expect(setSimulationResult).toHaveBeenCalledWith(RESOLUTION);
    expect(result.current.loading).toBe(false);
    expect(result.current.errorMsg).toBeNull();
  });

  it('loads another game, for a named power or for none', async () => {
    fetchMock.mockResolvedValue(reply(200, { ...BOARD, summary: undefined }));
    const { result } = renderSession();
    await act(() => result.current.fetchGame('mp_1', 'ITALY'));
    expect(urlOf(0)).toBe('/api/game?game_id=mp_1&power=ITALY');
    await act(() => result.current.fetchGame('mp_1', null));
    expect(urlOf(1)).toBe('/api/game?game_id=mp_1');
    expect(result.current.activeGameSummary).toBeNull();
  });

  it('shows it is loading while a board is on its way', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, BOARD));
    const { result } = renderSession();
    await act(() => result.current.fetchGame());
    expect(result.current.loading).toBe(false);
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    let load!: Promise<void>;
    act(() => {
      load = result.current.fetchGame();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      pending.resolve(reply(200, BOARD));
      await load;
    });
    expect(result.current.loading).toBe(false);
  });

  it('drops a reply that a newer request has overtaken', async () => {
    const first = deferred();
    const second = deferred();
    fetchMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderSession();
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => {
      a = result.current.fetchGame('proto_1901');
    });
    act(() => {
      b = result.current.fetchGame('mp_1');
    });
    const newer = state({ game_id: 'mp_1' });
    await act(async () => {
      second.resolve(reply(200, { state: newer, provinces: {} }));
      await b;
      first.resolve(reply(200, BOARD));
      await a;
    });
    expect(result.current.gameState).toBe(newer);
    expect(result.current.activeGameSummary).toBeNull();
  });

  it('drops a reply when a join has bumped the request count', async () => {
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    const { result } = renderSession();
    let load!: Promise<void>;
    act(() => {
      load = result.current.fetchGame();
    });
    result.current.boardRequestSeq.current++;
    await act(async () => {
      pending.resolve(reply(200, BOARD));
      await load;
    });
    expect(result.current.gameState).toBeNull();
  });

  it('says why the board could not load', async () => {
    fetchMock.mockResolvedValue(reply(503, {}));
    const { result } = renderSession();
    await act(() => result.current.fetchGame('mp_1'));
    expect(result.current.errorMsg).toBe('Backend returned 503');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to a generic message when the error has none', async () => {
    fetchMock.mockRejectedValue(new Error(''));
    const { result } = renderSession();
    await act(() => result.current.fetchGame());
    expect(result.current.errorMsg).toBe(
      'Failed to connect to Diplomacy backend server.',
    );
  });

  it('clears the error once a load succeeds', async () => {
    fetchMock.mockResolvedValueOnce(reply(503, {}));
    fetchMock.mockResolvedValueOnce(reply(200, BOARD));
    const { result } = renderSession();
    await act(() => result.current.fetchGame());
    await act(() => result.current.fetchGame());
    expect(result.current.errorMsg).toBeNull();
  });

  it('keeps an overtaken request’s error off the screen', async () => {
    const first = deferred();
    fetchMock
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(reply(200, BOARD));
    const { result } = renderSession();
    let a!: Promise<void>;
    act(() => {
      a = result.current.fetchGame('mp_gone');
    });
    await act(() => result.current.fetchGame());
    await act(async () => {
      first.resolve(reply(404, {}));
      await a;
    });
    expect(result.current.errorMsg).toBeNull();
  });

  it('forgets a remembered solo sandbox the server no longer has, and opens proto_1901', async () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_gone');
    fetchMock
      .mockResolvedValueOnce(reply(404, {}))
      .mockResolvedValueOnce(reply(200, BOARD));
    const { result } = renderSession();
    await act(() => result.current.fetchGame('solo_gone', null));
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBeNull();
    expect(result.current.activeGameId).toBe('proto_1901');
    expect(urlOf(1)).toBe('/api/game?game_id=proto_1901');
    expect(result.current.gameState).toBe(BOARD.state);
    expect(result.current.errorMsg).toBeNull();
  });

  it('reports a missing game that is not the remembered sandbox', async () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_mine');
    fetchMock.mockResolvedValue(reply(404, {}));
    const { result } = renderSession();
    await act(() => result.current.fetchGame('solo_other'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBe('solo_mine');
    expect(result.current.errorMsg).toBe('Backend returned 404');
  });
});
