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
  getAuthHeaders: vi.fn(),
}));
vi.mock('../lib/supabase', () => supabase);
const plainFetch = vi.fn();
vi.stubGlobal('fetch', plainFetch);
const sent = makeSent(supabase.authedFetch);

beforeEach(() => {
  supabase.authedFetch.mockReset();
  supabase.getAuthHeaders.mockReset();
  supabase.getAuthHeaders.mockResolvedValue({ Authorization: 'Bearer t' });
  plainFetch.mockReset();
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
        title: 'Switch to the Solo Sandbox?',
        message:
          'You leave match "Friday Night" for the Solo Sandbox board. Your submitted orders remain safe on the server.',
        confirmLabel: 'Switch',
      },
      click,
    );
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.setLoading).not.toHaveBeenCalled();
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
    expect(plainFetch).not.toHaveBeenCalled();
  });

  it('creates a public match and takes the creator to its board', async () => {
    plainFetch.mockResolvedValue(reply(200, summary({ game_id: 'mp_9' })));
    supabase.authedFetch.mockResolvedValue(
      reply(200, { ...joined, summary: summary({ game_id: 'mp_9' }) }),
    );
    const o = makeOptions();
    const { result } = renderSeats(o);
    let out: unknown;
    await act(async () => {
      out = await result.current.handleCreateMultiplayerGame('G', 'FRANCE');
    });
    const [url, init] = plainFetch.mock.calls[0];
    expect(url).toBe('/api/games');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer t',
    });
    expect(JSON.parse(init.body)).toEqual({
      name: 'G',
      creator_power: 'FRANCE',
      user_id: 'u1',
      email: 'u1@example.test',
      display_name: 'Ada',
      is_private: false,
      passcode: null,
    });
    expect(sent().url).toBe('/api/games/mp_9/join');
    expect(o.setViewMode).toHaveBeenCalledWith('multiplayer');
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Created "Friday Night" — You are commanding France!',
    );
    expect(out).toEqual(summary({ game_id: 'mp_9' }));
  });

  it('leaves a private match with a passcode in the lobby for its host to share', async () => {
    plainFetch.mockResolvedValue(reply(200, summary()));
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleCreateMultiplayerGame('G', 'FRANCE', true, ' pw '),
    );
    const body = JSON.parse(plainFetch.mock.calls[0][1].body);
    expect(body.is_private).toBe(true);
    expect(body.passcode).toBe('pw');
    expect(supabase.authedFetch).not.toHaveBeenCalled();
    expect(o.fetchGamesList).toHaveBeenCalledTimes(1);
    expect(o.triggerToast).not.toHaveBeenCalled();
  });

  it('joins a private match with no passcode at once', async () => {
    plainFetch.mockResolvedValue(reply(200, summary()));
    supabase.authedFetch.mockResolvedValue(
      reply(200, { state: STATE, provinces: PROVINCES, summary: summary() }),
    );
    const { result } = renderSeats(makeOptions());
    await act(() =>
      result.current.handleCreateMultiplayerGame('G', 'FRANCE', true, ''),
    );
    expect(sent().url).toBe('/api/games/mp_1/join');
  });

  it("shows the server's reason when a match cannot be created", async () => {
    plainFetch.mockResolvedValueOnce(reply(400, { detail: 'Name taken' }));
    plainFetch.mockResolvedValueOnce(broken);
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
        email: 'u1@example.test',
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
});
