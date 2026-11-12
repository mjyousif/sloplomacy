import { renderHook } from '@testing-library/react';
import type React from 'react';
import { vi } from 'vitest';
import type { AuthUser, GameState, Unit } from '../../types/diplomacy';
import { type UseAdminActionsArgs, useAdminActions } from './useAdminActions';

const unit = (id: string, power: string, province: string, t = 'A') =>
  ({ id, power, province, unit_type: t, coast: null }) as unknown as Unit;
export const UNITS = [
  unit('A_PAR', 'FRANCE', 'PAR'),
  unit('F_LON', 'ENGLAND', 'LON', 'F'),
];
export const state = (over: Partial<GameState> = {}) =>
  ({
    season: 'Fall',
    year: 1902,
    phase: 'Retreats',
    units: UNITS,
    ...over,
  }) as GameState;
export const USER = {
  id: 'u1',
  email: 'a@b.c',
  displayName: 'Ada',
} as AuthUser;

type Reply = { ok: boolean; body?: unknown; badJson?: boolean };

/** What the stubbed `fetch` saw and what it answers, by endpoint (`status`, `rollback`, `unit/move`...). */
export const net = {
  calls: [] as { url: string; init?: RequestInit }[],
  replies: {} as Record<string, Reply>,
  fetchThrows: {} as Record<string, unknown>,
};

function key(url: string) {
  return url.split('?')[0].replace('/api/admin/', '');
}

/** Call from `beforeEach`. Every endpoint answers with a new game state until a test says otherwise. */
export function resetNet() {
  net.calls.length = 0;
  for (const k of Object.keys(net.replies)) delete net.replies[k];
  for (const k of Object.keys(net.fetchThrows)) delete net.fetchThrows[k];
  // Each status read answers with the same numbers, so it never re-renders the hook by itself.
  net.replies.status = {
    ok: true,
    body: { history_count: 0, can_rollback: false },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      net.calls.push({ url, init });
      const k = key(url);
      if (k in net.fetchThrows) throw net.fetchThrows[k];
      const r = net.replies[k] ?? { ok: true, body: state() };
      return {
        ok: r.ok,
        json: async () => {
          if (r.badJson) throw new Error('not json');
          return r.body;
        },
      } as Response;
    }),
  );
}

export function setup(over: Partial<UseAdminActionsArgs> = {}) {
  const args: UseAdminActionsArgs = {
    isOpen: true,
    gameId: 'mp game/1',
    gameState: state(),
    user: USER,
    confirm: vi.fn(async () => true),
    onStateUpdated: vi.fn(),
    onToast: vi.fn(),
    ...over,
  };
  // The open effect clears the banner again on the render after a failure, so keep every
  // render's banner to see what the failure showed.
  const banners: (string | null)[] = [];
  const hook = renderHook(
    (p: UseAdminActionsArgs) => {
      const r = useAdminActions(p);
      banners.push(r.actionError);
      return r;
    },
    { initialProps: args },
  );
  return { args, hook, banners };
}

export const posts = () => net.calls.filter((c) => c.init?.method === 'POST');
export const clickEvent = (shiftKey = false) =>
  ({ shiftKey }) as unknown as React.MouseEvent;
