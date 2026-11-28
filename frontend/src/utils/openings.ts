import { OPENINGS, type Opening } from '../data/openings';
import type { Order, Power, Unit } from '../types/diplomacy';
import { holdOrder, moveOrder, supportOrder } from './orderBuilders';

/** The turn the openings are for: the very first one. */
export function isOpeningTurn(turn: {
  season: string;
  year: number;
  phase: string;
}): boolean {
  return (
    turn.season === 'Spring' && turn.year === 1901 && turn.phase === 'Movement'
  );
}

/** A power's openings, most often played first; those with no figure come last. */
export function openingsFor(power: Power): Opening[] {
  return OPENINGS.filter((o) => o.power === power)
    .map((o, i) => ({ o, i }))
    .sort(
      (a, b) => (b.o.popularity ?? -1) - (a.o.popularity ?? -1) || a.i - b.i,
    )
    .map(({ o }) => o);
}

/** "STP/SC" -> ["STP", "SC"], "LON" -> ["LON", null]. */
function splitCoast(loc: string): [string, string | null] {
  const [province, coast] = loc.split('/');
  return [province, coast ?? null];
}

/**
 * One order written the adjudicator's way (`A VEN - TYR`, `A MAR S A PAR - BUR`, `A VEN H`),
 * as an order for the unit of `power` that stands there. Null when no such unit is on the
 * board (a host has edited it) or the text is not an order we know.
 */
export function parseOpeningOrder(
  text: string,
  power: Power,
  units: Unit[],
): Order | null {
  const parts = text.trim().split(/\s+/);
  const [type, loc, verb, ...rest] = parts;
  const [origin] = splitCoast(loc ?? '');
  const unit = units.find(
    (u) =>
      u.power === power &&
      u.unit_type === type &&
      u.province === origin &&
      !u.is_dislodged,
  );
  if (!unit) return null;
  if (verb === 'H' && rest.length === 0) return holdOrder(unit);
  if (verb === '-' && rest.length === 1) {
    const [target, coast] = splitCoast(rest[0]);
    return moveOrder(unit, target, coast, false);
  }
  if (verb === 'S') {
    // S A PAR - BUR (support a move) or S A PAR (support a hold).
    const [, supported, dash, dest] = rest;
    if (!supported) return null;
    const [supportedOrigin] = splitCoast(supported);
    if (dash === '-' && dest) {
      return supportOrder(unit, supportedOrigin, splitCoast(dest)[0]);
    }
    if (dash === undefined)
      return supportOrder(unit, supportedOrigin, supportedOrigin);
  }
  return null;
}

/**
 * An opening's orders for the board as it stands, or null when any of them has no unit to
 * give it to: the opening no longer fits, so it is offered but cannot be shown or used.
 */
export function openingOrders(opening: Opening, units: Unit[]): Order[] | null {
  const orders: Order[] = [];
  for (const text of opening.orders) {
    const order = parseOpeningOrder(text, opening.power, units);
    if (!order) return null;
    orders.push(order);
  }
  return orders;
}
