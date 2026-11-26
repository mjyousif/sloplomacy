// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiplomacyWebSocket } from './useDiplomacyWebSocket';

const auth = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('../lib/supabase', () => ({
  getAuthHeaders: vi.fn(async () =>
    auth.token ? { Authorization: `Bearer ${auth.token}` } : {},
  ),
}));

/** Records every socket the hook opens. Each one opens as soon as it is created. */
class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  static autoOpen = true;
  static throwOnConstruct = false;
  readyState = 0;
  sent: unknown[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor(public url: string) {
    if (FakeSocket.throwOnConstruct) {
      throw new Error('WS construct failed');
    }
    FakeSocket.instances.push(this);
    if (FakeSocket.autoOpen) {
      queueMicrotask(() => {
        this.open();
      });
    }
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const options = {
  activeGameId: 'match_1',
  viewMode: 'multiplayer' as const,
  power: 'FRANCE',
  passcode: null,
  onGameUpdate: () => {},
  onLobbyUpdate: () => {},
};

beforeEach(() => {
  FakeSocket.instances = [];
  FakeSocket.autoOpen = true;
  FakeSocket.throwOnConstruct = false;
  auth.token = null;
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useDiplomacyWebSocket connection', () => {
  it('opens one game socket and says who is connecting', async () => {
    auth.token = 'alice-token';
    const { result } = renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].url).toContain(
      '/ws/games/match_1?handshake=1&power=FRANCE',
    );
    expect(FakeSocket.instances[0].sent[0]).toEqual({
      type: 'auth',
      token: 'alice-token',
    });
  });

  it('reconnects as the player when they sign in', async () => {
    const { result, rerender } = renderHook(
      (props) => useDiplomacyWebSocket(props),
      { initialProps: { ...options, authKey: null as string | null } },
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    const guestSocket = FakeSocket.instances[0];
    expect(guestSocket.sent[0]).toEqual({ type: 'auth', token: null });

    auth.token = 'alice-token';
    rerender({ ...options, authKey: 'user-alice' });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(guestSocket.closedWith).toBe(1000);
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    expect(FakeSocket.instances[1].sent[0]).toEqual({
      type: 'auth',
      token: 'alice-token',
    });
  });

  it('reconnects as a guest when the player signs out', async () => {
    auth.token = 'alice-token';
    const { result, rerender } = renderHook(
      (props) => useDiplomacyWebSocket(props),
      { initialProps: { ...options, authKey: 'user-alice' as string | null } },
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));

    auth.token = null;
    rerender({ ...options, authKey: null });
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
    expect(FakeSocket.instances[0].closedWith).toBe(1000);
    await waitFor(() =>
      expect(FakeSocket.instances[1].sent[0]).toEqual({
        type: 'auth',
        token: null,
      }),
    );
  });

  it('keeps the socket when the same player re-renders', async () => {
    auth.token = 'alice-token';
    const { result, rerender } = renderHook(
      (props) => useDiplomacyWebSocket(props),
      { initialProps: { ...options, authKey: 'user-alice' } },
    );
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    rerender({ ...options, authKey: 'user-alice', onGameUpdate: () => {} });
    await new Promise((r) => setTimeout(r, 10));
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.instances[0].closedWith).toBeNull();
  });

  it('closes the socket after 5 minutes of no user activity and reconnects on activity', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isIdleDisconnected).toBe(false);

    // User activity at 3 minutes resets the 5-minute idle timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      window.dispatchEvent(new Event('pointerdown'));
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    });
    expect(result.current.isConnected).toBe(true);
    expect(FakeSocket.instances[0].closedWith).toBeNull();

    // 2 more minutes (5 total since pointerdown) triggers idle disconnect without auto-reconnect.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1);
    });
    expect(FakeSocket.instances[0].closedWith).toBe(1000);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isIdleDisconnected).toBe(true);

    // No automatic reconnect while still idle.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    // Next user activity reconnects immediately and clears isIdleDisconnected.
    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeSocket.instances).toHaveLength(2);
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isIdleDisconnected).toBe(false);
  });

  it('uses exponential backoff capped at 30s on repeated unexpected closes', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    FakeSocket.autoOpen = false;

    renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (let i = 0; i < expectedDelays.length; i++) {
      const currentSocket = FakeSocket.instances[i];
      await act(async () => {
        currentSocket.close(1006);
        await vi.advanceTimersByTimeAsync(expectedDelays[i] - 1);
      });
      expect(FakeSocket.instances).toHaveLength(i + 1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(FakeSocket.instances).toHaveLength(i + 2);
    }
  });

  it('applies jitter to spread reconnect delays', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    FakeSocket.autoOpen = false;

    renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      FakeSocket.instances[0].close(1006);
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(FakeSocket.instances).toHaveLength(2);

    await act(async () => {
      FakeSocket.instances[1].close(1006);
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(FakeSocket.instances).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(FakeSocket.instances).toHaveLength(3);
  });

  it('resets the backoff attempt counter on successful onopen', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    FakeSocket.autoOpen = false;

    const { result } = renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Two failed attempts push backoff to 1000ms -> 2000ms.
    await act(async () => {
      FakeSocket.instances[0].close(1006);
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      FakeSocket.instances[1].close(1006);
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(FakeSocket.instances).toHaveLength(3);

    // The third attempt connects successfully, resetting backoff to attempt 0.
    await act(async () => {
      FakeSocket.instances[2].open();
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      FakeSocket.instances[2].close(1006);
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(FakeSocket.instances).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it('applies exponential backoff when WebSocket construction throws and resets on open', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    FakeSocket.throwOnConstruct = true;

    renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeSocket.instances).toHaveLength(0);

    // Attempt 0 fails -> waits 1000ms before retrying.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(FakeSocket.instances).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(FakeSocket.instances).toHaveLength(0);

    // Attempt 1 fails -> waits 2000ms; allow the next construction to succeed.
    FakeSocket.throwOnConstruct = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1999);
    });
    expect(FakeSocket.instances).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    // Opened successfully, so a subsequent drop starts back at 1000ms.
    await act(async () => {
      FakeSocket.instances[0].close(1006);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('does not reconnect on permanent close codes and cancels pending backoff on unmount', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);

    const { unmount } = renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    // Unexpected close schedules a retry, then unmount cancels it.
    await act(async () => {
      FakeSocket.instances[0].close(1006);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(FakeSocket.instances).toHaveLength(1);

    // Permanent close code never schedules a retry.
    const second = renderHook(() =>
      useDiplomacyWebSocket({ ...options, authKey: 'user-alice' }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(FakeSocket.instances).toHaveLength(2);
    await act(async () => {
      FakeSocket.instances[1].close(4004);
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(FakeSocket.instances).toHaveLength(2);
    second.unmount();
  });
});
