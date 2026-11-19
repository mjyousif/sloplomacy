import type { GameState, Order } from '../types/diplomacy';
import { turnLabel } from './timerHelpers';

export interface PendingOrder {
  seq: number;
  gameId: string;
  turn: string;
  order: Order;
}

/**
 * Optimistically apply a single unit or build-slot order to a GameState snapshot.
 * Mirrors the server's normalization, Winter Adjustments caps, and finalization withdrawal
 * so the map and sidebar update immediately before the server response returns.
 */
export function applyOptimisticOrder(
  state: GameState,
  order: Order,
): GameState {
  const orders = { ...state.orders };
  const isBuildSlot = order.unit_id.startsWith('BUILD_');

  let normalized: Order;
  if (!isBuildSlot) {
    const unit = state.units?.find((u) => u.id === order.unit_id);
    if (unit) {
      normalized = {
        ...order,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        ...(unit.unit_type === 'A' ? { target_coast: null } : {}),
      };
    } else {
      normalized = { ...order };
    }
  } else {
    normalized = {
      ...order,
      ...(order.unit_type === 'A' ? { origin_coast: null } : {}),
    };
  }

  orders[normalized.unit_id] = normalized;

  if (state.phase === 'Adjustments' && state.builds) {
    if (!isBuildSlot && normalized.order_type === 'DISBAND') {
      const bInfo = state.builds[normalized.power];
      const maxDisbands = bInfo && bInfo.count < 0 ? Math.abs(bInfo.count) : 0;
      if (maxDisbands > 0) {
        const otherDisbands = (state.units ?? []).filter(
          (u) =>
            u.power === normalized.power &&
            u.id !== normalized.unit_id &&
            orders[u.id]?.order_type === 'DISBAND',
        );
        while (1 + otherDisbands.length > maxDisbands) {
          const toKeep = otherDisbands.shift();
          if (!toKeep) break;
          orders[toKeep.id] = { ...orders[toKeep.id], order_type: 'HOLD' };
        }
      }
    } else if (isBuildSlot && normalized.order_type === 'BUILD') {
      const bInfo = state.builds[normalized.power];
      const homes = bInfo?.homes ?? [];
      const maxBuilds = Math.min(bInfo?.count ?? 0, homes.length);
      if (maxBuilds > 0) {
        const otherBuilds: Order[] = [];
        for (const home of homes) {
          const slotId = `BUILD_${normalized.power}_${home}`;
          if (
            slotId !== normalized.unit_id &&
            orders[slotId]?.order_type === 'BUILD'
          ) {
            otherBuilds.push(orders[slotId]);
          }
        }
        otherBuilds.sort(
          (a, b) => Number(a.is_explicit) - Number(b.is_explicit),
        );
        while (1 + otherBuilds.length > maxBuilds) {
          const toWaive = otherBuilds.shift();
          if (!toWaive) break;
          orders[toWaive.unit_id] = { ...toWaive, order_type: 'WAIVE' };
        }
      }
    }
  }

  const finalized_powers = state.finalized_powers?.includes(normalized.power)
    ? state.finalized_powers.filter((p) => p !== normalized.power)
    : state.finalized_powers;

  return {
    ...state,
    orders,
    finalized_powers,
  };
}

/**
 * Re-apply any still-pending local orders onto an authoritative server GameState.
 * Returns the exact `serverState` reference when no pending orders match so identity holds.
 */
export function rebasePendingOrders(
  serverState: GameState,
  pending: readonly PendingOrder[],
): GameState {
  const turn = turnLabel(serverState);
  const matching = pending.filter(
    (p) => p.gameId === serverState.game_id && p.turn === turn,
  );
  if (matching.length === 0) {
    return serverState;
  }
  return matching.reduce(
    (acc, entry) => applyOptimisticOrder(acc, entry.order),
    serverState,
  );
}

/**
 * True when `incoming` carries an older `state_revision` than `current` on the same game and turn.
 */
export function isStaleServerState(
  current: GameState | null,
  incoming: GameState,
): boolean {
  return (
    current !== null &&
    current.game_id === incoming.game_id &&
    turnLabel(current) === turnLabel(incoming) &&
    typeof incoming.state_revision === 'number' &&
    typeof current.state_revision === 'number' &&
    incoming.state_revision < current.state_revision
  );
}
