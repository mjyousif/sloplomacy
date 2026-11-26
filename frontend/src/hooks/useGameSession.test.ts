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
  Order,
  SimulationResult,
} from '../types/diplomacy';
import { SOLO_SANDBOX_STORAGE_KEY } from '../utils/soloSandboxStorage';
import {
  type GameSessionOptions,
  mergeGames,
  useGameSession,
} from './useGameSession';

const supabase = vi.hoisted(() => {
  const getAuthHeaders = vi.fn();
  return {
    getAuthHeaders,
    authedFetch: vi.fn(async (url: string, init: RequestInit = {}) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          ...(await getAuthHeaders()),
        },
      }),
    ),
  };
});
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
    const st = state({ preview: RESOLUTION });
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

describe('useGameSession: the player’s own games', () => {
  const PRIVATE = {
    game_id: 'mp_secret',
    name: 'Hidden',
    is_private: true,
  } as MultiplayerGameSummary;
  const byUrl = (mine: Reply, lobby: Reply) => (url: string) =>
    Promise.resolve(url === '/api/games/mine' ? mine : lobby);

  it('adds the signed-in player’s private games to the public lobby', async () => {
    fetchMock.mockImplementation(
      byUrl(reply(200, [PRIVATE, SUMMARY]), reply(200, [SUMMARY])),
    );
    const { result } = renderSession();
    await act(() => result.current.fetchGamesList());
    expect(fetchMock).toHaveBeenCalledWith('/api/games/mine', {
      headers: { Authorization: 'Bearer t' },
    });
    expect(result.current.gamesList).toEqual([PRIVATE, SUMMARY]);
  });

  it('drops them when the server says nobody is signed in', async () => {
    fetchMock.mockImplementation(
      byUrl(reply(200, [PRIVATE]), reply(200, [SUMMARY])),
    );
    const { result } = renderSession();
    await act(() => result.current.fetchGamesList());
    fetchMock.mockImplementation(byUrl(reply(401, {}), reply(200, [SUMMARY])));
    await act(() => result.current.fetchMyGames());
    expect(result.current.gamesList).toEqual([SUMMARY]);
  });

  it('asks for none while nobody is signed in', async () => {
    supabase.getAuthHeaders.mockResolvedValue({});
    fetchMock.mockImplementation(byUrl(reply(200, []), reply(200, [SUMMARY])));
    const { result } = renderSession();
    await act(() => result.current.fetchGamesList());
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/games/mine',
      expect.anything(),
    );
    expect(result.current.gamesList).toEqual([SUMMARY]);
  });

  it('keeps them through a failed read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockImplementation(
      byUrl(reply(200, [PRIVATE]), reply(200, [SUMMARY])),
    );
    const { result } = renderSession();
    await act(() => result.current.fetchGamesList());
    fetchMock.mockImplementation(byUrl(reply(503, {}), reply(200, [SUMMARY])));
    await act(() => result.current.fetchMyGames());
    expect(result.current.gamesList).toEqual([PRIVATE, SUMMARY]);
  });

  it('a socket update replaces only the public part', async () => {
    fetchMock.mockImplementation(byUrl(reply(200, [PRIVATE]), reply(200, [])));
    const { result } = renderSession();
    await act(() => result.current.fetchGamesList());
    act(() => result.current.setGamesList([SUMMARY]));
    expect(result.current.gamesList).toEqual([PRIVATE, SUMMARY]);
  });

  it('mergeGames lists each game once, the player’s copy first', () => {
    const stale = { ...SUMMARY, name: 'stale' };
    expect(mergeGames([SUMMARY], [stale, PRIVATE])).toEqual([SUMMARY, PRIVATE]);
  });
});

describe('useGameSession: fetchGame', () => {
  const BOARD = {
    state: state({ preview: RESOLUTION }),
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
      'Failed to connect to Traitorous backend server.',
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

const order = (over: Partial<Order> = {}): Order => ({
  unit_id: 'FRA_A_PAR',
  power: 'FRANCE',
  unit_type: 'A',
  origin: 'PAR',
  origin_coast: null,
  order_type: 'HOLD',
  target: null,
  target_coast: null,
  aux_unit_origin: null,
  via_convoy: false,
  is_explicit: true,
  ...over,
});

describe('useGameSession: optimistic order lifecycle & stale revision guards', () => {
  it('applies an optimistic order immediately, settles with server state, and rolls back on failure', () => {
    const { result } = renderSession();
    const initial = state({
      game_id: 'mp_1',
      state_revision: 1,
      orders: { FRA_A_PAR: order({ is_explicit: false }) },
    });
    act(() => result.current.applyServerState(initial));

    let seq: number | null = null;
    act(() => {
      seq = result.current.beginOptimisticOrder(
        'mp_1',
        order({ order_type: 'MOVE', target: 'BUR' }),
      );
    });
    expect(seq).not.toBeNull();
    expect(result.current.gameState?.orders.FRA_A_PAR.target).toBe('BUR');

    // Rejection rolls back to last authoritative server state.
    act(() => result.current.settleOptimisticOrder(seq));
    expect(result.current.gameState?.orders.FRA_A_PAR.target).toBeNull();

    // Success settles with server state.
    act(() => {
      seq = result.current.beginOptimisticOrder(
        'mp_1',
        order({ order_type: 'MOVE', target: 'PIC' }),
      );
    });
    const next = state({
      game_id: 'mp_1',
      state_revision: 2,
      orders: { FRA_A_PAR: order({ order_type: 'MOVE', target: 'PIC' }) },
      preview: RESOLUTION,
    });
    act(() => result.current.settleOptimisticOrder(seq, next));
    expect(result.current.gameState).toBe(next);
    expect(setSimulationResult).toHaveBeenCalledWith(RESOLUTION);
  });

  it('keeps newer in-flight unit order visible when an earlier order request settles', () => {
    const { result } = renderSession();
    act(() =>
      result.current.applyServerState(
        state({
          game_id: 'mp_1',
          state_revision: 1,
          orders: {
            FRA_A_PAR: order({ is_explicit: false }),
            FRA_A_MAR: order({
              unit_id: 'FRA_A_MAR',
              origin: 'MAR',
              is_explicit: false,
            }),
          },
        }),
      ),
    );

    let seq1: number | null = null;
    let seq2: number | null = null;
    act(() => {
      seq1 = result.current.beginOptimisticOrder(
        'mp_1',
        order({ unit_id: 'FRA_A_PAR', order_type: 'MOVE', target: 'BUR' }),
      );
      seq2 = result.current.beginOptimisticOrder(
        'mp_1',
        order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          order_type: 'MOVE',
          target: 'PIE',
        }),
      );
    });

    // Server reply for seq1 doesn't have seq2 yet, but seq2 must remain visible via rebase.
    const reply1 = state({
      game_id: 'mp_1',
      state_revision: 2,
      orders: {
        FRA_A_PAR: order({ order_type: 'MOVE', target: 'BUR' }),
        FRA_A_MAR: order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          is_explicit: false,
        }),
      },
    });
    act(() => result.current.settleOptimisticOrder(seq1, reply1));
    expect(result.current.gameState?.orders.FRA_A_PAR.target).toBe('BUR');
    expect(result.current.gameState?.orders.FRA_A_MAR.target).toBe('PIE');

    const reply2 = state({
      game_id: 'mp_1',
      state_revision: 3,
      orders: {
        FRA_A_PAR: order({ order_type: 'MOVE', target: 'BUR' }),
        FRA_A_MAR: order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          order_type: 'MOVE',
          target: 'PIE',
        }),
      },
    });
    act(() => result.current.settleOptimisticOrder(seq2, reply2));
    expect(result.current.gameState).toBe(reply2);
  });

  it('ignores out-of-order stale HTTP and WebSocket revisions and clears pending orders on turn advance or game switch', () => {
    const { result } = renderSession();
    const rev3 = state({
      game_id: 'mp_1',
      state_revision: 3,
      orders: { FRA_A_PAR: order({ order_type: 'MOVE', target: 'PIC' }) },
    });
    act(() => result.current.applyServerState(rev3));

    // Stale WS functional update (rev 2) is ignored.
    act(() =>
      result.current.setGameState(() =>
        state({
          game_id: 'mp_1',
          state_revision: 2,
          orders: { FRA_A_PAR: order({ order_type: 'MOVE', target: 'BUR' }) },
        }),
      ),
    );
    expect(result.current.gameState?.state_revision).toBe(3);
    expect(result.current.gameState?.orders.FRA_A_PAR.target).toBe('PIC');

    // Stale HTTP settle (rev 2) is ignored while remaining pending order stays rebased.
    let seq: number | null = null;
    act(() => {
      seq = result.current.beginOptimisticOrder(
        'mp_1',
        order({ order_type: 'MOVE', target: 'GAS' }),
      );
    });
    act(() =>
      result.current.settleOptimisticOrder(
        null,
        state({
          game_id: 'mp_1',
          state_revision: 2,
          orders: { FRA_A_PAR: order({ order_type: 'MOVE', target: 'BUR' }) },
        }),
      ),
    );
    expect(result.current.gameState?.orders.FRA_A_PAR.target).toBe('GAS');

    // Turn advance prunes old pending orders from the prior turn.
    const fallTurn = state({
      game_id: 'mp_1',
      season: 'Fall',
      state_revision: 4,
      orders: { FRA_A_PAR: order({ is_explicit: false }) },
    });
    act(() => result.current.applyServerState(fallTurn));
    expect(result.current.gameState).toBe(fallTurn);

    // Late settle from a different game is ignored after switching games.
    act(() =>
      result.current.applyServerState(
        state({ game_id: 'mp_2', state_revision: 1 }),
      ),
    );
    act(() => result.current.settleOptimisticOrder(seq, rev3));
    expect(result.current.gameState?.game_id).toBe('mp_2');
  });
});

describe('useGameSession: watching without a seat', () => {
  it('is a spectator in multiplayer with no seat, shown the first power with units', () => {
    const { result } = renderSession('multiplayer');
    act(() =>
      result.current.setGameState(
        state({
          units: [
            { id: 'u', power: 'GERMANY', type: 'A', province: 'BER' },
          ] as unknown as GameState['units'],
        }),
      ),
    );
    expect(result.current.isSpectator).toBe(true);
    expect(result.current.spectatorPower).toBe('GERMANY');
    expect(result.current.playerPower).toBe('GERMANY');
    act(() => result.current.setWatchedPower('ITALY'));
    expect(result.current.playerPower).toBe('ITALY');
    act(() => result.current.setLockedPower('TURKEY'));
    expect(result.current.isSpectator).toBe(false);
    expect(result.current.spectatorPower).toBeNull();
    expect(result.current.playerPower).toBe('TURKEY');
  });

  it('names no power and sends the passcode when it loads the match', async () => {
    fetchMock.mockResolvedValue(
      reply(200, { state: state({ game_id: 'mp_1' }), provinces: {} }),
    );
    const { result } = renderSession('multiplayer');
    act(() => result.current.setMatchPasscodes({ mp_1: 'Secret' }));
    await act(() => result.current.fetchGame('mp_1'));
    expect(urlOf(0)).toBe('/api/game?game_id=mp_1');
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: 'Bearer t', 'X-Passcode': 'Secret' },
    });
  });
});
