// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FRANCE_PROVINCES, unitAt } from '../test/mapFixtures';
import type { GameState } from '../types/diplomacy';
import { useAdminDirectEdit } from './useAdminDirectEdit';

function makeGameState(): GameState {
  return {
    game_id: 'proto_1901',
    scenario_id: 'standard_1901',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    units: [unitAt('FRANCE', 'A', 'PAR'), unitAt('FRANCE', 'A', 'MAR')],
    orders: {},
    ownership: { PAR: 'FRANCE', MAR: 'FRANCE' },
    active_power: 'FRANCE',
    finalized_powers: [],
    surrendered_powers: [],
    issues: [],
    turn_history: [],
    preview: null,
    winner: null,
  };
}

describe('useAdminDirectEdit.clearStagedChanges', () => {
  it('warns the admin and discards unstaged board edits only when confirmed', async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const gameState = makeGameState();
    const { result } = renderHook(() =>
      useAdminDirectEdit({
        activeGameId: 'proto_1901',
        gameState,
        provinces: FRANCE_PROVINCES,
        directEditActive: true,
        setDirectEditActive: vi.fn(),
        authUser: null,
        onUpdateGameState: vi.fn(),
        showToast: vi.fn(),
        confirm,
      }),
    );

    act(() => {
      result.current.onStageOwnership('BUR', 'FRANCE');
    });
    expect(result.current.isDirty).toBe(true);
    expect(result.current.diffLines).toEqual([
      'Set ownership of Burgundy to France',
    ]);

    // Cancelling the confirmation leaves staged changes intact
    await act(async () => {
      await result.current.clearStagedChanges();
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].title).toBe('Clear Staged Board Edits?');
    expect(result.current.isDirty).toBe(true);

    // Confirming clears staged edits without leaving Edit Board mode
    await act(async () => {
      await result.current.clearStagedChanges();
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.diffLines).toEqual([]);
  });

  it('undoes a single staged change without discarding unrelated edits', () => {
    const gameState = makeGameState();
    const { result } = renderHook(() =>
      useAdminDirectEdit({
        activeGameId: 'proto_1901',
        gameState,
        provinces: FRANCE_PROVINCES,
        directEditActive: true,
        setDirectEditActive: vi.fn(),
        authUser: null,
        onUpdateGameState: vi.fn(),
        showToast: vi.fn(),
        confirm: vi.fn(),
      }),
    );

    act(() => {
      result.current.onStageOwnership('BUR', 'FRANCE');
      result.current.onStageRelocateUnit(
        result.current.effectiveGameState!.units[0].id,
        'BUR',
      );
    });

    expect(result.current.stagedChanges).toHaveLength(2);
    const relocateChange = result.current.stagedChanges.find(
      (c) => c.kind === 'relocate',
    )!;

    act(() => {
      result.current.onUndoStagedChange(relocateChange.id);
    });

    expect(result.current.stagedChanges).toHaveLength(1);
    expect(result.current.stagedChanges[0].id).toBe('ownership:BUR');
    expect(
      result.current.effectiveGameState?.units.find(
        (u) => u.id === relocateChange.unitId,
      )?.province,
    ).toBe('PAR');
    expect(result.current.effectiveGameState?.ownership.BUR).toBe('FRANCE');
  });

  it('acknowledges unacknowledged admin log entries without replacing gameState', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, acknowledged_by: 'guest' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const onUpdateGameState = vi.fn();
    const gameState: GameState = {
      ...makeGameState(),
      admin_log: [
        {
          id: 'adm_1',
          timestamp: '2026-11-12T00:00:00Z',
          actor: 'host@test.local',
          season: 'Spring',
          year: 1901,
          phase: 'Movement',
          summary_lines: ['Spawned FRANCE F at ENG'],
          acknowledged_by: [],
        },
      ],
    };

    const { result } = renderHook(() =>
      useAdminDirectEdit({
        activeGameId: 'proto_1901',
        gameState,
        provinces: FRANCE_PROVINCES,
        directEditActive: false,
        setDirectEditActive: vi.fn(),
        authUser: null,
        onUpdateGameState,
        showToast: vi.fn(),
        confirm: vi.fn(),
      }),
    );

    expect(result.current.unacknowledgedAdminEntries).toHaveLength(1);

    await act(async () => {
      await result.current.handleAcknowledgeAdminEntries();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onUpdateGameState).toHaveBeenCalledTimes(1);
    const updatedState = onUpdateGameState.mock.calls[0][0] as GameState;
    expect(updatedState.units).toEqual(gameState.units);
    expect(updatedState.issues).toEqual([]);
    expect(updatedState.admin_log?.[0].acknowledged_by).toContain('guest');

    fetchSpy.mockRestore();
  });

  it('sends board_revision as expected_revision and only explicitly staged orders', async () => {
    const baseState: GameState = {
      ...makeGameState(),
      state_revision: 12,
      board_revision: 4,
      orders: {
        FRANCE_A_PAR: {
          unit_id: 'FRANCE_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
        FRANCE_A_MAR: {
          unit_id: 'FRANCE_A_MAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'MAR',
          order_type: 'MOVE',
          target: 'SPA',
          via_convoy: false,
          is_explicit: true,
        },
      },
    };
    const updatedState: GameState = {
      ...baseState,
      state_revision: 13,
      board_revision: 5,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(updatedState), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() =>
      useAdminDirectEdit({
        activeGameId: 'proto_1901',
        gameState: baseState,
        provinces: FRANCE_PROVINCES,
        directEditActive: true,
        setDirectEditActive: vi.fn(),
        authUser: null,
        onUpdateGameState: vi.fn(),
        showToast: vi.fn(),
        confirm: vi.fn(),
      }),
    );

    act(() => {
      result.current.onStageUnitOrder({
        unit_id: 'FRANCE_A_PAR',
        power: 'FRANCE',
        unit_type: 'A',
        origin: 'PAR',
        order_type: 'MOVE',
        target: 'BUR',
        via_convoy: false,
        is_explicit: true,
      });
    });

    await act(async () => {
      await result.current.applyChanges();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.expected_revision).toBe(4);
    expect(Object.keys(body.orders)).toEqual(['FRANCE_A_PAR']);
    expect(body.orders.FRANCE_A_PAR.target).toBe('BUR');

    fetchSpy.mockRestore();
  });

  it('preserves staged board edits without phantom order diffs when live orders update', () => {
    const initialState: GameState = {
      ...makeGameState(),
      state_revision: 1,
      board_revision: 1,
      orders: {
        FRANCE_A_PAR: {
          unit_id: 'FRANCE_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
        FRANCE_A_MAR: {
          unit_id: 'FRANCE_A_MAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'MAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
      },
    };

    const { result, rerender } = renderHook(
      ({ state }: { state: GameState }) =>
        useAdminDirectEdit({
          activeGameId: 'proto_1901',
          gameState: state,
          provinces: FRANCE_PROVINCES,
          directEditActive: true,
          setDirectEditActive: vi.fn(),
          authUser: null,
          onUpdateGameState: vi.fn(),
          showToast: vi.fn(),
          confirm: vi.fn(),
        }),
      { initialProps: { state: initialState } },
    );

    act(() => {
      result.current.onStageOwnership('BUR', 'FRANCE');
    });
    expect(result.current.stagedChanges.map((c) => c.id)).toEqual([
      'ownership:BUR',
    ]);

    const nextState: GameState = {
      ...initialState,
      state_revision: 2,
      board_revision: 1,
      orders: {
        ...initialState.orders,
        FRANCE_A_PAR: {
          unit_id: 'FRANCE_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'MOVE',
          target: 'BUR',
          via_convoy: false,
          is_explicit: true,
        },
      },
    };

    rerender({ state: nextState });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.stagedChanges.map((c) => c.id)).toEqual([
      'ownership:BUR',
    ]);
    expect(result.current.effectiveGameState?.orders.FRANCE_A_PAR.target).toBe(
      'BUR',
    );
  });

  it('drops unit from stagedOrderIds when an order override is reverted back to base order', async () => {
    const initialState: GameState = {
      ...makeGameState(),
      state_revision: 1,
      board_revision: 1,
      orders: {
        FRANCE_A_PAR: {
          unit_id: 'FRANCE_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
        FRANCE_A_MAR: {
          unit_id: 'FRANCE_A_MAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'MAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
      },
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ...initialState, board_revision: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { result } = renderHook(() =>
      useAdminDirectEdit({
        activeGameId: 'proto_1901',
        gameState: initialState,
        provinces: FRANCE_PROVINCES,
        directEditActive: true,
        setDirectEditActive: vi.fn(),
        authUser: null,
        onUpdateGameState: vi.fn(),
        showToast: vi.fn(),
        confirm: vi.fn(),
      }),
    );

    // Stage ownership change + temporary order override, then revert order back to HOLD
    act(() => {
      result.current.onStageOwnership('BUR', 'FRANCE');
      result.current.onStageUnitOrder({
        unit_id: 'FRANCE_A_PAR',
        power: 'FRANCE',
        unit_type: 'A',
        origin: 'PAR',
        order_type: 'MOVE',
        target: 'BUR',
        via_convoy: false,
        is_explicit: true,
      });
      result.current.onStageUnitOrder({
        unit_id: 'FRANCE_A_PAR',
        power: 'FRANCE',
        unit_type: 'A',
        origin: 'PAR',
        order_type: 'HOLD',
        target: null,
        via_convoy: false,
        is_explicit: true,
      });
    });

    await act(async () => {
      await result.current.applyChanges();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.orders).toEqual({});

    fetchSpy.mockRestore();
  });

  it('prompts immediately on concurrent WebSocket board updates without phantom diffs and still falls back to HTTP 409', async () => {
    const initialState: GameState = {
      ...makeGameState(),
      state_revision: 1,
      board_revision: 1,
    };
    const resolvers: Array<(ok: boolean) => void> = [];
    const confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail:
            'Board state changed while editing. Please review the latest board state before applying changes.',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { result, rerender } = renderHook(
      ({ state }: { state: GameState }) =>
        useAdminDirectEdit({
          activeGameId: 'proto_1901',
          gameState: state,
          provinces: FRANCE_PROVINCES,
          directEditActive: true,
          setDirectEditActive: vi.fn(),
          authUser: null,
          onUpdateGameState: vi.fn(),
          showToast: vi.fn(),
          confirm,
        }),
      { initialProps: { state: initialState } },
    );

    act(() => {
      result.current.onStageOwnership('BUR', 'FRANCE');
    });
    expect(result.current.stagedChanges.map((c) => c.id)).toEqual([
      'ownership:BUR',
    ]);

    // A concurrent board edit arrives via WebSocket (board_revision bumped + GAS owned by FRANCE)
    const concurrentState: GameState = {
      ...initialState,
      state_revision: 2,
      board_revision: 2,
      ownership: { ...initialState.ownership, GAS: 'FRANCE' },
    };
    rerender({ state: concurrentState });

    // Staged diff must still show only the admin's own BUR change, not a phantom GAS diff
    expect(result.current.stagedChanges.map((c) => c.id)).toEqual([
      'ownership:BUR',
    ]);
    // WebSocket conflict immediately triggers the reload prompt without waiting for Apply
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));

    // If the admin cancels the WebSocket prompt and still clicks Apply, HTTP 409 fallback prompts again
    await act(async () => {
      resolvers[0](false);
    });

    let applyPromise!: Promise<boolean>;
    act(() => {
      applyPromise = result.current.applyChanges();
    });

    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    // Apply button must no longer read "Applying..." while the 409 modal is waiting on the user
    expect(result.current.committing).toBe(false);

    await act(async () => {
      resolvers[1](true);
      await applyPromise;
    });

    expect(result.current.stagedChanges).toEqual([]);
    expect(result.current.effectiveGameState?.ownership.GAS).toBe('FRANCE');
    expect(result.current.effectiveGameState?.ownership.BUR).toBeUndefined();

    fetchSpy.mockRestore();
  });
});
