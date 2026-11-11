"""Where convoys can carry armies: for an army, and for a fleet choosing whom to carry."""

from domain.board import ProvinceType, Unit, UnitType
from domain.game_state import ConvoyReach
from domain.orders import Order, OrderType
from engine.reachability.sea_graph import (
    COASTS_BY_SEA,
    SEAS_BY_COAST,
    coasts_touching,
    connected_seas,
    has_sea_path_through,
)
from engine.topology.provinces import PROVINCES
from engine.validator.convoys import has_active_convoy_chain


def _is_coastal(province: str) -> bool:
    return bool(PROVINCES.get(province)) and PROVINCES[province].type == ProvinceType.COAST


def army_convoy_destinations(
    army: Unit,
    units: list[Unit],
    orders: dict[str, Order],
    sea_fleets: set[str],
) -> tuple[list[str], list[str]]:
    """
    Return (active, potential) convoy destinations for a coastal army.

    `active` lists coastal targets (including adjacent coasts, e.g. DATC swap via convoy) where
    every fleet along some sea chain is ordered to convoy this army there. `potential` lists all
    other coastal provinces reachable across stationed sea fleets.
    """
    if army.unit_type != UnitType.ARMY or army.is_dislodged or not _is_coastal(army.province):
        return [], []

    reachable = coasts_touching(connected_seas(set(SEAS_BY_COAST[army.province]), sea_fleets))
    reachable.discard(army.province)

    ordered_targets = {
        o.target
        for o in orders.values()
        if o.order_type == OrderType.CONVOY
        and o.power == army.power
        and o.aux_unit_origin == army.province
        and o.target
        and o.origin in sea_fleets
    }
    active = {
        t
        for t in ordered_targets
        if t in reachable
        and has_active_convoy_chain(army.province, t, units, orders, power=army.power)
    }
    potential = reachable - active
    return sorted(active), sorted(potential)


def fleet_convoy_options(
    fleet: Unit,
    units: list[Unit],
    orders: dict[str, Order],
    sea_fleets: set[str],
) -> tuple[ConvoyReach | None, dict[str, ConvoyReach]]:
    """
    For a fleet in a sea zone, the coastal armies it can help carry and where to.

    Only lists `(origin, target)` pairs with a simple path of stationed sea fleets passing
    through `fleet.province` (never dead-end coasts that bypass this fleet). Only own-power
    fleet orders ever promote a target to `direct`, so another power's convoy orders can never
    leak into reachability even on an unmasked board.
    """
    if fleet.unit_type != UnitType.FLEET or fleet.is_dislodged or fleet.province not in sea_fleets:
        return None, {}

    own_sea = fleet.province
    own_coasts = COASTS_BY_SEA.get(own_sea, frozenset())
    component = connected_seas({own_sea}, sea_fleets)
    component_coasts = coasts_touching(component)

    direct_armies: list[str] = []
    chained_armies: list[str] = []
    targets: dict[str, ConvoyReach] = {}
    armies = sorted(
        (u for u in units if u.unit_type == UnitType.ARMY and not u.is_dislodged),
        key=lambda u: u.province,
    )
    for army in armies:
        origin = army.province
        if not _is_coastal(origin) or origin not in component_coasts:
            continue

        direct_targets: list[str] = []
        chained_targets: list[str] = []
        for candidate in sorted(component_coasts - {origin}):
            if not has_sea_path_through(origin, candidate, own_sea, sea_fleets):
                continue
            hypothetical = Order(
                unit_id=fleet.id,
                power=fleet.power,
                unit_type=UnitType.FLEET,
                origin=own_sea,
                order_type=OrderType.CONVOY,
                aux_unit_origin=origin,
                target=candidate,
                is_explicit=True,
            )
            if has_active_convoy_chain(
                origin,
                candidate,
                units,
                {**orders, fleet.id: hypothetical},
                power=fleet.power,
            ):
                direct_targets.append(candidate)
            else:
                chained_targets.append(candidate)

        if not direct_targets and not chained_targets:
            continue

        if origin in own_coasts:
            direct_armies.append(origin)
        else:
            chained_armies.append(origin)
        targets[origin] = ConvoyReach(direct=direct_targets, chained=chained_targets)

    return ConvoyReach(direct=direct_armies, chained=chained_armies), targets
