// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickEvent,
  net,
  posts,
  resetNet,
  setup,
  state,
  UNITS,
} from './useAdminActions.testkit';

vi.mock('../../lib/supabase', () => ({
  getAuthHeaders: async () => ({ Authorization: 'Bearer tok' }),
}));

const { calls, replies, fetchThrows } = net;
beforeEach(resetNet);

describe('useAdminActions: opening', () => {
  it('reads the timeline status once open and shows it', async () => {
    replies.status = {
      ok: true,
      body: { history_count: 3, can_rollback: true },
    };
    const { hook } = setup();
    await waitFor(() => expect(hook.result.current.historyCount).toBe(3));
    expect(hook.result.current.canRollback).toBe(true);
    expect(calls[0].url).toBe('/api/admin/status?game_id=mp%20game%2F1');
    expect(calls[0].init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
      'X-User-Id': 'u1',
      'X-User-Email': 'a@b.c',
    });
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('asks nothing while closed', async () => {
    setup({ isOpen: false });
    await act(async () => {});
    expect(calls).toEqual([]);
  });

  it('leaves the status alone when the server refuses or the call fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    replies.status = { ok: false, body: {} };
    const { hook } = setup();
    await act(async () => {});
    expect(hook.result.current.historyCount).toBe(0);
    expect(hook.result.current.canRollback).toBe(false);
    expect(err).not.toHaveBeenCalled();

    fetchThrows.status = new Error('down');
    setup();
    await waitFor(() =>
      expect(err).toHaveBeenCalledWith(
        'Failed to fetch admin status:',
        expect.any(Error),
      ),
    );
    err.mockRestore();
  });

  it('omits the user headers for a guest', async () => {
    setup({ user: null });
    await act(async () => {});
    expect(calls[0].init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
  });

  it('starts the forms on the game clock and the documented defaults', () => {
    const { hook } = setup();
    const r = hook.result.current;
    expect([r.selectedSeason, r.selectedYear, r.selectedPhase]).toEqual([
      'Fall',
      1902,
      'Retreats',
    ]);
    expect([r.moveTargetProvince, r.moveTargetCoast]).toEqual(['BUR', '']);
    expect([
      r.spawnPower,
      r.spawnUnitType,
      r.spawnProvince,
      r.spawnCoast,
    ]).toEqual(['FRANCE', 'A', 'PAR', '']);
    expect(r.destroyFilterPower).toBe('ALL');
    expect([r.territoryProvince, r.territoryOwner]).toEqual(['BEL', 'NEUTRAL']);
  });

  it('puts the unit pick on the first unit, and moves it off one that is gone', async () => {
    const { hook, args } = setup();
    await waitFor(() => expect(hook.result.current.moveUnitId).toBe('A_PAR'));
    act(() => hook.result.current.setMoveUnitId('F_LON'));
    expect(hook.result.current.moveUnitId).toBe('F_LON');
    hook.rerender({ ...args, gameState: state({ units: [UNITS[0]] }) });
    await waitFor(() => expect(hook.result.current.moveUnitId).toBe('A_PAR'));
    hook.rerender({ ...args, gameState: state({ units: [] }) });
    await waitFor(() => expect(hook.result.current.moveUnitId).toBe(''));
  });

  it('keeps the unit pick untouched while closed', async () => {
    const { hook } = setup({ isOpen: false });
    await act(async () => {});
    expect(hook.result.current.moveUnitId).toBe('');
  });

  it('runs the open effect after every render, because `fetchAdminStatus` is new each time', async () => {
    const { hook, args } = setup();
    await waitFor(() => expect(hook.result.current.moveUnitId).toBe('A_PAR'));
    act(() => hook.result.current.setSelectedSeason('Spring'));
    // The edit is reset to the game's turn, and the status is read again.
    await waitFor(() =>
      expect(hook.result.current.selectedSeason).toBe('Fall'),
    );
    const before = calls.length;
    hook.rerender({ ...args });
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(calls[calls.length - 1].url).toContain('/admin/status');
  });

  it('follows the game to its next turn when the console is open', async () => {
    const { hook, args } = setup();
    hook.rerender({
      ...args,
      gameState: state({ season: 'Spring', year: 1903, phase: 'Movement' }),
    });
    await waitFor(() =>
      expect([
        hook.result.current.selectedSeason,
        hook.result.current.selectedYear,
        hook.result.current.selectedPhase,
      ]).toEqual(['Spring', 1903, 'Movement']),
    );
  });
});

describe('useAdminActions: handlers', () => {
  const NEW = state({ season: 'Spring', year: 1904, phase: 'Movement' });

  async function ready() {
    const s = setup();
    await waitFor(() => expect(s.hook.result.current.moveUnitId).toBe('A_PAR'));
    calls.length = 0;
    return s;
  }
  const body = (i = 0) => JSON.parse(posts()[i].init?.body as string);

  it('rolls back after a yes, then reports and reads the status again', async () => {
    replies.rollback = { ok: true, body: NEW };
    replies.status = {
      ok: true,
      body: { history_count: 1, can_rollback: true },
    };
    const { hook, args } = await ready();
    await waitFor(() => expect(hook.result.current.canRollback).toBe(true));
    calls.length = 0;
    await act(async () => hook.result.current.handleRollback(clickEvent()));
    expect(args.confirm).toHaveBeenCalledWith(
      {
        title: 'Roll back to the previous turn?',
        message:
          'The game returns to the previous turn state. Any moves or changes in the current turn will be reverted.',
        confirmLabel: 'Roll back',
      },
      expect.anything(),
    );
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toBe('/api/admin/rollback?game_id=mp%20game%2F1');
    expect(posts()[0].init?.headers).toMatchObject({ 'X-User-Id': 'u1' });
    expect(body()).toEqual({ user_id: 'u1', email: 'a@b.c' });
    expect(args.onStateUpdated).toHaveBeenCalledWith(NEW);
    expect(args.onToast).toHaveBeenCalledWith(
      'Turn rolled back to Spring 1904 Movement!',
    );
    // The reply's toast comes after the new state, and the status is read again.
    expect(
      vi.mocked(args.onStateUpdated).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(args.onToast).mock.invocationCallOrder[0]);
    expect(calls.some((c) => c.url.startsWith('/api/admin/status'))).toBe(true);
    expect(hook.result.current.loading).toBe(false);
  });

  it('does not roll back when there is nothing to roll back to', async () => {
    const { hook, args } = await ready();
    await act(async () => hook.result.current.handleRollback(clickEvent()));
    expect(args.confirm).not.toHaveBeenCalled();
    expect(posts()).toEqual([]);
  });

  it('does not roll back on a no', async () => {
    replies.status = {
      ok: true,
      body: { history_count: 1, can_rollback: true },
    };
    const { hook, args } = setup({ confirm: vi.fn(async () => false) });
    await waitFor(() => expect(hook.result.current.canRollback).toBe(true));
    calls.length = 0;
    await act(async () => hook.result.current.handleRollback(clickEvent()));
    expect(posts()).toEqual([]);
    expect(args.onToast).not.toHaveBeenCalled();
    expect(hook.result.current.loading).toBe(false);
  });

  it('sets the turn from the form', async () => {
    replies['set-turn'] = { ok: true, body: NEW };
    const { hook, args } = await ready();
    await act(async () => hook.result.current.handleSetTurn());
    expect(posts()[0].url).toBe('/api/admin/set-turn?game_id=mp%20game%2F1');
    expect(body()).toEqual({
      season: 'Fall',
      year: 1902,
      phase: 'Retreats',
      user_id: 'u1',
      email: 'a@b.c',
    });
    expect(args.onStateUpdated).toHaveBeenCalledWith(NEW);
    expect(args.onToast).toHaveBeenCalledWith(
      'Clock adjusted to Spring 1904 (Movement Phase).',
    );
  });

  it('unlocks every power', async () => {
    replies['unfinalize-all'] = { ok: true, body: NEW };
    const { hook, args } = await ready();
    await act(async () => hook.result.current.handleUnfinalizeAll());
    expect(posts()[0].url).toBe(
      '/api/admin/unfinalize-all?game_id=mp%20game%2F1',
    );
    expect(body()).toEqual({ user_id: 'u1', email: 'a@b.c' });
    expect(args.onToast).toHaveBeenCalledWith(
      'All Great Power orders unlocked for editing!',
    );
  });

  it('moves the chosen unit, sending a null coast when none is picked', async () => {
    replies['unit/move'] = { ok: true, body: NEW };
    const { hook, args } = await ready();
    act(() => hook.result.current.setMoveTargetProvince('MUN'));
    await act(async () => hook.result.current.handleMoveUnit());
    expect(posts()[0].url).toBe('/api/admin/unit/move?game_id=mp%20game%2F1');
    expect(body()).toEqual({
      unit_id: 'A_PAR',
      new_province: 'MUN',
      new_coast: null,
      user_id: 'u1',
      email: 'a@b.c',
    });
    expect(args.onToast).toHaveBeenCalledWith('Relocated unit A_PAR to MUN!');

    act(() => hook.result.current.setMoveTargetCoast('NC'));
    await act(async () => hook.result.current.handleMoveUnit());
    expect(body(1).new_coast).toBe('NC');
  });

  it('moves nothing without a unit', async () => {
    const { hook } = setup({ gameState: state({ units: [] }) });
    await act(async () => {});
    calls.length = 0;
    await act(async () => hook.result.current.handleMoveUnit());
    expect(posts()).toEqual([]);
    expect(hook.result.current.loading).toBe(false);
  });

  it('spawns a unit, naming the power and kind in the toast', async () => {
    replies['unit/spawn'] = { ok: true, body: NEW };
    const { hook, args } = await ready();
    act(() => {
      hook.result.current.setSpawnPower('GERMANY');
      hook.result.current.setSpawnUnitType('F');
      hook.result.current.setSpawnProvince('KIE');
      hook.result.current.setSpawnCoast('SC');
    });
    await act(async () => hook.result.current.handleSpawnUnit());
    expect(posts()[0].url).toBe('/api/admin/unit/spawn?game_id=mp%20game%2F1');
    expect(body()).toEqual({
      power: 'GERMANY',
      unit_type: 'F',
      province: 'KIE',
      coast: 'SC',
      user_id: 'u1',
      email: 'a@b.c',
    });
    expect(args.onToast).toHaveBeenCalledWith('Spawned Germany Fleet in KIE!');

    act(() => {
      hook.result.current.setSpawnUnitType('A');
      hook.result.current.setSpawnCoast('');
    });
    await act(async () => hook.result.current.handleSpawnUnit());
    expect(body(1).coast).toBeNull();
    expect(args.onToast).toHaveBeenLastCalledWith(
      'Spawned Germany Army in KIE!',
    );
  });

  it('destroys a unit after a yes, and names it in the question', async () => {
    replies['unit/destroy'] = { ok: true, body: NEW };
    const { hook, args } = await ready();
    await act(async () =>
      hook.result.current.handleDestroyUnit(UNITS[1], clickEvent(true)),
    );
    expect(args.confirm).toHaveBeenCalledWith(
      {
        title: 'Destroy this unit?',
        message: 'England Fleet in LON will be removed from the board.',
        confirmLabel: 'Destroy',
      },
      expect.objectContaining({ shiftKey: true }),
    );
    expect(posts()[0].url).toBe(
      '/api/admin/unit/destroy?game_id=mp%20game%2F1',
    );
    expect(body()).toEqual({ unit_id: 'F_LON', user_id: 'u1', email: 'a@b.c' });
    expect(args.onToast).toHaveBeenCalledWith('Destroyed unit in LON.');
  });

  it('destroys nothing on a no', async () => {
    const { hook, args } = await ready();
    (args.confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await act(async () =>
      hook.result.current.handleDestroyUnit(UNITS[0], clickEvent()),
    );
    expect(posts()).toEqual([]);
    expect(args.onStateUpdated).not.toHaveBeenCalled();
  });

  it('assigns a province, and Neutral sends a null power', async () => {
    replies.ownership = { ok: true, body: NEW };
    const { hook, args } = await ready();
    await act(async () => hook.result.current.handleSetOwnership());
    expect(posts()[0].url).toBe('/api/admin/ownership?game_id=mp%20game%2F1');
    expect(body()).toEqual({
      province: 'BEL',
      power: null,
      user_id: 'u1',
      email: 'a@b.c',
    });
    expect(args.onToast).toHaveBeenCalledWith('Assigned BEL to Neutral!');

    act(() => hook.result.current.setTerritoryOwner('FRANCE'));
    await act(async () => hook.result.current.handleSetOwnership());
    expect(body(1).power).toBe('FRANCE');
    expect(args.onToast).toHaveBeenLastCalledWith('Assigned BEL to France!');
  });

  it('sends no user fields for a guest', async () => {
    const { hook } = setup({ user: null });
    await waitFor(() => expect(hook.result.current.moveUnitId).toBe('A_PAR'));
    calls.length = 0;
    await act(async () => hook.result.current.handleUnfinalizeAll());
    expect(body()).toEqual({});
    expect(posts()[0].init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
  });
});
