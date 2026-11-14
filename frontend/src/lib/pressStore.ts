import type { Power, PressFeed, PressMessage } from '../types/diplomacy';
import {
  loadReadMarks,
  mergeMessages,
  saveReadMarks,
} from '../utils/pressHelpers';

/**
 * The press of the match on screen, for the seat the player holds. It lives outside React so
 * the game socket can add to it and the Press section, the collapsed rail and the phone's top
 * bar can all read it, without threading it through every component between them.
 */
export interface PressState {
  /** The match and seat the press belongs to, or null when there is none (lobby, sandbox). */
  gameId: string | null;
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

function inScope(gameId: string, power: Power): boolean {
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

  /** Starts showing a match's press for a seat. Another match or seat starts from empty. */
  open(gameId: string, power: Power): void {
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

  /** A whole feed from `GET /api/press` replaces what is held. */
  setFeed(gameId: string, feed: PressFeed): void {
    if (!inScope(gameId, feed.power)) return;
    set({
      ...state,
      messages: [...feed.messages].sort((a, b) => a.seq - b.seq),
      revealed: feed.revealed,
      status: 'ready',
    });
  },
  /** New messages, from the socket, a poll or the player's own post. */
  addMessages(gameId: string, power: Power, messages: PressMessage[]): void {
    if (!inScope(gameId, power)) return;
    const merged = mergeMessages(state.messages, messages);
    if (merged !== state.messages) set({ ...state, messages: merged });
  },
  setError(gameId: string, power: Power): void {
    if (inScope(gameId, power) && state.status === 'loading') {
      set({ ...state, status: 'error' });
    }
  },

  /** Marks a channel read up to a message. Reading never goes backwards. */
  markRead(channel: string, seq: number): void {
    if (state.gameId === null || state.power === null) return;
    if ((state.lastRead[channel] ?? 0) >= seq) return;
    const lastRead = { ...state.lastRead, [channel]: seq };
    saveReadMarks(state.gameId, state.power, lastRead);
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
