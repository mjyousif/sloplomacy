import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  authedFetch: vi.fn(),
}));
vi.mock('./supabase', () => supabase);

import { apiFetch, apiUrl, readErrorDetail } from './api';

describe('apiUrl', () => {
  it('builds a plain path under /api', () => {
    expect(apiUrl('/games')).toBe('/api/games');
  });

  it('appends string, number, and boolean query parameters and skips nullish values', () => {
    expect(
      apiUrl('/press', {
        game_id: 'mp_1',
        after: 5,
        include: true,
        power: null,
        unused: undefined,
      }),
    ).toBe('/api/press?game_id=mp_1&after=5&include=true');
  });

  it('omits the question mark when all query values are null or undefined', () => {
    expect(apiUrl('/game', { power: null, other: undefined })).toBe(
      '/api/game',
    );
    expect(apiUrl('/game', {})).toBe('/api/game');
  });
});

describe('readErrorDetail', () => {
  it('returns string detail when non-empty', async () => {
    const res = new Response(JSON.stringify({ detail: 'Seat already taken' }), {
      status: 400,
    });
    expect(await readErrorDetail(res, 'Fallback')).toBe('Seat already taken');
  });

  it('returns fallback when detail is an empty string', async () => {
    const res = new Response(JSON.stringify({ detail: '' }), { status: 400 });
    expect(await readErrorDetail(res, 'Fallback')).toBe('Fallback');
  });

  it('returns fallback for FastAPI 422 array payloads instead of [object Object]', async () => {
    const res = new Response(
      JSON.stringify({ detail: [{ loc: ['body', 'name'], msg: 'required' }] }),
      { status: 422 },
    );
    expect(await readErrorDetail(res, 'Validation failed')).toBe(
      'Validation failed',
    );
  });

  it('returns fallback for object or number detail', async () => {
    const objRes = new Response(JSON.stringify({ detail: { code: 'ERR' } }), {
      status: 400,
    });
    expect(await readErrorDetail(objRes, 'Fallback')).toBe('Fallback');

    const numRes = new Response(JSON.stringify({ detail: 123 }), {
      status: 400,
    });
    expect(await readErrorDetail(numRes, 'Fallback')).toBe('Fallback');
  });

  it('returns fallback when body is not valid JSON', async () => {
    const res = new Response('not json', { status: 500 });
    expect(await readErrorDetail(res, 'Fallback')).toBe('Fallback');
  });
});

describe('apiFetch', () => {
  beforeEach(() => {
    supabase.authedFetch.mockReset();
    supabase.authedFetch.mockResolvedValue(new Response(null, { status: 200 }));
  });

  it('forwards url and query to authedFetch without headers when none are needed', async () => {
    await apiFetch('/game', { query: { game_id: 'mp_1', power: undefined } });
    expect(supabase.authedFetch).toHaveBeenCalledWith(
      '/api/game?game_id=mp_1',
      {},
    );
  });

  it('attaches X-Passcode only when passcode is truthy', async () => {
    await apiFetch('/game', {
      query: { game_id: 'mp_1' },
      passcode: 'secret',
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith(
      '/api/game?game_id=mp_1',
      { headers: { 'X-Passcode': 'secret' } },
    );

    await apiFetch('/game', {
      query: { game_id: 'mp_1' },
      passcode: '',
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith(
      '/api/game?game_id=mp_1',
      {},
    );

    await apiFetch('/game', {
      query: { game_id: 'mp_1' },
      passcode: null,
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith(
      '/api/game?game_id=mp_1',
      {},
    );
  });

  it('sets Content-Type and serialized JSON body when json is provided', async () => {
    await apiFetch('/order', {
      method: 'POST',
      query: { game_id: 'mp_1' },
      json: { order_type: 'HOLD' },
    });
    expect(supabase.authedFetch).toHaveBeenCalledWith(
      '/api/order?game_id=mp_1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_type: 'HOLD' }),
      },
    );
  });

  it('merges custom headers passed as Record, Headers, or tuple array', async () => {
    await apiFetch('/test', {
      headers: { 'X-Custom': 'a' },
      passcode: 'pw',
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith('/api/test', {
      headers: { 'X-Custom': 'a', 'X-Passcode': 'pw' },
    });

    await apiFetch('/test', {
      headers: new Headers({ 'X-From-Headers': 'b' }),
      json: { ok: true },
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith('/api/test', {
      headers: {
        'x-from-headers': 'b',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ok: true }),
    });

    await apiFetch('/test', {
      headers: [['X-Tuple', 'c']],
    });
    expect(supabase.authedFetch).toHaveBeenLastCalledWith('/api/test', {
      headers: { 'X-Tuple': 'c' },
    });
  });
});
