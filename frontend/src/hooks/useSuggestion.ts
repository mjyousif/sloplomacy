import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SuggestionMapMode } from '../components/EuropeMap';
import { type SuggestionState, suggestionStore } from '../lib/suggestionStore';
import {
  ALL_POWERS,
  type GameState,
  type Order,
  POWER_METADATA,
  type Power,
  type PressMessage,
} from '../types/diplomacy';
import { holdOrder, waiveOrder } from '../utils/orderBuilders';
import { isOrderIncomplete } from '../utils/orderHelpers';
import { turnLabel } from '../utils/timerHelpers';

export function useSuggestionState(): SuggestionState {
  return useSyncExternalStore(
    suggestionStore.subscribe,
    suggestionStore.getState,
    suggestionStore.getState,
  );
}

const nameOf = (power: Power) => POWER_METADATA[power]?.shortName ?? power;

/** Whether a message's suggestion is for the turn being played, so it can still be used. */
export function isSuggestionCurrent(
  message: Pick<PressMessage, 'season' | 'year' | 'phase'>,
  game: Pick<GameState, 'season' | 'year' | 'phase'>,
): boolean {
  return (
    message.season === game.season &&
    message.year === game.year &&
    message.phase === game.phase
  );
}

/** The orders of a draft that are finished and can be sent. */
export function finishedOrders(orders: Record<string, Order>): Order[] {
  return Object.values(orders).filter((order) => !isOrderIncomplete(order));
}

/** The suggestion on the map, as the game screen draws it. */
export interface SuggestionBoard {
  mode: 'draft' | 'view';
  /** Said after "Viewing", e.g. "your suggestion to Germany". */
  label: string;
  /** Every unit's order as the map should hold it: the suggestion's, and a plain hold otherwise. */
  orders: Record<string, Order>;
  map: SuggestionMapMode;
  /** How many orders the suggestion holds. */
  count: number;
  /** The orders in it for the player's own units, which they could take. */
  mine: Order[];
  /** Draft only: gives a unit of the thread its suggested order. */
  stage: (order: Order) => void;
}

export interface SuggestionBoardOptions {
  gameState: GameState;
  /** The player's seat, or null where there is no press (a sandbox, a spectator). */
  power: Power | null;
  /** The board is showing something else: Hypothetical Mode, Direct-Edit or a past turn. */
  blocked: boolean;
}

/**
 * Swaps an order suggestion onto the board, the way a past turn is: while one is being written or
 * looked at, the map holds its orders instead of the player's own, which are left untouched.
 * It ends by itself when the turn resolves, the game is over, or the board is needed for
 * something else.
 */
export function useSuggestionBoard({
  gameState,
  power,
  blocked,
}: SuggestionBoardOptions): SuggestionBoard | null {
  const { draft, viewing } = useSuggestionState();
  const turn = turnLabel(gameState);
  const usable =
    (power !== null || viewing !== null) && !blocked && !gameState.winner;
  const stale =
    (draft !== null && draft.turn !== turn) ||
    (viewing !== null && !isSuggestionCurrent(viewing, gameState));
  const active =
    (draft !== null || viewing !== null) &&
    usable &&
    !stale &&
    !(draft !== null && power === null);

  useEffect(() => {
    if ((draft || viewing) && !active) suggestionStore.clear();
  }, [draft, viewing, active]);
  // Leaving the game screen ends it too.
  useEffect(() => () => suggestionStore.clear(), []);

  const units = gameState.units;
  const phase = gameState.phase;
  const builds = gameState.builds;
  return useMemo(() => {
    if (!active) return null;
    if (draft && power === null) return null;
    const suggested = draft ? Object.values(draft.orders) : viewing?.orders;
    if (!suggested) return null;
    const members = draft
      ? draft.members.length === 0
        ? [...ALL_POWERS]
        : draft.anonymous
          ? [...draft.members]
          : [power as Power, ...draft.members]
      : [];
    const byUnit = new Map(suggested.map((order) => [order.unit_id, order]));
    const orders: Record<string, Order> = {};
    const unitIds = new Set<string>();
    const mine: Order[] = [];
    for (const unit of units) {
      const order = byUnit.get(unit.id);
      const validForPhase =
        phase === 'Retreats'
          ? Boolean(unit.is_dislodged) &&
            (order?.order_type === 'RETREAT' || order?.order_type === 'DISBAND')
          : phase === 'Adjustments'
            ? order?.order_type === 'DISBAND'
            : true;
      // A unit that has moved or gone since (a host's edit) is left out.
      if (order && order.origin === unit.province && validForPhase) {
        orders[unit.id] = order;
        unitIds.add(unit.id);
        if (power && unit.power === power) mine.push(order);
      } else {
        orders[unit.id] = { ...holdOrder(unit), is_explicit: false };
      }
    }
    if (phase === 'Adjustments' && builds) {
      for (const [pwrStr, bInfo] of Object.entries(builds)) {
        if (bInfo.count <= 0) continue;
        for (const home of bInfo.homes) {
          const slotId = `BUILD_${pwrStr}_${home}`;
          const order = byUnit.get(slotId);
          if (
            order &&
            order.origin === home &&
            (order.order_type === 'BUILD' || order.order_type === 'WAIVE')
          ) {
            orders[slotId] = order;
            unitIds.add(slotId);
            if (power && pwrStr === power) mine.push(order);
          } else if (draft && members.includes(pwrStr as Power)) {
            orders[slotId] = {
              ...waiveOrder(slotId, pwrStr as Power, home),
              is_explicit: false,
            };
          }
        }
      }
    }
    if (draft) {
      const label =
        draft.members.length === 0
          ? draft.anonymous
            ? 'your anonymous public suggestion'
            : 'your public suggestion'
          : draft.anonymous
            ? `your anonymous suggestion to ${draft.members.map(nameOf).join(', ')}`
            : `your suggestion to ${draft.members.map(nameOf).join(', ')}`;
      return {
        mode: 'draft' as const,
        label,
        orders,
        map: { editablePowers: members, unitIds },
        count: unitIds.size,
        mine,
        stage: (order: Order) => {
          if (!members.includes(order.power)) return;
          if (
            phase === 'Adjustments' &&
            order.order_type === 'HOLD' &&
            !order.unit_id.startsWith('BUILD_')
          ) {
            suggestionStore.removeOrder(order.unit_id);
            return;
          }
          suggestionStore.stageOrder(order);
        },
      };
    }
    const sender = viewing?.sender ?? null;
    return {
      mode: 'view' as const,
      label:
        sender === null
          ? 'anonymous suggestion'
          : sender === power
            ? 'your suggestion'
            : `${nameOf(sender)}'s suggestion`,
      orders,
      map: { editablePowers: null, unitIds },
      count: unitIds.size,
      mine,
      stage: () => {},
    };
  }, [active, power, draft, viewing, units, phase, builds]);
}
