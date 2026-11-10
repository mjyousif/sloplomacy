import type { Order, Unit } from '../types/diplomacy';

/**
 * The orders a player gives a unit, built the one way the map, its menus and the order cards
 * all send them: explicit, never a convoy route unless asked, and with the unit's own power,
 * type and position. Each keeps the exact fields (and field order) the hand-written literals
 * had, so the request bodies don't change.
 */

const fromUnit = (unit: Unit) => ({
  unit_id: unit.id,
  power: unit.power,
  unit_type: unit.unit_type,
  origin: unit.province,
  origin_coast: unit.coast,
});

/** Hold in place (also how a unit is kept in a winter adjustment). */
export const holdOrder = (unit: Unit): Order => ({
  ...fromUnit(unit),
  order_type: 'HOLD',
  target: null,
  target_coast: null,
  aux_unit_origin: null,
  via_convoy: false,
  is_explicit: true,
});

/** Move to `target`. An army sent somewhere it can't walk goes by convoy. */
export const moveOrder = (
  unit: Unit,
  target: string,
  targetCoast: string | null,
  viaConvoy: boolean,
): Order => ({
  ...fromUnit(unit),
  order_type: 'MOVE',
  target,
  target_coast: targetCoast,
  aux_unit_origin: null,
  via_convoy: viaConvoy,
  is_explicit: true,
});

/** A dislodged unit retreats to `target`. */
export const retreatOrder = (
  unit: Unit,
  target: string,
  targetCoast: string | null,
): Order => ({
  ...fromUnit(unit),
  order_type: 'RETREAT',
  target,
  target_coast: targetCoast,
  aux_unit_origin: null,
  via_convoy: false,
  is_explicit: true,
});

/**
 * Support the unit in `supportedOrigin` into `target`. A target equal to its origin is a
 * support to hold.
 */
export const supportOrder = (
  unit: Unit,
  supportedOrigin: string,
  target: string,
): Order => ({
  ...fromUnit(unit),
  order_type: 'SUPPORT',
  aux_unit_origin: supportedOrigin,
  target,
  via_convoy: false,
  is_explicit: true,
});

/** A fleet convoys the army in `armyOrigin` to `target`. */
export const convoyOrder = (
  unit: Unit,
  armyOrigin: string,
  target: string,
): Order => ({
  ...fromUnit(unit),
  order_type: 'CONVOY',
  aux_unit_origin: armyOrigin,
  target,
  via_convoy: false,
  is_explicit: true,
});
