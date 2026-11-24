import {
  ALL_POWERS,
  type Order,
  type Power,
  type TurnHistoryEntry,
} from '../types/diplomacy';

export { sameTurn } from './turnFormat';

/**
 * The turn one step from `current` (null = the live turn, which sits after the newest entry).
 * Returns null for the live turn, and stays put at the oldest entry.
 */
export function stepTurn(
  entries: TurnHistoryEntry[],
  current: number | null,
  delta: -1 | 1,
): number | null {
  if (entries.length === 0) return null;
  const position = current ?? entries.length;
  const next = Math.max(0, position + delta);
  return next >= entries.length ? null : next;
}

export type HistoryMovementActionType = 'HOLD' | 'SUPPORT' | 'CONVOY' | 'MOVE';
export type HistoryAdjustmentActionType = 'BUILD' | 'DISBAND' | 'WAIVE';
export type HistoryActionType =
  | HistoryMovementActionType
  | HistoryAdjustmentActionType;

export const ALL_HISTORY_ACTIONS: readonly HistoryMovementActionType[] = [
  'HOLD',
  'SUPPORT',
  'CONVOY',
  'MOVE',
];

export const ALL_ADJUSTMENT_ACTIONS: readonly HistoryAdjustmentActionType[] = [
  'BUILD',
  'DISBAND',
  'WAIVE',
];

function toggleFilterItem<T>(
  selected: readonly T[],
  item: T,
  allItems: readonly T[],
): T[] {
  const nextSet = new Set(selected);
  if (nextSet.has(item)) {
    nextSet.delete(item);
  } else {
    nextSet.add(item);
  }
  if (nextSet.size === 0 || nextSet.size === allItems.length) {
    return [];
  }
  return allItems.filter((candidate) => nextSet.has(candidate));
}

/** Empty `selectedPowers` means every nation is visible. */
export function matchesHistoryPowers(
  power: Power,
  selectedPowers: readonly Power[],
): boolean {
  return selectedPowers.length === 0 || selectedPowers.includes(power);
}

/** Toggle a nation in/out of the active history filter, ordered canonically. */
export function toggleHistoryPower(
  selectedPowers: readonly Power[],
  power: Power,
): Power[] {
  return toggleFilterItem(selectedPowers, power, ALL_POWERS);
}

/** Empty `selectedActions` means every movement action type is visible. */
export function matchesHistoryActions(
  orderType: Order['order_type'] | undefined,
  selectedActions: readonly HistoryActionType[],
): boolean {
  if (selectedActions.length === 0) return true;
  const effective = orderType ?? 'HOLD';
  return selectedActions.includes(effective as HistoryActionType);
}

/** Toggle an action in/out of the active history filter, ordered canonically for the current phase. */
export function toggleHistoryAction(
  selectedActions: readonly HistoryActionType[],
  action: HistoryActionType,
  availableActions: readonly HistoryActionType[] = ALL_HISTORY_ACTIONS,
): HistoryActionType[] {
  return toggleFilterItem(selectedActions, action, availableActions);
}

/** A past turn's build and disband orders for selected nations and actions, or for all of them. */
export function adjustmentOrdersFor(
  orders: Record<string, Order>,
  powers: readonly Power[],
  actions: readonly HistoryActionType[] = [],
): Order[] {
  return Object.values(orders).filter(
    (o) =>
      (o.order_type === 'BUILD' || o.order_type === 'DISBAND') &&
      matchesHistoryPowers(o.power, powers) &&
      matchesHistoryActions(o.order_type, actions),
  );
}
