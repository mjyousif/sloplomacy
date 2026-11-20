import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { type PressState, pressStore } from '../lib/pressStore';
import { authedFetch } from '../lib/supabase';
import type {
  Power,
  PressFeed,
  PressMessage,
  PressPostRequest,
} from '../types/diplomacy';
import { totalUnread } from '../utils/pressHelpers';

/** How often the press is re-read while the game socket is down. */
export const PRESS_POLL_MS = 15000;

/** Where a feed is read from: a seat, or a spectator (`power` null) with a match's passcode. */
interface PressReader {
  gameId: string;
  power: Power | null;
  passcode?: string | null;
}

async function readPress(
  { gameId, power, passcode }: PressReader,
  after = 0,
): Promise<PressFeed> {
  const params = new URLSearchParams({ game_id: gameId });
  // A spectator names no power: a seat named without holding it is refused.
  if (power) params.set('power', power);
  if (after > 0) params.set('after', String(after));
  const res = await authedFetch(`/api/press?${params.toString()}`, {
    headers: !power && passcode ? { 'X-Passcode': passcode } : undefined,
  });
  if (!res.ok) throw new Error(`Press read failed: HTTP ${res.status}`);
  return res.json();
}

/** Fetches what arrived after the newest message held, e.g. while the socket was down. */
async function catchUp(reader: PressReader): Promise<void> {
  const { gameId, power } = reader;
  const held = pressStore.getState();
  if (held.gameId !== gameId || held.power !== power) return;
  // The first read is still on its way and will bring everything.
  if (held.status === 'loading') return;
  if (held.status !== 'ready') {
    await loadAll(reader);
    return;
  }
  const last = held.messages.length
    ? held.messages[held.messages.length - 1].seq
    : 0;
  try {
    const feed = await readPress(reader, last);
    pressStore.addMessages(gameId, power, feed.messages);
  } catch {
    // The next poll or socket message tries again.
  }
}

async function loadAll(reader: PressReader): Promise<void> {
  try {
    pressStore.setFeed(reader.gameId, await readPress(reader));
  } catch {
    pressStore.setError(reader.gameId, reader.power);
  }
}

/**
 * Sends a message and adds it to the press shown. Throws an Error holding the server's reason
 * when it is refused.
 */
export async function sendPress(
  gameId: string,
  request: PressPostRequest,
): Promise<PressMessage> {
  const res = await authedFetch(
    `/api/press?game_id=${encodeURIComponent(gameId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  if (!res.ok) {
    let detail = 'The message could not be sent.';
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
    } catch {
      // Keep the generic reason.
    }
    throw new Error(detail);
  }
  const message: PressMessage = await res.json();
  pressStore.addMessages(gameId, request.power, [message]);
  return message;
}

const readSocketOpen = () => pressStore.getState().socketOpen;

export interface PressSyncOptions {
  /** The match, or null when the screen has no press (a sandbox). */
  gameId: string | null;
  /** The seat, or null for a spectator, who reads the public box alone. */
  power: Power | null;
  /** Whether the game is over. All press is shown then, so it is read again. */
  gameOver: boolean;
  /** A private match's passcode, which a spectator needs to read its press. */
  passcode?: string | null;
}

/**
 * Keeps the press store filled for the match and seat on screen: reads it when they change
 * or the game ends, catches up when the socket comes back, and polls while it is down.
 * New messages otherwise arrive on the game socket (see `useDiplomacyWebSocket`).
 */
export function usePressSync({
  gameId,
  power,
  gameOver,
  passcode = null,
}: PressSyncOptions) {
  const socketOpen = useSyncExternalStore(
    pressStore.subscribe,
    readSocketOpen,
    readSocketOpen,
  );

  // `gameOver` is not read below: it is what makes the feed load again once all is revealed.
  useEffect(() => {
    if (!gameId) {
      pressStore.close();
      return;
    }
    pressStore.open(gameId, power);
    loadAll({ gameId, power, passcode });
  }, [gameId, power, gameOver, passcode]);

  useEffect(() => () => pressStore.close(), []);

  useEffect(() => {
    if (!gameId) return;
    if (socketOpen) {
      catchUp({ gameId, power, passcode });
      return;
    }
    const timer = window.setInterval(() => {
      if (
        typeof document === 'undefined' ||
        document.visibilityState !== 'hidden'
      ) {
        catchUp({ gameId, power, passcode });
      }
    }, PRESS_POLL_MS);
    return () => clearInterval(timer);
  }, [gameId, power, socketOpen, passcode]);
}

export function usePressState(): PressState {
  return useSyncExternalStore(
    pressStore.subscribe,
    pressStore.getState,
    pressStore.getState,
  );
}

/** Whether this screen has press, and how many unread messages wait in it. */
export function usePressBadge(): { enabled: boolean; unread: number } {
  const { gameId, power, messages, lastRead } = usePressState();
  return useMemo(
    () => ({
      enabled: gameId !== null,
      unread: gameId ? totalUnread(messages, power, lastRead) : 0,
    }),
    [gameId, power, messages, lastRead],
  );
}
