// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser, MultiplayerGameSummary } from '../types/diplomacy';
import { type BoardExitsOptions, useBoardExits } from './useBoardExits';

const ME: AuthUser = { id: 'me', email: 'me@test.com', displayName: 'Me' };

function options(dirtyOk: boolean): BoardExitsOptions {
  return {
    setViewMode: vi.fn(),
    authUser: ME,
    seats: {
      rememberCurrentGame: vi.fn(),
      handleJoinOrEnterMultiplayerGame: vi.fn(async () => {}),
      handleEnterSoloSandbox: vi.fn(),
      previousGame: null,
    } as unknown as BoardExitsOptions['seats'],
    confirmIfDirty: vi.fn(async () => dirtyOk),
    confirm: vi.fn(async () => true),
    closeAdminTools: vi.fn(),
    goLive: vi.fn(),
    handleLoadScenario: vi.fn(async () => {}),
    fetchGamesList: vi.fn(),
  };
}

describe('useBoardExits', () => {
  it('goes back to the lobby keeping the seat, and says so', async () => {
    const opts = options(true);
    const { result } = renderHook(() => useBoardExits(opts));
    await expect(result.current.handleBackToLobby()).resolves.toBe(true);
    expect(opts.seats.rememberCurrentGame).toHaveBeenCalled();
    expect(opts.setViewMode).toHaveBeenCalledWith('lobby');
    expect(opts.fetchGamesList).toHaveBeenCalled();
  });

  it('stays on the board when staged edits are kept', async () => {
    const opts = options(false);
    const { result } = renderHook(() => useBoardExits(opts));
    await expect(result.current.handleBackToLobby()).resolves.toBe(false);
    expect(opts.setViewMode).not.toHaveBeenCalled();
    await result.current.guardedEnterSoloSandbox();
    expect(opts.seats.handleEnterSoloSandbox).not.toHaveBeenCalled();
  });

  it('switches games into the seat the player holds', async () => {
    const opts = options(true);
    const { result } = renderHook(() => useBoardExits(opts));
    await result.current.guardedSwitchToGame({
      game_id: 'mp_2',
      participants: { ITALY: { power: 'ITALY', user_id: 'me' } },
    } as unknown as MultiplayerGameSummary);
    expect(opts.closeAdminTools).toHaveBeenCalled();
    expect(opts.seats.handleJoinOrEnterMultiplayerGame).toHaveBeenCalledWith(
      'mp_2',
      'ITALY',
    );
    expect(result.current.guardedReturnToPreviousGame).toBeUndefined();
  });
});
