import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE,
  ApiError,
  apiFetch,
  apiJson,
  apiUrl,
  readErrorDetail,
} from './client';

const supabase = vi.hoisted(() => ({
  authedFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
}));
vi.mock('../lib/supabase', () => supabase);

const plainFetch = vi.fn();
vi.stubGlobal('fetch', plainFetch);

beforeEach(() => {
  supabase.authedFetch.mockReset();
  supabase.getAuthHeaders.mockReset();
  plainFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiUrl', () => {
  it('builds a URL under API_BASE and omits nullish query parameters', () => {
    expect(apiUrl('/games')).toBe(`${API_BASE}/games`);
    expect(
      apiUrl('/game', { game_id: 'mp 1', power: undefined, extra: null }),
    ).toBe(`${API_BASE}/game?game_id=mp%201`);
    expect(apiUrl('/adjudicate', { game_id: 'g1', turn: 'Spring 1901' })).toBe(
      `${API_BASE}/adjudicate?game_id=g1&turn=Spring%201901`,
    );
  });
});

describe('readErrorDetail', () => {
  it('returns detail from JSON or falls back when absent or invalid JSON', async () => {
    const withDetail = {
      json: async () => ({ detail: 'Stale turn' }),
    } as Response;
    expect(await readErrorDetail(withDetail, 'Fallback')).toBe('Stale turn');

    const invalid = {
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response;
    expect(await readErrorDetail(invalid, 'Fallback')).toBe('Fallback');
  });
});

describe('apiFetch', () => {
  it('uses authedFetch by default and attaches JSON Content-Type for bodies', async () => {
    const okRes = { ok: true, status: 200 } as Response;
    supabase.authedFetch.mockResolvedValue(okRes);

    const res = await apiFetch('/order', {
      method: 'POST',
      query: { game_id: 'g1' },
      body: { order: { unit_id: 'A_PAR' } },
    });

    expect(res).toBe(okRes);
    expect(supabase.authedFetch).toHaveBeenCalledWith('/api/order?game_id=g1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: { unit_id: 'A_PAR' } }),
    });
    expect(plainFetch).not.toHaveBeenCalled();
  });

  it('uses getAuthHeaders with fetch when auth is headers and preserves extra headers', async () => {
    const okRes = { ok: true, status: 200 } as Response;
    supabase.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer tok' });
    plainFetch.mockResolvedValue(okRes);

    const res = await apiFetch('/history', {
      query: { game_id: 'g1' },
      headers: { 'X-Passcode': 'secret' },
      auth: 'headers',
    });

    expect(res).toBe(okRes);
    expect(plainFetch).toHaveBeenCalledWith('/api/history?game_id=g1', {
      headers: {
        'X-Passcode': 'secret',
        Authorization: 'Bearer tok',
      },
    });
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('uses plain fetch when auth is false or none', async () => {
    const okRes = { ok: true, status: 200 } as Response;
    plainFetch.mockResolvedValue(okRes);

    const res = await apiFetch('/games', { method: 'GET', auth: false });
    expect(res).toBe(okRes);
    expect(plainFetch).toHaveBeenCalledWith('/api/games', {});
    expect(supabase.authedFetch).not.toHaveBeenCalled();

    plainFetch.mockClear();
    await apiFetch('/admin/status', {
      auth: 'none',
      query: { game_id: 'g1' },
      headers: { 'X-User-Id': 'u1' },
    });
    expect(plainFetch).toHaveBeenCalledWith('/api/admin/status?game_id=g1', {
      headers: { 'X-User-Id': 'u1' },
    });
  });
});

describe('apiJson', () => {
  it('parses JSON on 2xx and throws ApiError with server detail on failure', async () => {
    supabase.authedFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
    expect(await apiJson<{ ok: boolean }>('/history')).toEqual({ ok: true });

    supabase.authedFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Wrong passcode' }),
    } as Response);
    await expect(apiJson('/history')).rejects.toEqual(
      new ApiError(403, 'Wrong passcode'),
    );
  });
});
