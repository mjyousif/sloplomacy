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
    last_resolution: null,
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
});
