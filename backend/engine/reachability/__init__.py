"""Every unit's legal move, convoy and support options for the phase being played.

The engine is the one place these rules live, so the client never walks the map itself.
`compute_unit_options` is pure: callers pass the orders the viewer may see, and in a live
match `sanitize_game_state_for_viewer` passes the masked ones, so a foreign fleet's hidden
convoy order can never make a destination look certain.
"""

from typing import Any

from domain.board import Unit, UnitType
from domain.game_state import UnitMoveOptions
from domain.orders import Order
from engine.reachability.convoys import (
    army_convoy_destinations,
    fleet_convoy_options,
    own_fleet_convoy_destinations,
)
from engine.reachability.moves import direct_move_codes, retreat_codes
from engine.reachability.sea_graph import stationed_sea_fleets
from engine.reachability.supports import supportable_provinces, valid_supports
from engine.topology.graph import split_province_code

__all__ = ["compute_unit_options"]


def compute_unit_options(
    units: list[Unit],
    orders: dict[str, Order],
    phase: str,
    retreats: dict[str, Any] | None = None,
    winner: Any = None,
) -> dict[str, UnitMoveOptions]:
    """
    Options by unit id.

    - Movement: every unit, with moves, convoys and supports.
    - Retreats: only dislodged units, whose `direct_moves` are the adjudicator's retreats.
    - Adjustments, or a finished game: nothing; builds and disbands come from `builds`.
    """
    if winner or phase == "Adjustments":
        return {}
    if phase == "Retreats":
        return {
            u.id: UnitMoveOptions(direct_moves=retreat_codes(u, retreats))
            for u in units
            if u.is_dislodged
        }

    sea_fleets = set(stationed_sea_fleets(units))
    options: dict[str, UnitMoveOptions] = {}
    reach_by_unit: dict[str, set[str]] = {}

    for unit in units:
        if unit.is_dislodged:
            continue
        direct = direct_move_codes(unit)
        direct_bases = {split_province_code(code)[0] for code in direct}
        opt = UnitMoveOptions(direct_moves=direct)
        if unit.unit_type == UnitType.ARMY:
            active, potential = army_convoy_destinations(unit, units, orders, sea_fleets)
            opt.active_convoys = active
            opt.potential_convoys = potential
            opt.own_fleet_convoys = [
                c for c in own_fleet_convoy_destinations(unit, units, sea_fleets) if c in potential
            ]
            reach_by_unit[unit.id] = direct_bases | set(active) | set(potential)
        else:
            armies, targets = fleet_convoy_options(unit, units, orders, sea_fleets)
            opt.convoyable_armies = armies
            opt.convoy_targets = targets
            reach_by_unit[unit.id] = direct_bases
        options[unit.id] = opt

    for unit in units:
        if unit.id not in options:
            continue
        support_into = supportable_provinces(options[unit.id].direct_moves)
        options[unit.id].valid_supports = valid_supports(unit, units, reach_by_unit, support_into)

    return options
