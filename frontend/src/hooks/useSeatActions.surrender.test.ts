// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  broken,
  makeOptions,
  makeSent,
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

describe('useSeatActions: surrender and leave', () => {
  const game = summary();

  it('opens the Surrender & Leave modal only on the real board', () => {
    const blocked = makeOptions({ requireRealBoard: vi.fn(() => false) });
    const a = renderSeats(blocked);
    act(() => a.result.current.handleOpenSurrenderModal(game, 'FRANCE'));
    expect(blocked.requireRealBoard).toHaveBeenCalledWith('surrender');
    expect(a.result.current.surrenderModalOpen).toBe(false);

    const b = renderSeats(makeOptions());
    act(() => b.result.current.handleOpenSurrenderModal(game, 'FRANCE'));
    expect(b.result.current.surrenderModalOpen).toBe(true);
    expect(b.result.current.surrenderModalGame).toBe(game);
    expect(b.result.current.surrenderModalPower).toBe('FRANCE');
    act(() => b.result.current.setSurrenderModalOpen(false));
    expect(b.result.current.surrenderModalOpen).toBe(false);
  });

  it('sends a guest to sign in before surrendering or leaving', async () => {
    const o = makeOptions({ authUser: null });
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleSurrenderPower('mp_1', 'FRANCE', false),
    );
    await act(() => result.current.handleLeaveGame('mp_1', 'FRANCE'));
    expect(vi.mocked(o.openAuthPrompt).mock.calls).toEqual([
      ['Please sign in to manage your sovereign position.', 'signin'],
      ['Please sign in to leave this campaign.', 'signin'],
    ]);
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('surrenders and stays to watch the units stand in Civil Disorder', async () => {
    const after = summary({ status: 'active' });
    supabase.authedFetch.mockResolvedValue(
      reply(200, { state: STATE, summary: after }),
    );
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleSurrenderPower('mp_1', 'FRANCE', false),
    );
    expect(sent()).toEqual({
      url: '/api/games/mp_1/surrender',
      method: 'POST',
      body: {
        power: 'FRANCE',
        user_id: 'u1',
        email: 'u1@example.test',
        leave: false,
      },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(STATE);
    expect(o.setActiveGameSummary).toHaveBeenCalledWith(after);
    expect(o.setViewMode).not.toHaveBeenCalled();
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Command of France surrendered. Units stand in Civil Disorder.',
    );
    expect(o.fetchGamesList).toHaveBeenCalled();
  });

  it('surrenders and leaves: back to the lobby only from that game', async () => {
    supabase.authedFetch.mockResolvedValue(reply(200, { state: STATE }));
    const here = makeOptions();
    const a = renderSeats(here);
    await act(() =>
      a.result.current.handleSurrenderPower('mp_1', 'FRANCE', true),
    );
    expect(sent().body.leave).toBe(true);
    expect(here.setViewMode).toHaveBeenCalledWith('lobby');
    expect(here.setLockedPower).toHaveBeenCalledWith(null);
    expect(here.setActiveGameSummary).toHaveBeenCalledWith(null);
    expect(here.applyServerState).not.toHaveBeenCalled();
    expect(here.triggerToast).toHaveBeenCalledWith(
      'Surrendered command of France and left match.',
    );

    const elsewhere = makeOptions({ activeGameId: 'other' });
    const b = renderSeats(elsewhere);
    await act(() =>
      b.result.current.handleSurrenderPower('mp_1', 'FRANCE', true),
    );
    expect(elsewhere.setViewMode).not.toHaveBeenCalled();
    expect(elsewhere.fetchGamesList).toHaveBeenCalled();
  });

  it('keeps an unchanged summary when the surrender reply has none', async () => {
    supabase.authedFetch.mockResolvedValue(reply(200, { state: STATE }));
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleSurrenderPower('mp_1', 'FRANCE', false),
    );
    expect(o.setActiveGameSummary).not.toHaveBeenCalled();
  });

  it("shows the server's reason when a surrender or leave is refused", async () => {
    supabase.authedFetch
      .mockResolvedValueOnce(reply(409, { detail: 'Not yours' }))
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(reply(409, { detail: 'Too late' }))
      .mockResolvedValueOnce(broken);
    const o = makeOptions();
    const { result } = renderSeats(o);
    await act(() =>
      result.current.handleSurrenderPower('mp_1', 'FRANCE', true),
    );
    await act(() =>
      result.current.handleSurrenderPower('mp_1', 'FRANCE', true),
    );
    await act(() => result.current.handleLeaveGame('mp_1', 'FRANCE'));
    await act(() => result.current.handleLeaveGame('mp_1', 'FRANCE'));
    expect(vi.mocked(o.triggerToast).mock.calls).toEqual([
      ['Not yours'],
      ['Could not process surrender action.'],
      ['Too late'],
      ['Could not leave match.'],
    ]);
    expect(o.setViewMode).not.toHaveBeenCalled();
    expect(o.fetchGamesList).not.toHaveBeenCalled();
  });

  it('leaves a match, going back to the lobby only from that game', async () => {
    supabase.authedFetch.mockResolvedValue(reply(200, {}));
    const here = makeOptions();
    const a = renderSeats(here);
    await act(() => a.result.current.handleLeaveGame('mp 1', 'FRANCE'));
    expect(sent()).toEqual({
      url: '/api/games/mp%201/leave',
      method: 'POST',
      body: { power: 'FRANCE', user_id: 'u1', email: 'u1@example.test' },
    });
    expect(here.setViewMode).not.toHaveBeenCalled();
    expect(here.triggerToast).toHaveBeenCalledWith('Left campaign.');
    expect(here.fetchGamesList).toHaveBeenCalled();

    await act(() => a.result.current.handleLeaveGame('mp_1', 'FRANCE'));
    expect(here.setViewMode).toHaveBeenCalledWith('lobby');
    expect(here.setLockedPower).toHaveBeenCalledWith(null);
    expect(here.setActiveGameSummary).toHaveBeenCalledWith(null);
  });
});

describe('useSeatActions: picking a power', () => {
  it('keeps a match player on their own seat', async () => {
    const o = makeOptions({ viewMode: 'multiplayer', lockedPower: 'FRANCE' });
    const { result } = renderSeats(o);
    await act(() => result.current.handleSelectPower('FRANCE'));
    expect(o.triggerToast).not.toHaveBeenCalled();
    await act(() => result.current.handleSelectPower('GERMANY'));
    expect(o.triggerToast).toHaveBeenCalledWith(
      'Country locked: You are playing as France in this multiplayer campaign.',
    );
    expect(supabase.authedFetch).not.toHaveBeenCalled();
  });

  it('switches the commanded power on a sandbox board', async () => {
    supabase.authedFetch.mockResolvedValue(reply(200, STATE));
    const o = makeOptions({ viewMode: 'sandbox', activeGameId: 'solo 1' });
    const { result } = renderSeats(o);
    await act(() => result.current.handleSelectPower('GERMANY'));
    expect(sent()).toEqual({
      url: '/api/power?game_id=solo%201',
      method: 'POST',
      body: { power: 'GERMANY' },
    });
    expect(o.applyServerState).toHaveBeenCalledWith(STATE);
    expect(o.setSelectedUnitId).toHaveBeenCalledWith(null);
  });

  it('ignores a refused pick, and a match player with no seat may still pick', async () => {
    supabase.authedFetch.mockResolvedValue(reply(400, {}));
    const o = makeOptions({ viewMode: 'multiplayer', lockedPower: null });
    const { result } = renderSeats(o);
    await act(() => result.current.handleSelectPower('GERMANY'));
    expect(supabase.authedFetch).toHaveBeenCalledTimes(1);
    expect(o.applyServerState).not.toHaveBeenCalled();
    expect(o.setSelectedUnitId).not.toHaveBeenCalled();
  });
});
