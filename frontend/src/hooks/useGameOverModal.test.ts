// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
} from '../types/diplomacy';
import { useGameOverModal } from './useGameOverModal';

vi.mock('../lib/supabase', () => ({
  getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer tok' })),
}));

const USER: AuthUser = {
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice',
};

function makeState(winner: GameState['winner'] = null): GameState {
  return {
    game_id: 'mp_1',
    season: 'Fall',
    year: 1908,
    phase: 'Retreats',
    scenario_id: 'standard_1901',
    active_power: 'FRANCE',
    units: [],
    orders: {},
    ownership: {},
    finalized_powers: [],
    issues: [],
    turn_history: [],
    winner,
  };
}

function makeSummary(seenAt: string | null = null): MultiplayerGameSummary {
  return {
    game_id: 'mp_1',
    name: 'Great War',
    status: 'completed',
    winner: 'FRANCE',
    season: 'Fall',
    year: 1908,
    phase: 'Retreats',
    created_by: 'alice@example.com',
    created_at: '2026-11-01T00:00:00Z',
    finalized_powers: [],
    is_sandbox: false,
    participants: {
      FRANCE: {
        user_id: 'u1',
        email: 'alice@example.com',
        display_name: 'Alice',
        power: 'FRANCE',
        joined_at: '2026-11-01T00:00:00Z',
        game_over_seen_at: seenAt,
      },
    },
  };
}

describe('useGameOverModal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-opens and acknowledges when opening an unwitnessed completed multiplayer game', async () => {
    const updatedSummary = makeSummary('2026-11-13T00:00:00Z');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, summary: updatedSummary }), {
        status: 200,
      }),
    );
    const onSummaryUpdated = vi.fn();

    const { result } = renderHook(() =>
      useGameOverModal({
        viewMode: 'multiplayer',
        activeGameId: 'mp_1',
        gameState: makeState('FRANCE'),
        activeGameSummary: makeSummary(null),
        authUser: USER,
        onSummaryUpdated,
      }),
    );

    expect(result.current.gameOverModalOpen).toBe(true);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      '/api/games/mp_1/acknowledge-game-over',
    );
    await waitFor(() =>
      expect(onSummaryUpdated).toHaveBeenCalledWith(updatedSummary),
    );

    act(() => result.current.closeGameOverModal());
    expect(result.current.gameOverModalOpen).toBe(false);
  });

  it('does not auto-open when the participant has already witnessed the ending, but allows re-opening', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { result } = renderHook(() =>
      useGameOverModal({
        viewMode: 'multiplayer',
        activeGameId: 'mp_1',
        gameState: makeState('FRANCE'),
        activeGameSummary: makeSummary('2026-11-12T10:00:00Z'),
        authUser: USER,
      }),
    );

    expect(result.current.gameOverModalOpen).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();

    act(() => result.current.openGameOverModal());
    expect(result.current.gameOverModalOpen).toBe(true);
  });

  it('auto-opens on live transition to winner', () => {
    const { result, rerender } = renderHook(
      ({ winner }: { winner: GameState['winner'] }) =>
        useGameOverModal({
          viewMode: 'sandbox',
          activeGameId: 'solo_1',
          gameState: makeState(winner),
          activeGameSummary: null,
          authUser: null,
        }),
      { initialProps: { winner: null as GameState['winner'] } },
    );

    expect(result.current.gameOverModalOpen).toBe(false);

    rerender({ winner: 'FRANCE' });
    expect(result.current.gameOverModalOpen).toBe(true);
  });
});
