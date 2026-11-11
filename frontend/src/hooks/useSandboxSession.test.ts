// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  PhaseTimer,
} from '../types/diplomacy';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from '../utils/soloSandboxStorage';
import {
  type SandboxSessionOptions,
  useSandboxSession,
} from './useSandboxSession';

const supabase = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../lib/supabase', () => supabase);

const TIMER = { deadline: '2026-11-10T12:00:00Z' } as unknown as PhaseTimer;
const state = (over: Partial<GameState> = {}) =>
  ({
    game_id: 'mp_1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    timer: TIMER,
    ...over,
  }) as GameState;
const ALICE: AuthUser = {
  id: 'u_alice',
  email: 'alice@example.test',
  displayName: 'alice',
} as AuthUser;
// POWER_METADATA's order, without France.
const FOREIGN = ['ENGLAND', 'GERMANY', 'ITALY', 'AUSTRIA', 'RUSSIA', 'TURKEY'];

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function makeOptions(
  over: Partial<SandboxSessionOptions> = {},
): SandboxSessionOptions {
  return {
    activeGameId: 'mp_1',
    setActiveGameId: vi.fn(),
    setActiveGameSummary: vi.fn(),
    gameState: state(),
    playerPower: 'FRANCE',
    authUser: ALICE,
    openAuthPrompt: vi.fn(),
    triggerToast: vi.fn(),
    goLive: vi.fn(),
    setLoading: vi.fn(),
    setSelectedUnitId: vi.fn(),
    applyServerState: vi.fn(),
    fetchGame: vi.fn(async () => {}),
    fetchGamesList: vi.fn(async () => {}),
    ...over,
  };
}

function sent(index = 0) {
  const [url, init] = supabase.authedFetch.mock.calls[index];
  return {
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(init.body) : undefined,
  };
}

function renderSandbox(o: SandboxSessionOptions) {
  return renderHook(
    (props: SandboxSessionOptions) => useSandboxSession(props),
    {
      initialProps: o,
    },
  );
}

/** Enters Hypothetical Mode in a match, where the server opens a private copy. */
async function enterPrivateCopy(o: SandboxSessionOptions) {
  const view = renderSandbox(o);
  supabase.authedFetch.mockResolvedValueOnce(
    reply(200, state({ game_id: 'sbx_9' })),
  );
  await act(() => view.result.current.handleToggleSandboxMode());
  return view;
}

beforeEach(() => {
  localStorage.clear();
  supabase.authedFetch.mockReset();
  supabase.authedFetch.mockResolvedValue(reply(200, state()));
});

describe('useSandboxSession: Hypothetical Mode in a match', () => {
  it('starts on the real board', () => {
    const { result } = renderSandbox(makeOptions());
    expect(result.current).toMatchObject({
      sandboxMode: false,
      sandboxGameId: null,
      showSimulationOverlay: false,
      saveSandboxModalOpen: false,
      savingSandbox: false,
      draftGameId: 'mp_1',
      matchTimer: TIMER,
    });
  });

  it('entering opens a private copy, which then takes the drafts', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    expect(sent()).toEqual({
      url: '/api/sandbox/enter?game_id=mp_1',
      method: 'POST',
      body: { power: 'FRANCE' },
    });
    expect(o.goLive).toHaveBeenCalledTimes(1);
    expect(o.applyServerState).toHaveBeenCalledWith(
      state({ game_id: 'sbx_9' }),
    );
    expect(result.current).toMatchObject({
      sandboxMode: true,
      sandboxGameId: 'sbx_9',
      showSimulationOverlay: true,
      draftGameId: 'sbx_9',
    });
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Entered Hypothetical Mode: Plot hypothetical foreign moves to test outcomes. Exiting will discard foreign guesses!',
    );
  });

  it('the clock shown is the real match’s, which only setHypotheticalMatchTimer moves', async () => {
    const o = makeOptions();
    const view = await enterPrivateCopy(o);
    const later = { deadline: '2026-11-10T13:00:00Z' } as unknown as PhaseTimer;
    // The private copy's own board has no clock, and must not change the one shown.
    view.rerender({
      ...o,
      gameState: state({ game_id: 'sbx_9', timer: null }),
    });
    expect(view.result.current.matchTimer).toBe(TIMER);
    act(() => view.result.current.setHypotheticalMatchTimer(later));
    expect(view.result.current.matchTimer).toBe(later);
  });

  it('without a private copy the clock is the board’s, or none', () => {
    const { result, rerender } = renderSandbox(makeOptions());
    expect(result.current.matchTimer).toBe(TIMER);
    rerender(makeOptions({ gameState: null }));
    expect(result.current.matchTimer).toBeNull();
  });

  it('while in the private copy, real actions are refused with a toast', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    let allowed = true;
    act(() => {
      allowed = result.current.requireRealBoard('surrender');
    });
    expect(allowed).toBe(false);
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Exit Hypothetical Mode to surrender.',
    );
  });

  it('on the real board, real actions go ahead without a toast', () => {
    const o = makeOptions();
    const { result } = renderSandbox(o);
    expect(result.current.requireRealBoard('surrender')).toBe(true);
    expect(o.triggerToast).not.toHaveBeenCalled();
  });

  it('always enters from the real game', async () => {
    const { result } = renderSandbox(makeOptions());
    act(() => result.current.setSandboxGameId('sbx_old'));
    await act(() => result.current.handleToggleSandboxMode());
    expect(sent().url).toBe('/api/sandbox/enter?game_id=mp_1');
  });

  it('a refused entry says why and changes nothing', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(409, { detail: 'Not your seat.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    const o = makeOptions();
    const { result } = renderSandbox(o);
    await act(() => result.current.handleToggleSandboxMode());
    await act(() => result.current.handleToggleSandboxMode());
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Not your seat.'],
      ['Could not open the sandbox.'],
    ]);
    expect(o.applyServerState).not.toHaveBeenCalled();
    expect(result.current.sandboxMode).toBe(false);
    expect(result.current.sandboxGameId).toBeNull();
  });

  it('exiting closes the private copy and keeps the player’s own orders', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    const back = state();
    supabase.authedFetch.mockResolvedValueOnce(reply(200, back));
    await act(() => result.current.handleToggleSandboxMode());
    expect(sent(1)).toEqual({
      url: '/api/sandbox/exit?game_id=sbx_9',
      method: 'POST',
      body: { power: 'FRANCE' },
    });
    expect(o.goLive).toHaveBeenCalledTimes(1);
    expect(o.applyServerState).toHaveBeenLastCalledWith(back);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(result.current).toMatchObject({
      sandboxMode: false,
      sandboxGameId: null,
      showSimulationOverlay: false,
      draftGameId: 'mp_1',
    });
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      "Exited Hypothetical Mode — foreign guesses discarded. Showing only France's real orders.",
    );
  });

  it.each([
    ['season', { season: 'Fall' }],
    ['year', { year: 1902 }],
    ['phase', { phase: 'Retreats' }],
  ] as const)(
    'says so when the match moved on (%s) while away',
    async (_k, over) => {
      const o = makeOptions();
      const { result } = await enterPrivateCopy(o);
      supabase.authedFetch.mockResolvedValueOnce(
        reply(200, state(over as Partial<GameState>)),
      );
      await act(() => result.current.handleToggleSandboxMode());
      expect(o.triggerToast).toHaveBeenLastCalledWith(
        'The match moved on while in Hypothetical Mode, so hypothetical orders were not kept.',
      );
    },
  );

  it('when the private copy is gone, exiting shows the real match', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    supabase.authedFetch.mockResolvedValueOnce(reply(404, {}));
    await act(() => result.current.handleToggleSandboxMode());
    expect(o.fetchGame).toHaveBeenCalledWith('mp_1');
    expect(result.current.sandboxMode).toBe(false);
    expect(result.current.sandboxGameId).toBeNull();
  });

  it('does nothing without a board', async () => {
    const { result } = renderSandbox(makeOptions({ gameState: null }));
    await act(() => result.current.handleToggleSandboxMode());
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });
});

describe('useSandboxSession: Hypothetical Mode in a solo sandbox', () => {
  it('works on the board itself, with no private copy', async () => {
    const o = makeOptions({
      activeGameId: 'solo_1',
      gameState: state({ game_id: 'solo_1' }),
    });
    const { result } = renderSandbox(o);
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ game_id: 'solo_1' })),
    );
    await act(() => result.current.handleToggleSandboxMode());
    expect(result.current.sandboxMode).toBe(true);
    expect(result.current.sandboxGameId).toBeNull();
    expect(result.current.draftGameId).toBe('solo_1');
    expect(result.current.requireRealBoard('finalize')).toBe(true);

    // Exiting a solo sandbox never says the match moved on, and needs no reload.
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ year: 1905 })),
    );
    supabase.authedFetch.mockResolvedValueOnce(
      reply(200, state({ game_id: 'solo_1' })),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    await act(() => result.current.handleToggleSandboxMode());
    expect(sent(1).url).toBe('/api/sandbox/exit?game_id=solo_1');
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      "Exited Hypothetical Mode — foreign guesses discarded. Showing only France's real orders.",
    );
    await act(() => result.current.handleToggleSandboxMode());
    await act(() => result.current.handleToggleSandboxMode());
    expect(o.fetchGame).not.toHaveBeenCalled();
    expect(result.current.sandboxMode).toBe(false);
  });

  it('clears the hypothetical foreign moves on the draft game', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    const cleared = state({ game_id: 'sbx_9', season: 'Fall' });
    supabase.authedFetch.mockResolvedValueOnce(reply(200, cleared));
    await act(() => result.current.handleClearForeignPreMoves());
    expect(sent(1)).toEqual({
      url: '/api/sandbox/clear-foreign?game_id=sbx_9',
      method: 'POST',
      body: { power: 'FRANCE' },
    });
    expect(o.applyServerState).toHaveBeenLastCalledWith(cleared);
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Cleared all hypothetical foreign pre-moves.',
    );
  });

  it('clears nothing without a board, or when the server says no', async () => {
    const { result } = renderSandbox(makeOptions({ gameState: null }));
    await act(() => result.current.handleClearForeignPreMoves());
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    supabase.authedFetch.mockResolvedValueOnce(reply(409, {}));
    const o = makeOptions();
    const second = renderSandbox(o);
    await act(() => second.result.current.handleClearForeignPreMoves());
    expect(o.applyServerState).not.toHaveBeenCalled();
    expect(o.triggerToast).not.toHaveBeenCalled();
  });

  it('the overlay can be switched from outside', () => {
    const { result } = renderSandbox(makeOptions());
    act(() => result.current.setShowSimulationOverlay(true));
    expect(result.current.showSimulationOverlay).toBe(true);
    act(() => result.current.setSandboxMode(true));
    expect(result.current.sandboxMode).toBe(true);
    act(() => result.current.setSandboxGameId('sbx_2'));
    expect(result.current.draftGameId).toBe('sbx_2');
  });
});

describe('useSandboxSession: the tactical AI', () => {
  it('plans the foreign powers by default, on the draft game, while loading', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    const planned = state({ game_id: 'sbx_9', year: 1902 });
    supabase.authedFetch.mockResolvedValueOnce(reply(200, planned));
    await act(() => result.current.handleGenerateAIMoves());
    expect(sent(1)).toEqual({
      url: '/api/sandbox/ai-orders?game_id=sbx_9',
      method: 'POST',
      body: { powers: FOREIGN, include_active: false },
    });
    expect(o.setLoading).toHaveBeenNthCalledWith(1, true);
    expect(o.setLoading).toHaveBeenLastCalledWith(false);
    expect(o.applyServerState).toHaveBeenLastCalledWith(planned);
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Tactical AI planned orders for foreign powers!',
    );
  });

  it('plans every power, or the ones asked for', async () => {
    const o = makeOptions();
    const { result } = renderSandbox(o);
    await act(() => result.current.handleGenerateAIMoves(undefined, true));
    expect(sent(0).body).toEqual({ powers: null, include_active: true });
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Tactical AI planned orders for all 7 Great Powers!',
    );
    await act(() => result.current.handleGenerateAIMoves(['ITALY']));
    expect(sent(1).body).toEqual({ powers: ['ITALY'], include_active: false });
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Tactical AI planned orders for Italy!',
    );
    await act(() => result.current.handleGenerateAIMoves(['ITALY', 'TURKEY']));
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Tactical AI planned orders for foreign powers!',
    );
  });

  it('says why planning failed, and always stops loading', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(429, { detail: 'Slow down.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    supabase.authedFetch.mockRejectedValueOnce(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const o = makeOptions();
    const { result } = renderSandbox(o);
    await act(() => result.current.handleGenerateAIMoves());
    await act(() => result.current.handleGenerateAIMoves());
    await act(() => result.current.handleGenerateAIMoves());
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Slow down.'],
      ['Failed to generate AI orders.'],
      ['Error generating AI orders.'],
    ]);
    expect(vi.mocked(o.setLoading).mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
      [true],
      [false],
    ]);
    expect(o.applyServerState).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('steps the turn with the AI on the draft game', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    const stepped = state({
      game_id: 'sbx_9',
      season: 'Fall',
      phase: 'Retreats',
    });
    supabase.authedFetch.mockResolvedValueOnce(reply(200, stepped));
    await act(() => result.current.handleAIStepTurn());
    expect(sent(1)).toEqual({
      url: '/api/sandbox/ai-step?game_id=sbx_9',
      method: 'POST',
      body: undefined,
    });
    expect(o.applyServerState).toHaveBeenLastCalledWith(stepped);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(result.current.showSimulationOverlay).toBe(false);
    expect(vi.mocked(o.setLoading).mock.calls).toEqual([[true], [false]]);
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'AI advanced game clock to Fall 1901 Retreats!',
    );
  });

  it('says why a step failed, and always stops loading', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(409, { detail: 'Game over.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    supabase.authedFetch.mockRejectedValueOnce(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const o = makeOptions();
    const { result } = renderSandbox(o);
    await act(() => result.current.handleAIStepTurn());
    await act(() => result.current.handleAIStepTurn());
    await act(() => result.current.handleAIStepTurn());
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Game over.'],
      ['Failed to step turn with AI.'],
      ['Error stepping turn with AI.'],
    ]);
    expect(o.setLoading).toHaveBeenLastCalledWith(false);
    expect(o.setLoading).toHaveBeenCalledTimes(6);
    expect(o.setSelectedUnitId).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('useSandboxSession: scenario reset', () => {
  it('resets the real game and leaves Hypothetical Mode', async () => {
    const o = makeOptions();
    const { result } = await enterPrivateCopy(o);
    const fresh = state({ game_id: 'mp_1' });
    supabase.authedFetch.mockResolvedValueOnce(reply(200, fresh));
    await act(() => result.current.handleLoadScenario('standard_1901'));
    expect(sent(1)).toEqual({
      url: '/api/scenario?game_id=mp_1',
      method: 'POST',
      body: { scenario_id: 'standard_1901', active_power: 'FRANCE' },
    });
    expect(o.applyServerState).toHaveBeenLastCalledWith(fresh);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(result.current).toMatchObject({
      sandboxMode: false,
      sandboxGameId: null,
      showSimulationOverlay: false,
    });
    expect(o.triggerToast).toHaveBeenLastCalledWith(
      'Reset to Standard Spring 1901.',
    );
  });

  it('says why a reset failed', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(403, { detail: 'Host only.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    const o = makeOptions();
    const { result } = renderSandbox(o);
    await act(() => result.current.handleLoadScenario('standard_1901'));
    await act(() => result.current.handleLoadScenario('standard_1901'));
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Host only.'],
      ['Could not reset the scenario.'],
    ]);
    expect(o.applyServerState).not.toHaveBeenCalled();
  });
});

describe('useSandboxSession: saving a sandbox', () => {
  // A draft is promoted in place, so the saved game keeps the draft's id.
  const SAVED = {
    game_id: 'solo_1',
    name: 'Lepanto',
  } as MultiplayerGameSummary;

  it('asks a guest to sign up first', () => {
    const o = makeOptions({ authUser: null });
    const { result } = renderSandbox(o);
    act(() => result.current.handleOpenSaveSandboxModal());
    expect(o.openAuthPrompt).toHaveBeenCalledWith(
      'Sign in or create a free account to save this tactical sandbox scenario to your profile.',
      'signup',
    );
    expect(result.current.saveSandboxModalOpen).toBe(false);
  });

  it('opens and closes the save modal for a signed-in player', () => {
    const o = makeOptions();
    const { result } = renderSandbox(o);
    act(() => result.current.handleOpenSaveSandboxModal());
    expect(result.current.saveSandboxModalOpen).toBe(true);
    expect(o.openAuthPrompt).not.toHaveBeenCalled();
    act(() => result.current.setSaveSandboxModalOpen(false));
    expect(result.current.saveSandboxModalOpen).toBe(false);
  });

  it('saves the open game to the account and moves to the saved copy', async () => {
    writeStoredSoloSandboxId('solo_1');
    let finish: (r: Response) => void = () => {};
    supabase.authedFetch.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const o = makeOptions({ activeGameId: 'solo_1' });
    const { result } = renderSandbox(o);
    act(() => result.current.handleOpenSaveSandboxModal());
    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = result.current.handleSaveSandboxToAccount('Lepanto');
    });
    expect(result.current.savingSandbox).toBe(true);
    await act(async () => {
      finish(reply(200, SAVED));
      await done;
    });
    expect(sent()).toEqual({
      url: '/api/games/save-sandbox?game_id=solo_1',
      method: 'POST',
      body: {
        name: 'Lepanto',
        user_id: 'u_alice',
        email: 'alice@example.test',
        display_name: 'alice',
      },
    });
    expect(readStoredSoloSandboxId()).toBeNull();
    expect(o.setActiveGameId).toHaveBeenCalledWith('solo_1');
    expect(o.setActiveGameSummary).toHaveBeenCalledWith(SAVED);
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
    expect(result.current.saveSandboxModalOpen).toBe(false);
    expect(result.current.savingSandbox).toBe(false);
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Saved "Lepanto" to your account!',
    );
  });

  it('keeps another draft remembered', async () => {
    writeStoredSoloSandboxId('solo_other');
    supabase.authedFetch.mockResolvedValueOnce(reply(200, SAVED));
    const { result } = renderSandbox(makeOptions());
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    expect(readStoredSoloSandboxId()).toBe('solo_other');
  });

  it('saves the open game, never a private copy', async () => {
    supabase.authedFetch.mockResolvedValueOnce(reply(200, SAVED));
    const { result } = renderSandbox(makeOptions({ activeGameId: 'solo_1' }));
    act(() => result.current.setSandboxGameId('sbx_9'));
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    expect(sent().url).toBe('/api/games/save-sandbox?game_id=solo_1');
  });

  it('a guest saves nothing', async () => {
    const { result } = renderSandbox(makeOptions({ authUser: null }));
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('says why a save failed and keeps the modal open', async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(409, { detail: 'Name taken.' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(reply(500, {}));
    supabase.authedFetch.mockRejectedValueOnce(new Error('offline'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const o = makeOptions();
    const { result } = renderSandbox(o);
    act(() => result.current.handleOpenSaveSandboxModal());
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    await act(() => result.current.handleSaveSandboxToAccount('Lepanto'));
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Name taken.'],
      ['Could not save sandbox.'],
      ['Error saving sandbox to account.'],
    ]);
    expect(result.current.saveSandboxModalOpen).toBe(true);
    expect(result.current.savingSandbox).toBe(false);
    expect(o.setActiveGameId).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
