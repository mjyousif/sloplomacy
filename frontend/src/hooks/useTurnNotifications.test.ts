// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameState,
  MultiplayerGameSummary,
  PhaseTimer,
  Power,
} from '../types/diplomacy';
import * as soundEffects from '../utils/soundEffects';
import {
  computeTurnAttention,
  DEFAULT_DOCUMENT_TITLE,
  formatDocumentTitle,
  useTurnNotifications,
} from './useTurnNotifications';

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    game_id: 'g1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    scenario_id: 'standard',
    active_power: 'FRANCE',
    units: [
      { id: 'FRA_A_PAR', power: 'FRANCE', unit_type: 'A', province: 'PAR' },
      { id: 'ENG_F_LON', power: 'ENGLAND', unit_type: 'F', province: 'LON' },
    ],
    orders: {},
    ownership: { PAR: 'FRANCE', LON: 'ENGLAND' },
    finalized_powers: [],
    surrendered_powers: [],
    issues: [],
    turn_history: [],
    timer: null,
    ...overrides,
  };
}

function makeSummary(
  powers: Power[] = ['FRANCE', 'ENGLAND'],
): MultiplayerGameSummary {
  const participants = Object.fromEntries(
    powers.map((power) => [
      power,
      {
        power,
        user_id: `uid-${power}`,
        email: `${power.toLowerCase()}@example.test`,
        display_name: power,
        joined_at: '2026-01-01T00:00:00Z',
        is_host: power === 'FRANCE',
        surrendered: false,
      },
    ]),
  );
  return {
    game_id: 'g1',
    name: 'Test Match',
    status: 'active',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    created_by: 'FRANCE',
    created_at: '2026-01-01T00:00:00Z',
    participants,
    finalized_powers: [],
    is_sandbox: false,
  };
}

function makeVotingTimer(
  votes: Partial<Record<Power, '15' | '20' | '30' | 'pause'>> = {},
): PhaseTimer {
  return {
    stage: 'voting',
    deadline: 9999999999,
    minutes: null,
    players: ['FRANCE', 'ENGLAND'],
    votes,
    extend_requests: [],
    ready_powers: [],
    remaining_seconds: 45,
    extensions_needed: 1,
  };
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

describe('computeTurnAttention & formatDocumentTitle', () => {
  it('flags needsMove when player has unfinalized required orders', () => {
    const gs = makeGameState();
    const attention = computeTurnAttention({
      viewMode: 'multiplayer',
      gameState: gs,
      activeGameSummary: makeSummary(),
      lockedPower: 'FRANCE',
      sandboxGameId: null,
      hypotheticalMatchTimer: null,
    });
    expect(attention).toEqual({ needsMove: true, needsVote: false });
    expect(formatDocumentTitle('multiplayer', gs, attention)).toBe(
      '● Your Move — Spring 1901 Movement · Sloplomacy',
    );
  });

  it('clears needsMove once finalized, surrendered, or without retreats', () => {
    const finalized = makeGameState({ finalized_powers: ['FRANCE'] });
    expect(
      computeTurnAttention({
        viewMode: 'multiplayer',
        gameState: finalized,
        activeGameSummary: makeSummary(),
        lockedPower: 'FRANCE',
        sandboxGameId: null,
        hypotheticalMatchTimer: null,
      }),
    ).toEqual({ needsMove: false, needsVote: false });

    const retreatNoDislodged = makeGameState({ phase: 'Retreats' });
    expect(
      computeTurnAttention({
        viewMode: 'multiplayer',
        gameState: retreatNoDislodged,
        activeGameSummary: makeSummary(),
        lockedPower: 'FRANCE',
        sandboxGameId: null,
        hypotheticalMatchTimer: null,
      }),
    ).toEqual({ needsMove: false, needsVote: false });
  });

  it('flags needsVote when timer is voting and player has not voted', () => {
    const gs = makeGameState({
      finalized_powers: ['FRANCE'],
      timer: makeVotingTimer({ ENGLAND: '15' }),
    });
    const attention = computeTurnAttention({
      viewMode: 'multiplayer',
      gameState: gs,
      activeGameSummary: makeSummary(),
      lockedPower: 'FRANCE',
      sandboxGameId: null,
      hypotheticalMatchTimer: null,
    });
    expect(attention).toEqual({ needsMove: false, needsVote: true });
    expect(formatDocumentTitle('multiplayer', gs, attention)).toBe(
      '● Vote Needed — Spring 1901 Movement · Sloplomacy',
    );
  });
});

describe('useTurnNotifications', () => {
  let chimeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    chimeSpy = vi
      .spyOn(soundEffects, 'playAttentionChime')
      .mockResolvedValue(true);
    vi.spyOn(soundEffects, 'setupAudioUnlock').mockReturnValue(() => {});
    setDocumentHidden(true);
    document.title = DEFAULT_DOCUMENT_TITLE;
  });

  afterEach(() => {
    setDocumentHidden(false);
    vi.restoreAllMocks();
  });

  it('does not chime on initial load, but chimes when turn advances in a hidden tab', () => {
    const summary = makeSummary();
    const initial = makeGameState();
    const { rerender } = renderHook(
      ({ gs, sound = true }: { gs: GameState; sound?: boolean }) =>
        useTurnNotifications({
          viewMode: 'multiplayer',
          gameState: gs,
          activeGameSummary: summary,
          lockedPower: 'FRANCE',
          sandboxGameId: null,
          hypotheticalMatchTimer: null,
          soundEnabled: sound,
        }),
      { initialProps: { gs: initial } },
    );

    expect(chimeSpy).not.toHaveBeenCalled();
    expect(document.title).toBe(
      '● Your Move — Spring 1901 Movement · Sloplomacy',
    );

    const nextTurn = makeGameState({ season: 'Fall', finalized_powers: [] });
    rerender({ gs: nextTurn });

    expect(chimeSpy).toHaveBeenCalledTimes(1);
    expect(chimeSpy).toHaveBeenCalledWith('turn');
    expect(document.title).toBe(
      '● Your Move — Fall 1901 Movement · Sloplomacy',
    );
  });

  it('chimes with "vote" when a vote opens in a hidden tab', () => {
    const summary = makeSummary();
    const initial = makeGameState({
      finalized_powers: ['FRANCE'],
      timer: null,
    });
    const { rerender } = renderHook(
      ({ gs }: { gs: GameState }) =>
        useTurnNotifications({
          viewMode: 'multiplayer',
          gameState: gs,
          activeGameSummary: summary,
          lockedPower: 'FRANCE',
          sandboxGameId: null,
          hypotheticalMatchTimer: null,
          soundEnabled: true,
        }),
      { initialProps: { gs: initial } },
    );

    const voteOpened = makeGameState({
      finalized_powers: ['FRANCE'],
      timer: makeVotingTimer(),
    });
    rerender({ gs: voteOpened });

    expect(chimeSpy).toHaveBeenCalledTimes(1);
    expect(chimeSpy).toHaveBeenCalledWith('vote');
    expect(document.title).toBe(
      '● Vote Needed — Spring 1901 Movement · Sloplomacy',
    );
  });

  it('does not chime when tab is visible or sound is muted', () => {
    const summary = makeSummary();
    const initial = makeGameState();
    setDocumentHidden(false);

    const { rerender } = renderHook(
      ({ gs, sound }: { gs: GameState; sound: boolean }) =>
        useTurnNotifications({
          viewMode: 'multiplayer',
          gameState: gs,
          activeGameSummary: summary,
          lockedPower: 'FRANCE',
          sandboxGameId: null,
          hypotheticalMatchTimer: null,
          soundEnabled: sound,
        }),
      { initialProps: { gs: initial, sound: true } },
    );

    rerender({ gs: makeGameState({ season: 'Fall' }), sound: true });
    expect(chimeSpy).not.toHaveBeenCalled();

    setDocumentHidden(true);
    rerender({ gs: makeGameState({ year: 1902 }), sound: false });
    expect(chimeSpy).not.toHaveBeenCalled();
  });
});
