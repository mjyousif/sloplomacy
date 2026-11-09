"""adjudicate_turn as a whole: final positions match the bare engine, and how a game ends."""

import random

from domain.board import Power, ProvinceType, UnitType
from domain.orders import OrderType
from engine.adjudicator.resolver import adjudicate_turn, create_diplomacy_game
from engine.adjudicator.translator import order_to_diplomacy_str
from engine.topology.graph import can_unit_support_province, split_province_code
from engine.topology.provinces import PROVINCES, get_initial_1901_units, get_initial_ownership
from tests.unit.engine.adjudicator.helpers import _order, _unit


def _random_order(rng, unit, units):
    """Mostly legal orders, so turns produce real bounces, cuts and dislodgements, plus some nonsense."""
    prov = PROVINCES[unit.province]
    if unit.unit_type == UnitType.ARMY:
        reachable = list(prov.army_adj)
    else:
        reachable = list(prov.fleet_adj.get(unit.coast or "", []))
    roll = rng.random()

    if roll < 0.15:
        return _order(
            unit, OrderType.MOVE, rng.choice(sorted(PROVINCES)), via_convoy=rng.random() < 0.5
        )
    if roll < 0.3 and unit.unit_type == UnitType.FLEET and prov.type == ProvinceType.SEA:
        armies = [u for u in units if u.unit_type == UnitType.ARMY]
        if armies:
            return _order(
                unit,
                OrderType.CONVOY,
                rng.choice(sorted(PROVINCES)),
                aux=rng.choice(armies).province,
            )
    if roll < 0.55:
        others = [u for u in units if u.id != unit.id]
        if others and reachable:
            target = split_province_code(rng.choice(reachable))[0]
            return _order(unit, OrderType.SUPPORT, target, aux=rng.choice(others).province)
    if roll < 0.9 and reachable:
        target, coast = split_province_code(rng.choice(reachable))
        return _order(unit, OrderType.MOVE, target, target_coast=coast)
    return _order(unit, OrderType.HOLD)


def _random_orders(rng, units):
    orders = {u.id: _random_order(rng, u, units) for u in units}
    # Back some of the moves with matching supports, so that attacks actually land.
    moves = [o for o in orders.values() if o.order_type == OrderType.MOVE and o.target in PROVINCES]
    for unit in units:
        backable = [
            move
            for move in moves
            if move.unit_id != unit.id
            and can_unit_support_province(unit.unit_type, unit.province, unit.coast, move.target)[0]
        ]
        if backable and rng.random() < 0.5:
            move = rng.choice(backable)
            orders[unit.id] = _order(unit, OrderType.SUPPORT, move.target, aux=move.origin)
    return orders


def _engine_board(units, orders, ownership, season, year):
    """Run the same orders through the bare engine and report where it put everything."""
    game = create_diplomacy_game(units, ownership, season, year, "Movement")
    by_province = {u.province: u for u in units}
    for power in {u.power for u in units}:
        strings = [
            order_to_diplomacy_str(orders[u.id], by_province) for u in units if u.power == power
        ]
        game.set_orders(power.value, strings)
    game.process()
    return sorted((power, unit) for power, located in game.get_units().items() for unit in located)


def _board(units):
    board = []
    for u in units:
        location = f"{u.province}/{u.coast}" if u.coast else u.province
        board.append(
            (u.power.value, f"{'*' if u.is_dislodged else ''}{u.unit_type.value} {location}")
        )
    return sorted(board)


def test_final_positions_always_match_the_engine():
    """The engine owns the board: whatever is ordered, we must end up exactly where it says."""
    rng = random.Random(1901)
    turns_with_a_rejected_order = 0
    turns_with_a_dislodgement = 0

    for _ in range(40):
        units = get_initial_1901_units()
        ownership = get_initial_ownership()
        year = 1901
        for season in ["Spring", "Fall"] * 4:
            orders = _random_orders(rng, units)
            result = adjudicate_turn(units, orders, ownership, season, year, "Movement")

            assert _board(result.new_units) == _engine_board(units, orders, ownership, season, year)

            standing = [u for u in result.new_units if not u.is_dislodged]
            assert len({u.province for u in standing}) == len(standing), (
                "two units share a province"
            )
            turns_with_a_rejected_order += any(
                "rejected" in r.reason.lower() for r in result.resolutions.values()
            )
            turns_with_a_dislodgement += len(standing) != len(result.new_units)

            units = standing
            ownership = result.new_ownership
            year += season == "Fall"

    # Guard against the test quietly exercising nothing interesting.
    assert turns_with_a_rejected_order > 50
    assert turns_with_a_dislodgement > 20


def _board_one_center_from_a_solo():
    """France holds 17 centers and F ION can take Tunis, the 18th."""
    centers = sorted(
        p.id for p in PROVINCES.values() if p.is_supply_center and p.id not in ("TUN", "PAR")
    )[:16]
    ownership = {center: Power.FRANCE for center in centers}
    ownership["PAR"] = Power.FRANCE
    fleet = _unit("FRA_F_ION", Power.FRANCE, UnitType.FLEET, "ION")
    army = _unit("FRA_A_PAR", Power.FRANCE, UnitType.ARMY, "PAR")
    rival = _unit("TUR_A_SMY", Power.TURKEY, UnitType.ARMY, "SMY")
    orders = {fleet.id: _order(fleet, OrderType.MOVE, "TUN")}
    return [fleet, army, rival], orders, ownership


def test_solo_victory_names_the_winner_and_keeps_the_clock():
    units, orders, ownership = _board_one_center_from_a_solo()

    res = adjudicate_turn(units, orders, ownership, "Fall", 1907, "Movement")

    assert res.winner == Power.FRANCE
    assert (res.next_season, res.next_year, res.next_phase) == ("Fall", 1907, "Movement")
    assert res.builds is None
    assert res.retreats is None
    assert sum(owner == Power.FRANCE for owner in res.new_ownership.values()) == 18
    assert {u.id: u.province for u in res.new_units}["FRA_F_ION"] == "TUN"


def test_seventeen_centers_is_not_a_win():
    units, _, ownership = _board_one_center_from_a_solo()

    res = adjudicate_turn(units, {}, ownership, "Fall", 1907, "Movement")

    assert res.winner is None
    assert (res.next_season, res.next_year) == ("Winter", 1907)
