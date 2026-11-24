// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOLO_SANDBOX_STORAGE_KEY } from '../utils/soloSandboxStorage';
import {
  broken,
  makeOptions,
  makeSent,
  PROVINCES,
  renderSeats,
  reply,
  STATE,
  summary,
} from './useSeatActions.testkit';

const supabase = vi.hoisted(() => ({
  authedFetch: vi.fn(),
}));
vi.mock('../lib/supabase', () => supabase);
const sent = makeSent(supabase.authedFetch);

beforeEach(() => {
  supabase.authedFetch.mockReset();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useSeatActions: the Solo Sandbox', () => {
  const solo = { state: { game_id: 'solo_7' }, provinces: PROVINCES };

  it('opens a new solo board and switches to it', async () => {
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...solo, summary: { is_draft: true } }),
    );
    const o = makeOptions({ lockedPower: 'FRANCE' });
    const { result } = renderSeats(o);
    await act(() => result.current.handleEnterSoloSandbox());
    expect(o.confirm).not.toHaveBeenCalled();
    expect(sent()).toEqual({
      url: '/api/games/solo-sandbox',
      method: 'POST',
      body: undefined,
    });
    expect(o.boardRequestSeq.current).toBe(5);
    expect(o.setActiveGameId).toHaveBeenCalledWith('solo_7');
    expect(o.setActiveGameSummary).toHaveBeenCalledWith({ is_draft: true });
    expect(o.applyServerState).toHaveBeenCalledWith(solo.state);
    expect(o.setProvinces).toHaveBeenCalledWith(PROVINCES);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(o.setLockedPower).toHaveBeenCalledWith(null);
    expect(o.setSandboxMode).toHaveBeenCalledWith(false);
    expect(o.setShowSimulationOverlay).toHaveBeenCalledWith(false);
    expect(o.setViewMode).toHaveBeenCalledWith('sandbox');
    expect(vi.mocked(o.setLoading).mock.calls).toEqual([[true], [false]]);
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBe('solo_7');
  });

  it('resumes the remembered draft, and forgets nothing for a saved one', async () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_3');
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...solo, summary: { is_draft: false } }),
    );
    const { result } = renderSeats(makeOptions());
    await act(() => result.current.handleEnterSoloSandbox());
    expect(sent().url).toBe('/api/games/solo-sandbox?resume_game_id=solo_3');
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBe('solo_3');
  });

  it('asks before leaving a match, and stays on a No', async () => {
    const o = makeOptions({
      viewMode: 'multiplayer',
      activeGameSummary: summary(),
      confirm: vi.fn(async () => false),
    });
    const click = { shiftKey: true } as React.MouseEvent;
    const { result } = renderSeats(o);
    await act(() => result.current.handleEnterSoloSandbox(click));
    expect(o.confirm).toHaveBeenCalledWith(
      {
        title: 'Open in Local Sandbox?',
        message:
          'Export the current state of "Friday Night" into your Solo Sandbox (overriding your previous draft sandbox). Your submitted match orders stay safe on the server.',
        confirmLabel: 'Export & Switch',
      },
      click,
    );
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.setLoading).not.toHaveBeenCalled();
  });

  it('exports the active board (including hypothetical branch & passcode) when leaving a board', async () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_old');
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...solo, summary: { is_draft: true } }),
    );
    const setSandboxGameId = vi.fn();
    const o = makeOptions({
      viewMode: 'multiplayer',
      activeGameId: 'mp_1',
      draftGameId: 'sbx_9',
      matchPasscodes: { mp_1: 'secret123' },
      setSandboxGameId,
    });
    const { result } = renderSeats(o);
    await act(() => result.current.handleEnterSoloSandbox());
    const [url, init] = supabase.authedFetch.mock.calls[0];
    expect(url).toBe(
      '/api/games/solo-sandbox?resume_game_id=solo_old&source_game_id=sbx_9',
    );
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'X-Passcode': 'secret123' });
    expect(setSandboxGameId).toHaveBeenCalledWith(null);
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Current game state exported to a new Solo Sandbox.',
    );
  });

  it('switches to solo sandbox without exporting or prompting when handleSwitchToSoloSandbox is called', async () => {
    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_saved');
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...solo, summary: { is_draft: true } }),
    );
    const o = makeOptions({
      viewMode: 'multiplayer',
      activeGameId: 'mp_1',
      activeGameSummary: summary(),
    });
    const { result } = renderSeats(o);
    await act(() => result.current.handleSwitchToSoloSandbox());
    expect(o.confirm).not.toHaveBeenCalled();
    expect(sent().url).toBe(
      '/api/games/solo-sandbox?resume_game_id=solo_saved',
    );
    expect(o.setViewMode).toHaveBeenCalledWith('sandbox');
  });

  it('does not pass source_game_id when launched from the lobby', async () => {
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...solo, summary: { is_draft: true } }),
    );
    const o = makeOptions({ viewMode: 'lobby', activeGameId: 'mp_1' });
    const { result } = renderSeats(o);
    await act(() => result.current.handleEnterSoloSandbox());
    expect(sent().url).toBe('/api/games/solo-sandbox');
    expect(o.triggerToast).not.toHaveBeenCalled();
  });

  it('says so when the board cannot be opened', async () => {
    supabase.authedFetch.mockResolvedValue(reply(503, {}));
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() => result.current.handleEnterSoloSandbox());
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Could not launch personal solo sandbox.',
    );
    expect(o.setViewMode).not.toHaveBeenCalled();
    expect(vi.mocked(o.setLoading).mock.calls).toEqual([[true], [false]]);
  });
});

describe('useSeatActions: creating and joining', () => {
  const joined = { state: STATE, provinces: PROVINCES };

  it('sends a guest to sign up instead of creating a match', async () => {
    const o = makeOptions({ authUser: null });
    const { result } = renderSeats(o);
    await act(() => result.current.handleCreateMultiplayerGame('G', 'FRANCE'));
    expect(o.openAuthPrompt).toHaveBeenCalledWith(
      'Please sign in to create a multiplayer game.',
      'signup',
    );
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('creates a public match and takes the creator to its board', async () => {
    supabase.authedFetch
      .mockResolvedValueOnce(reply(200, summary({ game_id: 'mp_9' })))
      .mockResolvedValueOnce(
        reply(200, { ...joined, summary: summary({ game_id: 'mp_9' }) }),
      );
    const o = makeOptions();
    const { result } = renderSeats(o);
    let out: unknown;
    await act(async () => {
      out = await result.current.handleCreateMultiplayerGame('G', 'FRANCE');
    });
    const [url, init] = supabase.authedFetch.mock.calls[0];
    expect(url).toBe('/api/games');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      name: 'G',
      creator_power: 'FRANCE',
      user_id: 'u1',
      display_name: 'Ada',
      is_private: false,
      passcode: null,
    });
    expect(sent(1).url).toBe('/api/games/mp_9/join');
    expect(o.setViewMode).toHaveBeenCalledWith('multiplayer');
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Created "Friday Night" — You are commanding France!',
    );
    expect(out).toEqual(summary({ game_id: 'mp_9' }));
  });

  it('leaves a private match with a passcode in the lobby for its host to share', async () => {
    supabase.authedFetch.mockResolvedValueOnce(reply(200, summary()));
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleCreateMultiplayerGame('G', 'FRANCE', true, ' pw '),
    );
    expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(supabase.authedFetch.mock.calls[0][1].body);
    expect(body.is_private).toBe(true);
    expect(body.passcode).toBe('pw');
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
    expect(o.triggerToast).not.toHaveBeenCalled();
  });

  it('joins a private match with no passcode at once', async () => {
    supabase.authedFetch
      .mockResolvedValueOnce(reply(200, summary()))
      .mockResolvedValueOnce(
        reply(200, { state: STATE, provinces: PROVINCES, summary: summary() }),
      );
    const { result } = renderSeats(makeOptions());
    await act(() =>
      result.current.handleCreateMultiplayerGame('G', 'FRANCE', true, ''),
    );
    expect(sent(1).url).toBe('/api/games/mp_1/join');
  });

  it("shows the server's reason when a match cannot be created", async () => {
    supabase.authedFetch.mockResolvedValueOnce(
      reply(400, { detail: 'Name taken' }),
    );
    supabase.authedFetch.mockResolvedValueOnce(broken);
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() => result.current.handleCreateMultiplayerGame('G', 'FRANCE'));
    await act(() => result.current.handleCreateMultiplayerGame('G', 'FRANCE'));
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Name taken'],
      ['Could not create multiplayer campaign.'],
    ]);
    expect(o.fetchGamesList).not.toHaveBeenCalled();
  });

  it('sends a guest to sign in to claim a power', async () => {
    const o = makeOptions({ authUser: null });
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleJoinOrEnterMultiplayerGame('mp_1', 'FRANCE'),
    );
    expect(o.openAuthPrompt).toHaveBeenCalledWith(
      'Sign in to claim France and play multiplayer.',
      'signin',
    );
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('claims the seat, keeps the typed passcode and locks the power', async () => {
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...joined, summary: summary() }),
    );
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleJoinOrEnterMultiplayerGame('mp 1', 'FRANCE', ' k '),
    );
    expect(sent()).toEqual({
      url: '/api/games/mp%201/join',
      method: 'POST',
      body: {
        power: 'FRANCE',
        user_id: 'u1',
        display_name: 'Ada',
        passcode: 'k',
      },
    });
    const update = vi.mocked(o.setMatchPasscodes).mock.calls[0][0] as (
      p: Record<string, string>,
    ) => Record<string, string>;
    expect(update({ other: 'x' })).toEqual({ other: 'x', 'mp 1': 'k' });
    expect(o.boardRequestSeq.current).toBe(5);
    expect(o.setActiveGameId).toHaveBeenCalledWith('mp 1');
    expect(o.setActiveGameSummary).toHaveBeenCalledWith(summary());
    expect(o.applyServerState).toHaveBeenCalledWith(STATE);
    expect(o.setProvinces).toHaveBeenCalledWith(PROVINCES);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(o.setSandboxMode).toHaveBeenCalledWith(false);
    expect(o.setShowSimulationOverlay).toHaveBeenCalledWith(false);
    expect(o.setLockedPower).toHaveBeenCalledWith('FRANCE');
    expect(o.setViewMode).toHaveBeenCalledWith('multiplayer');
    expect(o.fetchGamesList).toHaveBeenCalled();
  });

  it('opens a saved sandbox unlocked, and stores no blank passcode', async () => {
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...joined, summary: summary({ is_sandbox: true }) }),
    );
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleJoinOrEnterMultiplayerGame('saved_1', 'FRANCE', ' '),
    );
    expect(sent().body.passcode).toBeNull();
    expect(o.setMatchPasscodes).not.toHaveBeenCalled();
    expect(o.setLockedPower).toHaveBeenCalledWith(null);
    expect(o.setViewMode).toHaveBeenCalledWith('sandbox');
  });

  it('toasts and rethrows a refused join, so the lobby can keep its form open', async () => {
    supabase.authedFetch.mockResolvedValueOnce(reply(403, { detail: 'Taken' }));
    supabase.authedFetch.mockResolvedValueOnce(broken);
    const o = makeOptions();
    const { result } = renderSeats(o);
    for (const msg of ['Taken', 'Unable to join power in this match.']) {
      await expect(
        act(() =>
          result.current.handleJoinOrEnterMultiplayerGame('mp_1', 'FRANCE'),
        ),
      ).rejects.toThrow(msg);
      expect(o.triggerToast).toHaveBeenLastCalledWith(msg);
    }
    expect(o.setViewMode).not.toHaveBeenCalled();
  });

  it('remembers the previous non-draft game when entering Solo Sandbox and returns to it', async () => {
    supabase.authedFetch
      .mockResolvedValueOnce(
        reply(200, {
          summary: summary({
            game_id: 'sbx_draft_9',
            is_sandbox: true,
            is_draft: true,
          }),
          state: { ...STATE, game_id: 'sbx_draft_9' },
          provinces: PROVINCES,
        }),
      )
      .mockResolvedValueOnce(reply(200, { ...joined, summary: summary() }));
    const o = makeOptions({
      viewMode: 'multiplayer',
      activeGameId: 'mp_1',
      activeGameSummary: summary({ game_id: 'mp_1', name: 'Vienna' }),
      lockedPower: 'ITALY',
      matchPasscodes: { mp_1: 'secret' },
    });
    const { result } = renderSeats(o);
    await act(() => result.current.handleSwitchToSoloSandbox());
    expect(result.current.previousGame?.summary.game_id).toBe('mp_1');
    expect(result.current.previousGame?.power).toBe('ITALY');

    supabase.authedFetch.mockClear();
    await act(() => result.current.handleReturnToPreviousGame());
    expect(sent()).toEqual({
      url: '/api/games/mp_1/join',
      method: 'POST',
      body: {
        power: 'ITALY',
        user_id: 'u1',
        display_name: 'Ada',
        passcode: 'secret',
      },
    });
    expect(result.current.previousGame).toBeNull();
  });

  it('opens the delete modal for a saved sandbox and deletes a local draft after confirmation', async () => {
    const saved = summary({
      game_id: 'sbx_saved_1',
      name: 'Saved Study',
      is_sandbox: true,
      is_draft: false,
    });
    const savedSeats = renderSeats(
      makeOptions({ viewMode: 'sandbox', activeGameSummary: saved }),
    );
    await act(() => savedSeats.result.current.handleDeleteSandbox());
    expect(savedSeats.result.current.surrenderModalOpen).toBe(true);
    expect(savedSeats.result.current.surrenderModalGame?.game_id).toBe(
      'sbx_saved_1',
    );

    localStorage.setItem(SOLO_SANDBOX_STORAGE_KEY, 'solo_9');
    supabase.authedFetch.mockResolvedValue(reply(200, { status: 'deleted' }));
    const draftOpts = makeOptions({
      viewMode: 'sandbox',
      activeGameId: 'solo_9',
      activeGameSummary: summary({
        game_id: 'solo_9',
        is_sandbox: true,
        is_draft: true,
      }),
      confirm: vi.fn(async () => true),
    });
    const draftSeats = renderSeats(draftOpts);
    await act(() => draftSeats.result.current.handleDeleteSandbox());
    expect(sent()).toEqual({
      url: '/api/games/solo_9',
      method: 'DELETE',
      body: undefined,
    });
    expect(localStorage.getItem(SOLO_SANDBOX_STORAGE_KEY)).toBeNull();
    expect(draftOpts.setViewMode).toHaveBeenCalledWith('lobby');
    expect(draftOpts.triggerToast).toHaveBeenCalledWith(
      'Deleted local Solo Sandbox.',
    );
  });
});
