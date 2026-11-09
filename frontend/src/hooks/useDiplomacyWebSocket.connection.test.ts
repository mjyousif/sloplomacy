// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
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
  readyState = 0;
  sent: unknown[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    });
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
  auth.token = null;
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
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
});
