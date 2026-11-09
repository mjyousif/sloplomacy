"""Translating orders and phase names to and from the `diplomacy` engine's strings."""

import pytest
from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.adjudicator.translator import (
    order_to_diplomacy_str,
    parse_diplomacy_phase,
    to_diplomacy_phase_code,
)


def order(unit_type, origin, order_type, **fields) -> Order:
    return Order(
        unit_id=f"FRA_{unit_type.value}_{origin}",
        power=Power.FRANCE,
        unit_type=unit_type,
        origin=origin,
        order_type=order_type,
        **fields,
    )


A, F = UnitType.ARMY, UnitType.FLEET
BOARD = {
    "PAR": Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=A, province="PAR"),
    "BRE": Unit(id="FRA_F_BRE", power=Power.FRANCE, unit_type=F, province="BRE"),
    "STP": Unit(id="RUS_F_STP", power=Power.RUSSIA, unit_type=F, province="STP", coast="SC"),
}


@pytest.mark.parametrize(
    "season, year, phase, code",
    [
        ("Spring", 1901, "Movement", "S1901M"),
        ("Spring", 1901, "Retreats", "S1901R"),
        ("Fall", 1903, "Movement", "F1903M"),
        ("Fall", 1903, "Retreats", "F1903R"),
        ("Winter", 1903, "Adjustments", "W1903A"),
        ("Winter", 1903, "Builds", "W1903A"),
    ],
)
def test_phase_codes(season, year, phase, code):
    assert to_diplomacy_phase_code(season, year, phase) == code


@pytest.mark.parametrize(
    "engine_phase, parsed",
    [
        ("SPRING 1901 MOVEMENT", ("Spring", 1901, "Movement")),
        ("FALL 1905 RETREATS", ("Fall", 1905, "Retreats")),
        ("WINTER 1902 ADJUSTMENTS", ("Winter", 1902, "Adjustments")),
        # A finished game's phase is the bare word COMPLETED, and an unreadable year falls back.
        ("COMPLETED", ("Spring", 1901, "Movement")),
        ("SPRING XXXX MOVEMENT", ("Spring", 1901, "Movement")),
    ],
)
def test_parsing_engine_phase_names(engine_phase, parsed):
    assert parse_diplomacy_phase(engine_phase) == parsed


@pytest.mark.parametrize(
    "the_order, expected",
    [
        (order(A, "PAR", OrderType.HOLD), "A PAR H"),
        (order(A, "PAR", OrderType.MOVE, target="BUR"), "A PAR - BUR"),
        (order(A, "BRE", OrderType.MOVE, target="LON", via_convoy=True), "A BRE - LON VIA"),
        (order(F, "MAO", OrderType.MOVE, target="SPA", target_coast="NC"), "F MAO - SPA/NC"),
        (order(F, "STP", OrderType.MOVE, origin_coast="SC", target="BOT"), "F STP/SC - BOT"),
        # Support to hold names only the supported unit; support to move adds its destination.
        (order(A, "BUR", OrderType.SUPPORT, aux_unit_origin="PAR"), "A BUR S A PAR"),
        (
            order(A, "BUR", OrderType.SUPPORT, aux_unit_origin="PAR", target="PAR"),
            "A BUR S A PAR",
        ),
        (
            order(A, "GAS", OrderType.SUPPORT, aux_unit_origin="PAR", target="BUR"),
            "A GAS S A PAR - BUR",
        ),
        # The supported unit's type and coast come from the board.
        (order(F, "MAO", OrderType.SUPPORT, aux_unit_origin="BRE"), "F MAO S F BRE"),
        (order(F, "BOT", OrderType.SUPPORT, aux_unit_origin="STP"), "F BOT S F STP/SC"),
        # With nothing on the board there, the engine is told it is an army.
        (order(F, "MAO", OrderType.SUPPORT, aux_unit_origin="POR"), "F MAO S A POR"),
        (
            order(F, "ENG", OrderType.CONVOY, aux_unit_origin="WAL", target="BRE"),
            "F ENG C A WAL - BRE",
        ),
        (order(A, "PAR", OrderType.DISBAND), "A PAR D"),
        (order(A, "PAR", OrderType.RETREAT, target="GAS"), "A PAR R GAS"),
        (order(F, "MAO", OrderType.RETREAT, target="SPA", target_coast="SC"), "F MAO R SPA/SC"),
        # A retreat with nowhere to go is a disband.
        (order(A, "PAR", OrderType.RETREAT), "A PAR D"),
        (order(A, "PAR", OrderType.WAIVE), "WAIVE"),
    ],
)
def test_orders_translate_to_engine_strings(the_order, expected):
    assert order_to_diplomacy_str(the_order, BOARD) == expected


@pytest.mark.parametrize(
    "the_order, expected",
    [
        (order(A, "PAR", OrderType.BUILD), "A PAR B"),
        (order(F, "BRE", OrderType.BUILD), "F BRE B"),
        # A fleet built on a split coast needs one; without a choice it takes the first.
        (order(F, "STP", OrderType.BUILD, origin_coast="NC"), "F STP/NC B"),
        (order(F, "STP", OrderType.BUILD, target_coast="SC"), "F STP/SC B"),
        (order(F, "STP", OrderType.BUILD), "F STP/NC B"),
        # An army ignores any coast it was given.
        (order(A, "STP", OrderType.BUILD, origin_coast="NC"), "A STP B"),
    ],
)
def test_builds_translate_with_the_right_coast(the_order, expected):
    assert order_to_diplomacy_str(the_order, BOARD) == expected


@pytest.mark.parametrize(
    "the_order",
    [
        order(A, "PAR", OrderType.MOVE),
        order(A, "BUR", OrderType.SUPPORT, target="PAR"),
        order(F, "ENG", OrderType.CONVOY, aux_unit_origin="WAL"),
        order(F, "ENG", OrderType.CONVOY, target="BRE"),
    ],
)
def test_incomplete_orders_are_not_sent_to_the_engine(the_order):
    # The engine raises on these, so they are left out and the unit holds.
    assert order_to_diplomacy_str(the_order, BOARD) is None
