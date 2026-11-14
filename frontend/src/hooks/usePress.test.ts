// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pressStore } from '../lib/pressStore';
import type { Power, PressFeed, PressMessage } from '../types/diplomacy';
import {
  PRESS_POLL_MS,
  sendPress,
  usePressBadge,
  usePressSync,
} from './usePress';

const authedFetch = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ authedFetch }));

const msg = (seq: number, sender: Power | null = 'GERMANY'): PressMessage => ({
  id: `m${seq}`,
  seq,
  sender,
  anonymous: false,
  recipients: [],
  body: `message ${seq}`,
  sent_at: '2026-11-13T12:00:00+00:00',
  season: 'Spring',
  year: 1901,
  phase: 'Movement',
});

const feed = (messages: PressMessage[], revealed = false): PressFeed => ({
  power: 'FRANCE',
  revealed,
  messages,
});

const answer = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: async () => body } as Response);

const urls = () => authedFetch.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  localStorage.clear();
  pressStore.reset();
  authedFetch.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('usePressSync', () => {
  it('reads the press of the match for the seat on screen', async () => {
    authedFetch.mockReturnValue(answer(feed([msg(1)])));
    renderHook(() =>
      usePressSync({ gameId: 'g1', power: 'FRANCE', gameOver: false }),
    );
    await waitFor(() => expect(pressStore.getState().status).toBe('ready'));
    expect(urls()[0]).toBe('/api/press?game_id=g1&power=FRANCE');
    expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([1]);
  });

  it('holds nothing without a match or a seat, and lets go on unmount', async () => {
    authedFetch.mockReturnValue(answer(feed([msg(1)])));
    const { rerender, unmount } = renderHook(
      (props: { gameId: string | null }) =>
        usePressSync({
          gameId: props.gameId,
          power: 'FRANCE',
          gameOver: false,
        }),
      { initialProps: { gameId: null as string | null } },
    );
    expect(authedFetch).not.toHaveBeenCalled();
    expect(pressStore.getState().power).toBeNull();

    rerender({ gameId: 'g1' });
    await waitFor(() => expect(pressStore.getState().status).toBe('ready'));
    unmount();
    expect(pressStore.getState().gameId).toBeNull();
    expect(pressStore.getState().messages).toEqual([]);
  });

  it('reads everything again when the game ends, because all press is revealed', async () => {
    authedFetch.mockReturnValueOnce(answer(feed([msg(1)])));
    const { rerender } = renderHook(
      (props: { gameOver: boolean }) =>
        usePressSync({
          gameId: 'g1',
          power: 'FRANCE',
          gameOver: props.gameOver,
        }),
      { initialProps: { gameOver: false } },
    );
    await waitFor(() => expect(pressStore.getState().status).toBe('ready'));

    authedFetch.mockReturnValueOnce(
      answer(feed([msg(1), msg(2, 'ITALY')], true)),
    );
    rerender({ gameOver: true });
    await waitFor(() => expect(pressStore.getState().revealed).toBe(true));
    expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([1, 2]);
  });

  it('drops a feed that answers for a seat the player has since left', async () => {
    let release: (value: Response) => void = () => {};
    authedFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    );
    const { rerender } = renderHook(
      (props: { gameId: string }) =>
        usePressSync({
          gameId: props.gameId,
          power: 'FRANCE',
          gameOver: false,
        }),
      { initialProps: { gameId: 'g1' } },
    );
    authedFetch.mockReturnValueOnce(answer(feed([msg(7)])));
    rerender({ gameId: 'g2' });
    await waitFor(() => expect(pressStore.getState().status).toBe('ready'));
    await act(async () => {
      release({
        ok: true,
        status: 200,
        json: async () => feed([msg(1)]),
      } as Response);
    });
    expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([7]);
  });

  it('catches up from the newest message held when the socket comes back', async () => {
    authedFetch.mockReturnValueOnce(answer(feed([msg(1), msg(2)])));
    renderHook(() =>
      usePressSync({ gameId: 'g1', power: 'FRANCE', gameOver: false }),
    );
    await waitFor(() => expect(pressStore.getState().status).toBe('ready'));

    authedFetch.mockReturnValueOnce(answer(feed([msg(3)])));
    act(() => pressStore.setSocketOpen(true));
    await waitFor(() =>
      expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([
        1, 2, 3,
      ]),
    );
    expect(urls()[1]).toBe('/api/press?game_id=g1&power=FRANCE&after=2');
  });

  it('polls while the socket is down, and stops once it is up', async () => {
    vi.useFakeTimers();
    authedFetch.mockImplementation(() => answer(feed([])));
    renderHook(() =>
      usePressSync({ gameId: 'g1', power: 'FRANCE', gameOver: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(authedFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESS_POLL_MS);
    });
    expect(authedFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      pressStore.setSocketOpen(true);
      await vi.advanceTimersByTimeAsync(0);
    });
    const afterReconnect = authedFetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESS_POLL_MS * 3);
    });
    expect(authedFetch).toHaveBeenCalledTimes(afterReconnect);
  });

  it('reports a failed first read, and tries again on the next poll', async () => {
    vi.useFakeTimers();
    authedFetch.mockReturnValueOnce(answer({}, false, 503));
    renderHook(() =>
      usePressSync({ gameId: 'g1', power: 'FRANCE', gameOver: false }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(pressStore.getState().status).toBe('error');

    authedFetch.mockReturnValueOnce(answer(feed([msg(1)])));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRESS_POLL_MS);
    });
    expect(pressStore.getState().status).toBe('ready');
  });
});

describe('press store', () => {
  it('ignores socket press for another match or seat', () => {
    pressStore.open('g1', 'FRANCE');
    pressStore.addMessages('g2', 'FRANCE', [msg(1)]);
    pressStore.addMessages('g1', 'GERMANY', [msg(2)]);
    expect(pressStore.getState().messages).toEqual([]);
    pressStore.addMessages('g1', 'FRANCE', [msg(3)]);
    expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([3]);
  });

  it('remembers how far each channel was read, and never moves a mark back', () => {
    pressStore.open('g1', 'FRANCE');
    pressStore.markRead('public', 5);
    pressStore.markRead('public', 2);
    expect(pressStore.getState().lastRead).toEqual({ public: 5 });
    pressStore.close();
    pressStore.open('g1', 'FRANCE');
    expect(pressStore.getState().lastRead).toEqual({ public: 5 });
  });
});

describe('press recipients', () => {
  it('are picked per match and seat, never include the player, and reset on leaving', () => {
    pressStore.toggleRecipient('GERMANY');
    expect(pressStore.getState().recipients).toEqual([]);

    pressStore.open('g1', 'FRANCE');
    pressStore.toggleRecipient('GERMANY');
    pressStore.toggleRecipient('FRANCE');
    pressStore.toggleRecipient('ITALY');
    expect(pressStore.getState().recipients).toEqual(['GERMANY', 'ITALY']);
    pressStore.toggleRecipient('GERMANY');
    expect(pressStore.getState().recipients).toEqual(['ITALY']);

    pressStore.open('g2', 'FRANCE');
    expect(pressStore.getState().recipients).toEqual([]);
  });
});

describe('usePressBadge', () => {
  it('counts unread press, and is off where there is no press', () => {
    const { result } = renderHook(() => usePressBadge());
    expect(result.current).toEqual({ enabled: false, unread: 0 });
    act(() => {
      pressStore.open('g1', 'FRANCE');
      pressStore.addMessages('g1', 'FRANCE', [
        msg(1),
        msg(2),
        msg(3, 'FRANCE'),
      ]);
    });
    expect(result.current).toEqual({ enabled: true, unread: 2 });
    act(() => pressStore.markRead('public', 3));
    expect(result.current.unread).toBe(0);
  });
});

describe('sendPress', () => {
  it('posts as the seat and shows the message at once', async () => {
    pressStore.open('g1', 'FRANCE');
    authedFetch.mockReturnValueOnce(answer(msg(4, 'FRANCE')));
    await sendPress('g1', {
      power: 'FRANCE',
      recipients: ['GERMANY'],
      anonymous: false,
      body: 'Hello',
    });
    const [url, init] = authedFetch.mock.calls[0];
    expect(url).toBe('/api/press?game_id=g1');
    expect(JSON.parse(init.body)).toEqual({
      power: 'FRANCE',
      recipients: ['GERMANY'],
      anonymous: false,
      body: 'Hello',
    });
    expect(pressStore.getState().messages.map((m) => m.seq)).toEqual([4]);
  });

  it("fails with the server's reason", async () => {
    authedFetch.mockReturnValueOnce(
      answer(
        { detail: 'You are sending messages too quickly. Wait a moment.' },
        false,
        429,
      ),
    );
    await expect(
      sendPress('g1', {
        power: 'FRANCE',
        recipients: [],
        anonymous: false,
        body: 'x',
      }),
    ).rejects.toThrow('too quickly');
  });
});
