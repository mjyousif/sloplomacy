import type { Power, PressFeed, PressMessage } from '../types/diplomacy';
import {
  loadReadMarks,
  mergeMessages,
  readUpToNow,
  saveReadMarks,
} from '../utils/pressHelpers';

/**
 * The press of the match on screen, for the seat the player holds. It lives outside React so
 * the game socket can add to it and the Press section, the collapsed rail and the phone's top
 * bar can all read it, without threading it through every component between them.
 *
 * A spectator (watching with no seat) holds the match with `power` null: the server sends them
 * the public box alone, with `power` null on the feed and on socket pushes too.
 */
export interface PressState {
  /** The match the press belongs to, or null when there is none (lobby, sandbox). */
  gameId: string | null;
  /** The seat it is read from; null with a `gameId` is a spectator. */
  power: Power | null;
  messages: PressMessage[];
  /** True once the game is over and all press is shown. */
  revealed: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** How far the player has read each channel. */
  lastRead: Record<string, number>;
  /**
   * The countries the next message goes to privately; empty is the public box. It is here
   * because they are picked on the Diplomatic Standing rows, outside the Press section.
   */
  recipients: Power[];
  /** Whether the game socket is up. While it is down the press is polled. */
  socketOpen: boolean;
}

const EMPTY: PressState = {
  gameId: null,
  power: null,
  messages: [],
  revealed: false,
  status: 'idle',
  lastRead: {},
  recipients: [],
  socketOpen: false,
};

let state: PressState = EMPTY;
const listeners = new Set<() => void>();

function set(next: PressState): void {
  state = next;
  for (const listener of listeners) listener();
}

function inScope(gameId: string, power: Power | null): boolean {
  return state.gameId === gameId && state.power === power;
}

export const pressStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState(): PressState {
    return state;
  },

  /**
   * Starts showing a match's press for a seat, or for a spectator with `power` null. Another
   * match or seat starts from empty.
   */
  open(gameId: string, power: Power | null): void {
    if (inScope(gameId, power)) return;
    set({
      ...EMPTY,
      gameId,
      power,
      status: 'loading',
      lastRead: loadReadMarks(gameId, power),
      socketOpen: state.socketOpen,
    });
  },
  close(): void {
    if (state.gameId === null) return;
    set({ ...EMPTY, socketOpen: state.socketOpen });
  },

  /**
   * A whole feed from `GET /api/press` replaces what is held. Once the press is revealed it is
   * numbered for the whole game, so the read marks switch to that numbering; the first time,
   * everything held is marked read rather than the whole revealed history counted as unread.
   */
  setFeed(gameId: string, feed: PressFeed): void {
    if (!inScope(gameId, feed.power)) return;
    const messages = [...feed.messages].sort((a, b) => a.seq - b.seq);
    let lastRead = state.lastRead;
    if (feed.revealed !== state.revealed) {
      lastRead = loadReadMarks(gameId, feed.power, feed.revealed);
      if (feed.revealed && Object.keys(lastRead).length === 0) {
        lastRead = readUpToNow(messages);
        saveReadMarks(gameId, feed.power, lastRead, true);
      }
    }
    set({
      ...state,
      messages,
      revealed: feed.revealed,
      lastRead,
      status: 'ready',
    });
  },
  /** New messages, from the socket, a poll or the player's own post. */
  addMessages(
    gameId: string,
    power: Power | null,
    messages: PressMessage[],
  ): void {
    if (!inScope(gameId, power)) return;
    const merged = mergeMessages(state.messages, messages);
    if (merged !== state.messages) set({ ...state, messages: merged });
  },
  setError(gameId: string, power: Power | null): void {
    if (inScope(gameId, power) && state.status === 'loading') {
      set({ ...state, status: 'error' });
    }
  },

  /** Marks a channel read up to a message. Reading never goes backwards. */
  markRead(channel: string, seq: number): void {
    if (state.gameId === null) return;
    if ((state.lastRead[channel] ?? 0) >= seq) return;
    const lastRead = { ...state.lastRead, [channel]: seq };
    saveReadMarks(state.gameId, state.power, lastRead, state.revealed);
    set({ ...state, lastRead });
  },

  setRecipients(recipients: Power[]): void {
    if (state.power === null) return;
    set({ ...state, recipients: recipients.filter((p) => p !== state.power) });
  },
  /** Adds a country to the next message's recipients, or takes it off. */
  toggleRecipient(power: Power): void {
    pressStore.setRecipients(
      state.recipients.includes(power)
        ? state.recipients.filter((p) => p !== power)
        : [...state.recipients, power],
    );
  },

  setSocketOpen(open: boolean): void {
    if (state.socketOpen !== open) set({ ...state, socketOpen: open });
  },

  /** For tests. */
  reset(): void {
    set(EMPTY);
  },
};
