"""Order helpers: what unordered units do, build slots, coasts, and refusing orders that name nothing."""

import pytest
from domain.board import Power, Unit, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderType
from engine.order_utils import (
    build_slot_power,
    create_default_orders,
    default_build_slot,
    fleet_coast,
    reject_stale_turn,
    reset_foreign_orders,
    validate_order_references,
)
from engine.topology.provinces import PROVINCES, get_initial_1901_units
from fastapi import HTTPException

PARIS = Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR")
DISLODGED = Unit(
    id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR", is_dislodged=True
)


def test_unordered_units_hold_in_movement_and_nothing_is_confirmed():
    orders = create_default_orders(get_initial_1901_units())
    assert len(orders) == 22
    assert {o.order_type for o in orders.values()} == {OrderType.HOLD}
    assert not any(o.is_explicit for o in orders.values())


def test_in_retreats_dislodged_units_disband_and_the_rest_hold():
    orders = create_default_orders([PARIS, DISLODGED], "Retreats")
    assert orders["GER_A_BUR"].order_type == OrderType.DISBAND
    assert orders["GER_A_BUR"].is_explicit is False
    # A unit that was not dislodged has nothing to decide.
    assert orders["FRA_A_PAR"].order_type == OrderType.HOLD
    assert orders["FRA_A_PAR"].is_explicit is True


def test_in_adjustments_every_open_home_gets_a_waived_build_slot():
    builds = {
        "FRANCE": {"count": 2, "homes": ["BRE", "MAR"]},
        "GERMANY": {"count": -1, "homes": []},
    }
    orders = create_default_orders(
        [PARIS, DISLODGED.model_copy(update={"is_dislodged": False})], "Adjustments", builds
    )

    assert orders["BUILD_FRANCE_BRE"].order_type == OrderType.WAIVE
    assert orders["BUILD_FRANCE_MAR"].order_type == OrderType.WAIVE
    assert not orders["BUILD_FRANCE_BRE"].is_explicit
    assert not any(k.startswith("BUILD_GERMANY") for k in orders)
    # A power that must disband has a decision to make, so its units are not confirmed.
    assert orders["FRA_A_PAR"].is_explicit is True
    assert orders["GER_A_BUR"].is_explicit is False


def test_a_default_build_slot_builds_nothing():
    slot = default_build_slot(Power.ITALY, "NAP")
    assert slot.unit_id == "BUILD_ITALY_NAP"
    assert slot.order_type == OrderType.WAIVE
    assert slot.power == Power.ITALY
    assert slot.origin == "NAP"


@pytest.mark.parametrize(
    "slot_id, power",
    [
        ("BUILD_FRANCE_PAR", Power.FRANCE),
        ("BUILD_RUSSIA_STP", Power.RUSSIA),
        ("BUILD_ATLANTIS_PAR", None),
        ("FRA_A_PAR", None),
        ("BUILD_FRANCE", None),
        ("", None),
    ],
)
def test_a_build_slot_names_its_power(slot_id, power):
    assert build_slot_power(slot_id) == power


@pytest.mark.parametrize(
    "unit_type, province, requested, coast",
    [
        (UnitType.ARMY, "STP", "NC", None),
        (UnitType.FLEET, "BRE", "NC", None),
        (UnitType.FLEET, "STP", "SC", "SC"),
        (UnitType.FLEET, "SPA", "NC", "NC"),
        # An unknown or missing coast falls back to the province's first coast.
        (UnitType.FLEET, "STP", "EC", PROVINCES["STP"].coasts[0]),
        (UnitType.FLEET, "BUL", None, PROVINCES["BUL"].coasts[0]),
    ],
)
def test_only_a_fleet_on_a_split_coast_has_a_coast(unit_type, province, requested, coast):
    assert fleet_coast(unit_type, PROVINCES[province], requested) == coast


def order(**fields) -> Order:
    base = {
        "unit_id": "FRA_A_PAR",
        "power": Power.FRANCE,
        "unit_type": UnitType.ARMY,
        "origin": "PAR",
    }
    return Order(**{**base, **fields})


@pytest.mark.parametrize(
    "bad",
    [
        order(order_type=OrderType.MOVE, target="ATL"),
        order(order_type=OrderType.SUPPORT, aux_unit_origin="NOWHERE", target="BUR"),
        order(order_type=OrderType.MOVE, target="BUR", target_coast="NC"),
        order(order_type=OrderType.MOVE, target="SPA", target_coast="EC"),
        order(unit_id="BUILD_FRANCE_XXX", order_type=OrderType.BUILD, origin="XXX"),
    ],
)
def test_orders_naming_places_that_do_not_exist_are_refused(bad):
    with pytest.raises(HTTPException) as refused:
        validate_order_references(bad)
    assert refused.value.status_code == 400


@pytest.mark.parametrize(
    "good",
    [
        order(),
        order(order_type=OrderType.MOVE, target="BUR"),
        order(order_type=OrderType.MOVE, target="SPA", target_coast="NC"),
        # Builds carry their coast on the unit being built, so it is not checked as a target.
        order(
            unit_id="BUILD_RUSSIA_STP",
            power=Power.RUSSIA,
            unit_type=UnitType.FLEET,
            origin="STP",
            order_type=OrderType.BUILD,
            target_coast="SC",
        ),
    ],
)
def test_real_places_pass(good):
    validate_order_references(good)


def test_a_unit_orders_origin_is_not_checked_but_a_build_slots_is():
    # The order routes put the unit's own province in `origin`, so only a build slot's counts.
    validate_order_references(order(origin="XXX"))
    with pytest.raises(HTTPException):
        validate_order_references(order(unit_id="BUILD_FRANCE_XXX", origin="XXX"))


def board(season="Spring", year=1901, phase="Movement") -> GameState:
    units = get_initial_1901_units()
    return GameState(
        game_id="t",
        season=season,
        year=year,
        phase=phase,
        units=units,
        orders=create_default_orders(units),
        ownership={},
    )


def test_a_request_for_the_current_turn_or_no_turn_goes_through():
    reject_stale_turn(board(), "Spring 1901 Movement")
    reject_stale_turn(board(), None)


def test_a_request_for_a_turn_that_resolved_is_refused():
    with pytest.raises(HTTPException) as refused:
        reject_stale_turn(board("Fall"), "Spring 1901 Movement")
    assert refused.value.status_code == 409
    assert "Fall 1901 Movement" in refused.value.detail


def test_resetting_foreign_orders_keeps_only_the_players_own():
    g = board()
    for uid, o in g.orders.items():
        g.orders[uid] = o.model_copy(
            update={"order_type": OrderType.MOVE, "target": "BUR", "is_explicit": True}
        )

    reset_foreign_orders(g, Power.FRANCE)

    for o in g.orders.values():
        if o.power == Power.FRANCE:
            assert o.order_type == OrderType.MOVE
        else:
            assert o.order_type == OrderType.HOLD
            assert not o.is_explicit
