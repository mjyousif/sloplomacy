import { renderHook } from '@testing-library/react';
import { type Mock, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
} from '../types/diplomacy';
import { type SeatActionsOptions, useSeatActions } from './useSeatActions';

/** Shared by the useSeatActions test files: a signed-in player, replies and the hook's options. */
export const USER = {
  id: 'u1',
  email: 'u1@example.test',
  displayName: 'Ada',
} as AuthUser;
export const STATE = { game_id: 'mp_1' } as GameState;
export const PROVINCES = { PAR: { id: 'PAR' } };
export const summary = (over: Partial<MultiplayerGameSummary> = {}) =>
  ({
    game_id: 'mp_1',
    name: 'Friday Night',
    ...over,
  }) as MultiplayerGameSummary;

export function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
export const broken = {
  ok: false,
  status: 500,
  json: async () => Promise.reject(),
};

export function makeOptions(
  over: Partial<SeatActionsOptions> = {},
): SeatActionsOptions {
  return {
    viewMode: 'lobby',
    setViewMode: vi.fn(),
    activeGameId: 'mp_1',
    setActiveGameId: vi.fn(),
    activeGameSummary: null,
    setActiveGameSummary: vi.fn(),
    lockedPower: null,
    setLockedPower: vi.fn(),
    setProvinces: vi.fn(),
    setLoading: vi.fn(),
    boardRequestSeq: { current: 4 },
    applyServerState: vi.fn(),
    fetchGamesList: vi.fn(async () => {}),
    authUser: USER,
    openAuthPrompt: vi.fn(),
    setSandboxMode: vi.fn(),
    setShowSimulationOverlay: vi.fn(),
    requireRealBoard: vi.fn(() => true),
    setMatchPasscodes: vi.fn(),
    confirm: vi.fn(async () => true),
    triggerToast: vi.fn(),
    setSelectedUnitId: vi.fn(),
    ...over,
  };
}

export function renderSeats(o: SeatActionsOptions) {
  return renderHook((props: SeatActionsOptions) => useSeatActions(props), {
    initialProps: o,
  });
}

/** Reads the authedFetch call at `index` from `mock`, with its parsed body. */
export const makeSent =
  (mock: Mock) =>
  (index = 0) => {
    const [url, init] = mock.mock.calls[index];
    return {
      url,
      method: init?.method,
      body: init?.body ? JSON.parse(init.body) : undefined,
    };
  };
