import type {
  Order,
  OrderType,
  Power,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
  UnitType,
} from '../types/diplomacy';
import {
  canUnitSupportInto,
  getReachableDestinations,
  getValidRetreatDestinations,
} from './orderHelpers';

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

/** Disband: a dislodged unit that won't retreat, or a unit given up in a winter adjustment. */
export const disbandOrder = (unit: Unit): Order => ({
  ...fromUnit(unit),
  order_type: 'DISBAND',
  target: null,
  target_coast: null,
  aux_unit_origin: null,
  via_convoy: false,
  is_explicit: true,
});

/** Build an army or a fleet (on `coast`, for a split-coast home) in a winter build slot. */
export const buildOrder = (
  slotId: string,
  power: Power,
  home: string,
  unitType: UnitType,
  coast: string | null,
): Order => ({
  unit_id: slotId,
  power,
  unit_type: unitType,
  origin: home,
  origin_coast: coast,
  order_type: 'BUILD',
  via_convoy: false,
  is_explicit: true,
});

/** Leave a winter build slot empty. */
export const waiveOrder = (
  slotId: string,
  power: Power,
  home: string,
): Order => ({
  unit_id: slotId,
  power,
  unit_type: 'A',
  origin: home,
  origin_coast: null,
  order_type: 'WAIVE',
  via_convoy: false,
  is_explicit: true,
});

/** Build the initial explicit order when a player switches a unit's order type in the sidebar. */
export function buildDefaultOrderForType({
  unit,
  newType,
  provinces,
  units,
  orders,
  retreats,
  unitOptions = null,
}: {
  unit: Unit;
  newType: OrderType;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  retreats?: Record<Power, Record<string, string[]>> | null;
  unitOptions?: UnitMoveOptions | null;
}): Order | null {
  if (newType === 'RETREAT') {
    const validRetreats = getValidRetreatDestinations(
      unit,
      retreats,
      provinces,
      unitOptions,
    );
    const firstRet = validRetreats[0];
    return {
      ...fromUnit(unit),
      order_type: 'RETREAT',
      target: firstRet ? firstRet.province : null,
      target_coast:
        firstRet && firstRet.coasts.length === 1 ? firstRet.coasts[0] : null,
      aux_unit_origin: null,
      via_convoy: false,
      is_explicit: true,
    };
  }

  if (newType === 'DISBAND') return disbandOrder(unit);
  if (newType === 'HOLD') return holdOrder(unit);

  if (newType === 'MOVE') {
    const firstDest = getReachableDestinations(unit, provinces, unitOptions)[0];
    return {
      ...fromUnit(unit),
      order_type: 'MOVE',
      target: firstDest ? firstDest.province : null,
      target_coast:
        firstDest && firstDest.coasts.length === 1 ? firstDest.coasts[0] : null,
      aux_unit_origin: null,
      via_convoy: false,
      is_explicit: true,
    };
  }

  if (newType === 'SUPPORT') {
    if (unitOptions && unitOptions.valid_supports.length > 0) {
      const unitsById = Object.fromEntries(units.map((u) => [u.id, u]));
      const chosenSup =
        unitOptions.valid_supports.find(
          (s) => unitsById[s.unit_id]?.power === unit.power,
        ) || unitOptions.valid_supports[0];
      const supOrder = orders[chosenSup.unit_id];
      const matchingMove =
        supOrder?.order_type === 'MOVE' &&
        supOrder.target &&
        chosenSup.moves.includes(supOrder.target)
          ? supOrder.target
          : null;
      const target =
        matchingMove ??
        (chosenSup.hold ? chosenSup.province : (chosenSup.moves[0] ?? null));
      return {
        ...fromUnit(unit),
        order_type: 'SUPPORT',
        aux_unit_origin: chosenSup.province,
        target,
        via_convoy: false,
        is_explicit: true,
      };
    }

    const otherUnits = units.filter(
      (other) => other.id !== unit.id && !other.is_dislodged,
    );
    const defaultSup =
      otherUnits.find(
        (other) =>
          other.power === unit.power &&
          (canUnitSupportInto(unit, other.province, provinces, unitOptions) ||
            (orders[other.id]?.target &&
              canUnitSupportInto(
                unit,
                orders[other.id].target!,
                provinces,
                unitOptions,
              ))),
      ) || otherUnits[0];

    const supOrder = defaultSup ? orders[defaultSup.id] : undefined;
    const defaultTarget =
      supOrder &&
      supOrder.order_type === 'MOVE' &&
      supOrder.target &&
      canUnitSupportInto(unit, supOrder.target, provinces, unitOptions)
        ? supOrder.target
        : defaultSup?.province || null;

    return {
      ...fromUnit(unit),
      order_type: 'SUPPORT',
      aux_unit_origin: defaultSup ? defaultSup.province : null,
      target: defaultTarget,
      via_convoy: false,
      is_explicit: true,
    };
  }

  if (newType === 'CONVOY') {
    if (unitOptions?.convoyable_armies) {
      const candidates = [
        ...unitOptions.convoyable_armies.direct,
        ...unitOptions.convoyable_armies.chained,
      ];
      const byProv = Object.fromEntries(
        units.filter((u) => !u.is_dislodged).map((u) => [u.province, u]),
      );
      const chosenOrigin =
        candidates.find((prov) => byProv[prov]?.power === unit.power) ??
        candidates[0] ??
        null;
      const reach = chosenOrigin
        ? unitOptions.convoy_targets[chosenOrigin]
        : undefined;
      const chosenTarget = reach
        ? (reach.direct[0] ?? reach.chained[0] ?? null)
        : null;
      return {
        ...fromUnit(unit),
        order_type: 'CONVOY',
        aux_unit_origin: chosenOrigin,
        target: chosenTarget,
        via_convoy: false,
        is_explicit: true,
      };
    }

    const coastalArmies = units.filter(
      (u2) =>
        u2.unit_type === 'A' &&
        !u2.is_dislodged &&
        provinces[u2.province]?.type === 'COAST',
    );
    const firstArmy =
      coastalArmies.find((a) => a.power === unit.power) || coastalArmies[0];
    const coastalProvs = Object.values(provinces).filter(
      (p) => p.type === 'COAST' && p.id !== firstArmy?.province,
    );
    return {
      ...fromUnit(unit),
      order_type: 'CONVOY',
      aux_unit_origin: firstArmy ? firstArmy.province : null,
      target: coastalProvs[0]?.id || null,
      via_convoy: false,
      is_explicit: true,
    };
  }

  return null;
}
