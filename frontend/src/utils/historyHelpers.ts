import type { Order, Power, TurnHistoryEntry } from '../types/diplomacy';

type TurnLike = Pick<TurnHistoryEntry, 'season' | 'year' | 'phase'>;

/** "F1901 M", for the phone's map pill. */
export function shortTurnLabel(turn: TurnLike): string {
  return `${turn.season.charAt(0)}${turn.year} ${turn.phase.charAt(0)}`;
}

/** Same phase of the same year, so a turn can be found again after the list is refetched. */
export function sameTurn(a: TurnLike, b: TurnLike): boolean {
  return a.season === b.season && a.year === b.year && a.phase === b.phase;
}

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

/** A past turn's build and disband orders for one power, or for all of them. */
export function adjustmentOrdersFor(
  orders: Record<string, Order>,
  power: Power | null,
): Order[] {
  return Object.values(orders).filter(
    (o) =>
      (o.order_type === 'BUILD' || o.order_type === 'DISBAND') &&
      (power === null || o.power === power),
  );
}
