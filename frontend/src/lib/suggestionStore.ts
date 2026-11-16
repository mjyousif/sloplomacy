import type { Order, Power, PressMessage } from '../types/diplomacy';

/**
 * A move suggestion the player is writing: orders for units of the thread's members, the
 * player's own included. It is only a draft held here. Nothing in it reaches the server, or
 * the player's real orders, until it is sent as a press message.
 */
export interface SuggestionDraft {
  /** The other powers of the thread it will be sent to. */
  members: Power[];
  /** The turn it was started in, e.g. "Spring 1901 Movement". It ends when the turn does. */
  turn: string;
  /** True for an anonymous one-to-one backchannel, where only recipient units may be staged. */
  anonymous?: boolean;
  /** The suggested orders, by unit id. */
  orders: Record<string, Order>;
}

/**
 * What move suggestion is on the map: the one being written, or a received one being looked
 * at. Never both. Like `pressStore` it lives outside React, so the Press section (which starts
 * and sends it) and the game screen (which draws it) share it without props through App.
 */
export interface SuggestionState {
  draft: SuggestionDraft | null;
  viewing: PressMessage | null;
}

/** Puts the player's own part of a suggestion into their real orders. Resolves to an error text, or null. */
export type SuggestionAdopter = (orders: Order[]) => Promise<string | null>;

const EMPTY: SuggestionState = { draft: null, viewing: null };

let state: SuggestionState = EMPTY;
let adopter: SuggestionAdopter | null = null;
const listeners = new Set<() => void>();

function set(next: SuggestionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const suggestionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState(): SuggestionState {
    return state;
  },

  /** Starts writing a suggestion to a thread. It starts empty. */
  startDraft(members: Power[], turn: string, anonymous = false): void {
    set({
      draft: {
        members: [...members],
        turn,
        orders: {},
        ...(anonymous ? { anonymous: true } : {}),
      },
      viewing: null,
    });
  },
  /** Adds an order to the draft, or replaces the one its unit had. */
  stageOrder(order: Order): void {
    if (!state.draft) return;
    set({
      ...state,
      draft: {
        ...state.draft,
        orders: {
          ...state.draft.orders,
          [order.unit_id]: { ...order, is_explicit: true },
        },
      },
    });
  },
  removeOrder(unitId: string): void {
    if (!state.draft || !(unitId in state.draft.orders)) return;
    const orders = { ...state.draft.orders };
    delete orders[unitId];
    set({ ...state, draft: { ...state.draft, orders } });
  },

  /** Shows a received (or sent) suggestion on the map. */
  view(message: PressMessage): void {
    set({ draft: null, viewing: message });
  },

  /** Ends whatever is on the map: the draft is thrown away. */
  clear(): void {
    if (state.draft || state.viewing) set(EMPTY);
  },

  /** `useMatchActions` registers how orders are taken, since it holds the board. */
  setAdopter(next: SuggestionAdopter | null): void {
    adopter = next;
  },
  async adopt(orders: Order[]): Promise<string | null> {
    if (!adopter) return 'These orders cannot be used right now.';
    return adopter(orders);
  },

  /** For tests. */
  reset(): void {
    adopter = null;
    set(EMPTY);
  },
};
