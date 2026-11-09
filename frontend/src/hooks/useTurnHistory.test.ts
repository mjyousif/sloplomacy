// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnHistoryEntry, TurnRecord } from '../types/diplomacy';
import { useTurnHistory } from './useTurnHistory';

vi.mock('../lib/supabase', () => ({
  getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer test-token' })),
}));

const S1901M: TurnHistoryEntry = {
  index: 0,
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
};
const F1901M: TurnHistoryEntry = {
  index: 1,
  season: 'Fall',
  year: 1901,
  phase: 'Movement',
};
const W1901A: TurnHistoryEntry = {
  index: 2,
  season: 'Winter',
  year: 1901,
  phase: 'Adjustments',
};

const recordFor = (entry: TurnHistoryEntry): TurnRecord => ({
  ...entry,
  units: [],
  orders: {},
  ownership: {},
  resolution: {
    resolutions: {},
    summary: [],
  } as unknown as TurnRecord['resolution'],
});

/**
 * A fake backend for `/api/history`: `list` is what the history list returns, and each
 * record is built from the entry at that index unless `failRecord` says otherwise.
 */
function mockHistoryApi(initial: TurnHistoryEntry[]) {
  const api = {
    list: initial,
    failRecord: false,
    calls: [] as { url: string; headers: Record<string, string> }[],
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    api.calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const path = new URL(url, 'http://localhost').pathname;
    const match = path.match(/^\/api\/history\/(\d+)$/);
    if (match) {
      const entry = api.list[Number(match[1])];
      if (!entry || api.failRecord) return new Response(null, { status: 404 });
      return Response.json(recordFor(entry));
    }
    return Response.json(api.list);
  });
  vi.stubGlobal('fetch', fetchMock);
  return api;
}

const recordCalls = (api: ReturnType<typeof mockHistoryApi>) =>
  api.calls.filter((c) => /\/history\/\d+/.test(c.url));

const baseOptions = {
  gameId: 'match_1',
  liveTurnKey: 'Spring 1902 Movement',
  passcode: null as string | null,
  enabled: true,
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useTurnHistory', () => {
  it('asks for nothing in the lobby', async () => {
    const api = mockHistoryApi([S1901M]);
    const { result } = renderHook(() =>
      useTurnHistory({ ...baseOptions, enabled: false }),
    );
    await act(async () => {});
    expect(api.calls).toHaveLength(0);
    expect(result.current.entries).toEqual([]);
    expect(result.current.viewIndex).toBeNull();
  });

  it("loads the game's resolved phases with the player's token", async () => {
    const api = mockHistoryApi([S1901M, F1901M]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(api.calls[0].url).toBe('/api/history?game_id=match_1');
    expect(api.calls[0].headers).toEqual({
      Authorization: 'Bearer test-token',
    });
    expect(result.current.viewIndex).toBeNull();
    expect(result.current.turn).toBeNull();
  });

  it('presents the passcode of a private match', async () => {
    const api = mockHistoryApi([S1901M]);
    renderHook(() => useTurnHistory({ ...baseOptions, passcode: 'swordfish' }));
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0].headers['X-Passcode']).toBe('swordfish');
  });

  it('fetches a past turn once and serves it from the cache after that', async () => {
    const api = mockHistoryApi([S1901M, F1901M]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));

    act(() => result.current.select(0));
    expect(result.current.viewIndex).toBe(0);
    await waitFor(() => expect(result.current.turn?.index).toBe(0));
    expect(recordCalls(api).map((c) => c.url)).toEqual([
      '/api/history/0?game_id=match_1',
    ]);

    act(() => result.current.goLive());
    expect(result.current.turn).toBeNull();
    act(() => result.current.select(0));
    await waitFor(() => expect(result.current.turn?.index).toBe(0));
    expect(recordCalls(api)).toHaveLength(1);
  });

  it('steps back from the live turn to the newest phase, and forward to live again', async () => {
    mockHistoryApi([S1901M, F1901M, W1901A]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(3));

    act(() => result.current.step(-1));
    expect(result.current.viewIndex).toBe(2);
    act(() => result.current.step(-1));
    expect(result.current.viewIndex).toBe(1);
    act(() => result.current.step(1));
    act(() => result.current.step(1));
    expect(result.current.viewIndex).toBeNull();
  });

  it('stays on the oldest phase when stepping back past it', async () => {
    mockHistoryApi([S1901M, F1901M]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    act(() => result.current.select(0));
    act(() => result.current.step(-1));
    expect(result.current.viewIndex).toBe(0);
  });

  it('clears the nation filter on returning to the live turn', async () => {
    mockHistoryApi([S1901M]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    act(() => result.current.select(0));
    act(() => result.current.setPower('FRANCE'));
    expect(result.current.power).toBe('FRANCE');
    act(() => result.current.goLive());
    expect(result.current.power).toBeNull();
  });

  it('keeps looking at the same phase when a new one resolves', async () => {
    const api = mockHistoryApi([S1901M, F1901M]);
    const { result, rerender } = renderHook((opts) => useTurnHistory(opts), {
      initialProps: baseOptions,
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    act(() => result.current.select(1));
    await waitFor(() => expect(result.current.turn?.season).toBe('Fall'));

    api.list = [S1901M, F1901M, W1901A];
    rerender({ ...baseOptions, liveTurnKey: 'Spring 1902 Movement (2)' });
    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    expect(result.current.viewIndex).toBe(1);
    expect(result.current.turn?.season).toBe('Fall');
  });

  it('finds the viewed phase again when a rollback moves it to another index', async () => {
    const api = mockHistoryApi([S1901M, F1901M, W1901A]);
    const { result, rerender } = renderHook((opts) => useTurnHistory(opts), {
      initialProps: baseOptions,
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    act(() => result.current.select(1));
    await waitFor(() => expect(result.current.turn?.index).toBe(1));

    // The list now starts at Fall 1901, so the viewed phase sits at index 0.
    api.list = [
      { ...F1901M, index: 0 },
      { ...W1901A, index: 1 },
    ];
    rerender({ ...baseOptions, liveTurnKey: 'Winter 1901 Adjustments' });
    await waitFor(() => expect(result.current.viewIndex).toBe(0));
    await waitFor(() => expect(result.current.turn?.season).toBe('Fall'));
  });

  it('goes back to the live turn when the viewed phase is gone', async () => {
    const api = mockHistoryApi([S1901M, F1901M]);
    const { result, rerender } = renderHook((opts) => useTurnHistory(opts), {
      initialProps: baseOptions,
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    act(() => result.current.select(1));
    act(() => result.current.setPower('ENGLAND'));
    await waitFor(() => expect(result.current.turn?.index).toBe(1));

    api.list = [S1901M];
    rerender({ ...baseOptions, liveTurnKey: 'Fall 1901 Movement' });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.viewIndex).toBeNull();
    expect(result.current.power).toBeNull();
  });

  it('goes back to the live turn when a past turn fails to load', async () => {
    const api = mockHistoryApi([S1901M]);
    const { result } = renderHook(() => useTurnHistory(baseOptions));
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    api.failRecord = true;
    act(() => result.current.select(0));
    await waitFor(() => expect(result.current.viewIndex).toBeNull());
    expect(result.current.turn).toBeNull();
  });

  it('opens another game on its live turn', async () => {
    const api = mockHistoryApi([S1901M, F1901M]);
    const { result, rerender } = renderHook((opts) => useTurnHistory(opts), {
      initialProps: baseOptions,
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    act(() => result.current.select(0));
    act(() => result.current.setPower('ITALY'));

    rerender({ ...baseOptions, gameId: 'match_2' });
    expect(result.current.viewIndex).toBeNull();
    expect(result.current.power).toBeNull();
    await waitFor(() =>
      expect(api.calls.map((c) => c.url)).toContain(
        '/api/history?game_id=match_2',
      ),
    );
  });
});
