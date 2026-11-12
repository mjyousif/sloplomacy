// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickEvent,
  net,
  resetNet,
  setup,
  UNITS,
} from './useAdminActions.testkit';

vi.mock('../../lib/supabase', () => ({
  getAuthHeaders: async () => ({ Authorization: 'Bearer tok' }),
}));

const { replies, fetchThrows } = net;
beforeEach(resetNet);

describe('useAdminActions: failures', () => {
  type Run = (h: ReturnType<typeof setup>['hook']) => Promise<unknown>;
  const CASES: [string, string, string, Run][] = [
    [
      'rollback',
      'Rollback failed.',
      'Network error executing rollback.',
      async (h) => h.result.current.handleRollback(clickEvent()),
    ],
    [
      'set-turn',
      'Failed to adjust turn clock.',
      'Network error setting turn.',
      async (h) => h.result.current.handleSetTurn(),
    ],
    [
      'unfinalize-all',
      'Failed to unfinalize powers.',
      'Network error unlocking powers.',
      async (h) => h.result.current.handleUnfinalizeAll(),
    ],
    [
      'unit/move',
      'Failed to move unit.',
      'Network error moving unit.',
      async (h) => h.result.current.handleMoveUnit(),
    ],
    [
      'unit/spawn',
      'Failed to spawn unit.',
      'Network error spawning unit.',
      async (h) => h.result.current.handleSpawnUnit(),
    ],
    [
      'unit/destroy',
      'Failed to destroy unit.',
      'Network error destroying unit.',
      async (h) => h.result.current.handleDestroyUnit(UNITS[0], clickEvent()),
    ],
    [
      'ownership',
      'Failed to set ownership.',
      'Network error updating ownership.',
      async (h) => h.result.current.handleSetOwnership(),
    ],
  ];

  async function open(endpoint: string) {
    if (endpoint === 'rollback')
      replies.status = {
        ok: true,
        body: { history_count: 1, can_rollback: true },
      };
    const s = setup();
    await waitFor(() => expect(s.hook.result.current.moveUnitId).toBe('A_PAR'));
    if (endpoint === 'rollback')
      await waitFor(() => expect(s.hook.result.current.canRollback).toBe(true));
    s.banners.length = 0;
    return s;
  }

  async function fail(endpoint: string, run: Run) {
    const s = await open(endpoint);
    await act(async () => {
      await run(s.hook);
    });
    return s;
  }

  it.each(CASES)(
    '%s: shows the server detail',
    async (endpoint, _f, _n, run) => {
      replies[endpoint] = { ok: false, body: { detail: 'Not the creator.' } };
      const { args, banners, hook } = await fail(endpoint, run);
      expect(banners).toContain('Not the creator.');
      expect(args.onStateUpdated).not.toHaveBeenCalled();
      expect(args.onToast).not.toHaveBeenCalled();
      expect(hook.result.current.loading).toBe(false);
    },
  );

  it.each(CASES)(
    '%s: falls back to its own message',
    async (endpoint, fallback, _n, run) => {
      replies[endpoint] = { ok: false, badJson: true };
      const { banners } = await fail(endpoint, run);
      expect(banners).toContain(fallback);
    },
  );

  it.each(CASES)(
    '%s: shows what a failed call said',
    async (endpoint, _f, _n, run) => {
      fetchThrows[endpoint] = new Error('socket hung up');
      const { args, banners, hook } = await fail(endpoint, run);
      expect(banners).toContain('socket hung up');
      expect(hook.result.current.loading).toBe(false);
      expect(args.onStateUpdated).not.toHaveBeenCalled();
    },
  );

  it.each(CASES)(
    '%s: names the network when the error says nothing',
    async (endpoint, _f, network, run) => {
      fetchThrows[endpoint] = new Error('');
      const { banners } = await fail(endpoint, run);
      expect(banners).toContain(network);
    },
  );

  it.each(CASES)(
    '%s: is loading while its call is out',
    async (endpoint, _f, _n, run) => {
      let release: () => void = () => {};
      net.hold[endpoint] = new Promise<void>((r) => {
        release = r;
      });
      const { hook } = await open(endpoint);
      let p: Promise<unknown> = Promise.resolve();
      act(() => {
        p = run(hook);
      });
      await waitFor(() => expect(hook.result.current.loading).toBe(true));
      await act(async () => {
        release();
        await p;
      });
      expect(hook.result.current.loading).toBe(false);
    },
  );

  it('shows the loading state while a call is out', async () => {
    let release: (v: unknown) => void = () => {};
    const f = vi.mocked(fetch);
    const { hook } = await open('set-turn');
    f.mockImplementationOnce(() => new Promise((r) => (release = r)) as never);
    let p: Promise<unknown> = Promise.resolve();
    act(() => {
      p = hook.result.current.handleSetTurn() as Promise<unknown>;
    });
    await waitFor(() => expect(hook.result.current.loading).toBe(true));
    await act(async () => {
      release({ ok: false, json: async () => ({}) });
      await p;
    });
    expect(hook.result.current.loading).toBe(false);
  });
});
