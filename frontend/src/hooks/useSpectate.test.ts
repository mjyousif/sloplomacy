// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../types/diplomacy';
import {
  type SpectateOptions,
  type SpectateSession,
  useSpectate,
  watchRefusal,
} from './useSpectate';

const supabase = vi.hoisted(() => ({ getAuthHeaders: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);
const plainFetch = vi.fn();
vi.stubGlobal('fetch', plainFetch);

const ME: AuthUser = { id: 'me', email: 'me@test.com', displayName: 'Me' };
const STATE = { game_id: 'mp_1', units: [] };
const summary = (over: Partial<MultiplayerGameSummary> = {}) =>
  ({
    game_id: 'mp_1',
    name: 'Watched',
    participants: { GERMANY: { power: 'GERMANY', user_id: 'bob' } },
    ...over,
  }) as unknown as MultiplayerGameSummary;
const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: async () => body,
  } as Response);

function session(over: Partial<SpectateSession> = {}): SpectateSession {
  return {
    activeGameId: 'proto_1901',
    setActiveGameId: vi.fn(),
    setActiveGameSummary: vi.fn(),
    setLockedPower: vi.fn(),
    setProvinces: vi.fn(),
    boardRequestSeq: { current: 0 },
    applyServerState: vi.fn(),
    matchPasscodes: {},
    setMatchPasscodes: vi.fn(),
    isSpectator: false,
    spectatorPower: null,
    setWatchedPower: vi.fn(),
    fetchGamesList: vi.fn(async () => {}),
    ...over,
  };
}

function options(over: Partial<SpectateOptions> = {}): SpectateOptions {
  return {
    session: session(),
    seats: {
      handleJoinOrEnterMultiplayerGame: vi.fn(async () => {}),
      handleSelectPower: vi.fn(),
    },
    setViewMode: vi.fn(),
    authUser: null,
    triggerToast: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  plainFetch.mockReset();
  supabase.getAuthHeaders.mockReset();
  supabase.getAuthHeaders.mockResolvedValue({});
});

describe('useSpectate', () => {
  it('opens a match with no power named and no seat taken', async () => {
    plainFetch.mockReturnValue(
      reply(200, { state: STATE, provinces: {}, summary: summary() }),
    );
    const o = options();
    const { result } = renderHook(() => useSpectate(o));
    await act(() => result.current.watchGame('mp_1'));

    const [url, init] = plainFetch.mock.calls[0];
    expect(url).toBe('/api/game?game_id=mp_1');
    expect(init.headers).toEqual({});
    expect(o.session.setActiveGameId).toHaveBeenCalledWith('mp_1');
    expect(o.session.applyServerState).toHaveBeenCalledWith(STATE);
    expect(o.session.setLockedPower).toHaveBeenCalledWith(null);
    expect(o.session.setWatchedPower).toHaveBeenCalledWith(null);
    expect(o.session.setMatchPasscodes).not.toHaveBeenCalled();
    expect(o.session.boardRequestSeq.current).toBe(1);
    expect(o.setViewMode).toHaveBeenCalledWith('multiplayer');
    expect(o.seats.handleJoinOrEnterMultiplayerGame).not.toHaveBeenCalled();
  });

  it('sends and keeps the passcode of a private match', async () => {
    plainFetch.mockReturnValue(
      reply(200, { state: STATE, provinces: {}, summary: summary() }),
    );
    const o = options();
    const { result } = renderHook(() => useSpectate(o));
    await act(() => result.current.watchGame('mp_1', ' Secret '));
    expect(plainFetch.mock.calls[0][1].headers).toEqual({
      'X-Passcode': 'Secret',
    });
    const update = vi.mocked(o.session.setMatchPasscodes).mock.calls[0][0];
    expect(typeof update === 'function' && update({})).toEqual({
      mp_1: 'Secret',
    });
  });

  it('takes a player who already holds a seat into it', async () => {
    plainFetch.mockReturnValue(
      reply(200, {
        state: STATE,
        provinces: {},
        summary: summary({
          participants: {
            ITALY: { power: 'ITALY', user_id: 'me' },
          } as unknown as MultiplayerGameSummary['participants'],
        }),
      }),
    );
    const o = options({ authUser: ME });
    const { result } = renderHook(() => useSpectate(o));
    await act(() => result.current.watchGame('mp_1'));
    expect(o.seats.handleJoinOrEnterMultiplayerGame).toHaveBeenCalledWith(
      'mp_1',
      'ITALY',
      '',
    );
    expect(o.setViewMode).not.toHaveBeenCalled();
  });

  it('shows and throws why a match cannot be watched', async () => {
    plainFetch.mockReturnValue(reply(403));
    const o = options();
    const { result } = renderHook(() => useSpectate(o));
    await expect(result.current.watchGame('mp_1')).rejects.toThrow(
      watchRefusal(403),
    );
    expect(o.triggerToast).toHaveBeenCalledWith(watchRefusal(403));
    expect(o.setViewMode).not.toHaveBeenCalled();

    plainFetch.mockReturnValue(
      reply(200, { state: STATE, summary: summary({ is_sandbox: true }) }),
    );
    await expect(result.current.watchGame('saved_1')).rejects.toThrow(
      /Only multiplayer/,
    );
  });

  it("changes only the spectator's own view when another power is picked", () => {
    const watching = options({
      session: session({ isSpectator: true, activeGameId: 'mp_1' }),
    });
    const { result } = renderHook(() => useSpectate(watching));
    result.current.handleSelectPower('GERMANY');
    expect(watching.session.setWatchedPower).toHaveBeenCalledWith('GERMANY');
    expect(watching.seats.handleSelectPower).not.toHaveBeenCalled();

    const playing = options();
    const { result: player } = renderHook(() => useSpectate(playing));
    player.current.handleSelectPower('GERMANY');
    expect(playing.seats.handleSelectPower).toHaveBeenCalledWith('GERMANY');
    expect(player.current.spectator).toBeUndefined();
  });

  it('claims a seat with the passcode it watched with, and leaves to the lobby', () => {
    const o = options({
      session: session({
        isSpectator: true,
        activeGameId: 'mp_1',
        matchPasscodes: { mp_1: 'Secret' },
      }),
    });
    const { result } = renderHook(() => useSpectate(o));
    const spectator = result.current.spectator;
    expect(spectator?.passcode).toBe('Secret');
    spectator?.onClaimSeat('FRANCE');
    expect(o.seats.handleJoinOrEnterMultiplayerGame).toHaveBeenCalledWith(
      'mp_1',
      'FRANCE',
      'Secret',
    );
    spectator?.onLeave();
    expect(o.setViewMode).toHaveBeenCalledWith('lobby');
    expect(o.session.fetchGamesList).toHaveBeenCalled();
  });
});
