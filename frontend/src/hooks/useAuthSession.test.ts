// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../types/diplomacy';
import { useAuthSession } from './useAuthSession';

type Listener = (user: AuthUser | null) => void;

const supabase = vi.hoisted(() => ({
  getInitialAuthUser: vi.fn(),
  subscribeToAuthChanges: vi.fn(),
}));
vi.mock('../lib/supabase', () => supabase);

const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.test',
  displayName: 'Alice',
};
const BOB: AuthUser = {
  id: 'user-bob',
  email: 'bob@example.test',
  displayName: 'Bob',
};

let listeners: Set<Listener>;
let unsubscribe: () => void;

beforeEach(() => {
  listeners = new Set();
  unsubscribe = vi.fn();
  supabase.getInitialAuthUser.mockReset();
  supabase.getInitialAuthUser.mockResolvedValue(null);
  supabase.subscribeToAuthChanges.mockReset();
  supabase.subscribeToAuthChanges.mockImplementation((cb: Listener) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
      unsubscribe();
    };
  });
});

const emit = (user: AuthUser | null) => {
  for (const cb of listeners) cb(user);
};

describe('useAuthSession: the signed-in user', () => {
  it('starts signed out and loads the saved session once', async () => {
    supabase.getInitialAuthUser.mockResolvedValue(ALICE);
    const { result, rerender } = renderHook(() => useAuthSession());
    expect(result.current.authUser).toBeNull();

    await waitFor(() => expect(result.current.authUser).toEqual(ALICE));
    rerender();
    expect(supabase.getInitialAuthUser).toHaveBeenCalledTimes(1);
    expect(supabase.subscribeToAuthChanges).toHaveBeenCalledTimes(1);
  });

  it('stays signed out when there is no saved session', async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(supabase.getInitialAuthUser).toHaveBeenCalled());
    expect(result.current.authUser).toBeNull();
  });

  it('follows sign-in and sign-out after the page loads', async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(listeners.size).toBe(1));

    act(() => emit(BOB));
    expect(result.current.authUser).toEqual(BOB);
    act(() => emit(null));
    expect(result.current.authUser).toBeNull();
  });

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useAuthSession());
    await waitFor(() => expect(listeners.size).toBe(1));
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('lets the sign-in modal set the user directly', () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => result.current.setAuthUser(ALICE));
    expect(result.current.authUser).toEqual(ALICE);
  });
});

describe('useAuthSession: the sign-in modal', () => {
  it('starts closed on the sign-in tab with no reason', () => {
    const { result } = renderHook(() => useAuthSession());
    expect(result.current.authModalOpen).toBe(false);
    expect(result.current.authModalTab).toBe('signin');
    expect(result.current.authModalReason).toBeNull();
  });

  it('opens with a reason on the tab asked for', () => {
    const { result } = renderHook(() => useAuthSession());
    act(() =>
      result.current.openAuthPrompt(
        'Please sign in to create a multiplayer game.',
        'signup',
      ),
    );
    expect(result.current.authModalOpen).toBe(true);
    expect(result.current.authModalTab).toBe('signup');
    expect(result.current.authModalReason).toBe(
      'Please sign in to create a multiplayer game.',
    );
  });

  it('opens on the sign-in tab with no banner by default', () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => result.current.openAuthPrompt('Earlier reason', 'signup'));
    act(() => result.current.setAuthModalOpen(false));
    act(() => result.current.openAuthPrompt());
    expect(result.current.authModalOpen).toBe(true);
    expect(result.current.authModalTab).toBe('signin');
    expect(result.current.authModalReason).toBeNull();
  });

  it('treats an empty reason as no reason', () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => result.current.openAuthPrompt(''));
    expect(result.current.authModalReason).toBeNull();
  });

  it('closes', () => {
    const { result } = renderHook(() => useAuthSession());
    act(() => result.current.openAuthPrompt());
    act(() => result.current.setAuthModalOpen(false));
    expect(result.current.authModalOpen).toBe(false);
  });
});
