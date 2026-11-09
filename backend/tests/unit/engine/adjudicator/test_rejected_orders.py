"""Orders the engine drops or cannot read: the unit holds, and nothing is applied or credited."""

import pytest
from domain.board import Power, UnitType
from domain.orders import OrderType
from engine.adjudicator.resolver import adjudicate_turn
from tests.unit.engine.adjudicator.helpers import _order, _unit


@pytest.mark.parametrize(
    "unit_type, origin, target",
    [
        (UnitType.ARMY, "PAR", "MOS"),  # not adjacent
        (UnitType.ARMY, "PAR", "NTH"),  # armies cannot enter sea zones
        (UnitType.FLEET, "BRE", "MUN"),  # fleets cannot move inland
        (UnitType.ARMY, "PAR", "ZZZ"),  # no such province
    ],
)
def test_order_the_engine_rejects_leaves_the_unit_in_place(unit_type, origin, target):
    unit = _unit("FRA_X", Power.FRANCE, unit_type, origin)
    res = adjudicate_turn([unit], {unit.id: _order(unit, OrderType.MOVE, target)}, {})

    assert [(u.province, u.is_dislodged) for u in res.new_units] == [(origin, False)]
    resolution = res.resolutions[unit.id]
    assert resolution.succeeded is False
    assert "rejected" in resolution.reason.lower()
    assert any("rejected" in line.lower() for line in res.summary)


@pytest.mark.parametrize(
    "unit_type, origin, order_type, fields",
    [
        (UnitType.ARMY, "PAR", OrderType.MOVE, {}),
        (UnitType.ARMY, "PAR", OrderType.SUPPORT, {}),
        (UnitType.ARMY, "PAR", OrderType.SUPPORT, {"target": "BUR"}),
        (UnitType.FLEET, "NTH", OrderType.CONVOY, {}),
        (UnitType.FLEET, "NTH", OrderType.CONVOY, {"target": "BEL"}),
        (UnitType.FLEET, "NTH", OrderType.CONVOY, {"aux": "LON"}),
    ],
)
def test_incomplete_order_holds_instead_of_crashing_the_engine(
    unit_type, origin, order_type, fields
):
    """The engine raises on an order with no subject, and every later read of the game would too."""
    unit = _unit("X", Power.FRANCE, unit_type, origin)

    res = adjudicate_turn([unit], {unit.id: _order(unit, order_type, **fields)}, {})

    assert res.new_units[0].province == origin
    assert res.resolutions[unit.id].succeeded is False


def test_army_cannot_cross_water_with_no_fleet_on_the_board():
    """The UI sends via_convoy for any non-adjacent army move, and the validator only warns."""
    army = _unit("ENG_A_LON", Power.ENGLAND, UnitType.ARMY, "LON")
    order = _order(army, OrderType.MOVE, "BEL", via_convoy=True)

    res = adjudicate_turn([army], {army.id: order}, {})

    assert res.new_units[0].province == "LON"
    assert res.resolutions[army.id].succeeded is False


def test_real_convoy_still_lands():
    army = _unit("ENG_A_LON", Power.ENGLAND, UnitType.ARMY, "LON")
    fleet = _unit("ENG_F_NTH", Power.ENGLAND, UnitType.FLEET, "NTH")
    orders = {
        army.id: _order(army, OrderType.MOVE, "BEL", via_convoy=True),
        fleet.id: _order(fleet, OrderType.CONVOY, "BEL", aux="LON"),
    }

    res = adjudicate_turn([army, fleet], orders, {})

    assert {u.id: u.province for u in res.new_units}["ENG_A_LON"] == "BEL"
    assert res.resolutions[army.id].succeeded is True


def test_rejected_support_adds_no_strength():
    army = _unit("FRA_A_PAR", Power.FRANCE, UnitType.ARMY, "PAR")
    fleet = _unit("FRA_F_BRE", Power.FRANCE, UnitType.FLEET, "BRE")  # Brest does not touch Burgundy
    orders = {
        army.id: _order(army, OrderType.MOVE, "BUR"),
        fleet.id: _order(fleet, OrderType.SUPPORT, "BUR", aux="PAR"),
    }

    res = adjudicate_turn([army, fleet], orders, {})

    assert res.resolutions[fleet.id].succeeded is False
    assert res.resolutions[army.id].attack_strength == 1


def test_unit_with_a_rejected_order_can_still_be_dislodged():
    defender = _unit("FRA_A_BUR", Power.FRANCE, UnitType.ARMY, "BUR")
    attacker = _unit("GER_A_MUN", Power.GERMANY, UnitType.ARMY, "MUN")
    helper = _unit("GER_A_RUH", Power.GERMANY, UnitType.ARMY, "RUH")
    orders = {
        defender.id: _order(defender, OrderType.MOVE, "MOS"),
        attacker.id: _order(attacker, OrderType.MOVE, "BUR"),
        helper.id: _order(helper, OrderType.SUPPORT, "BUR", aux="MUN"),
    }

    res = adjudicate_turn([defender, attacker, helper], orders, {})

    placed = {u.id: u for u in res.new_units}
    assert placed["FRA_A_BUR"].province == "BUR"
    assert placed["FRA_A_BUR"].is_dislodged is True
    assert placed["GER_A_MUN"].province == "BUR"
    assert res.resolutions[defender.id].dislodged is True
    assert res.resolutions[defender.id].succeeded is False


def test_fleet_stays_put_when_the_coast_is_ambiguous():
    fleet = _unit("FRA_F_MAO", Power.FRANCE, UnitType.FLEET, "MAO")

    res = adjudicate_turn([fleet], {fleet.id: _order(fleet, OrderType.MOVE, "SPA")}, {})

    assert res.new_units[0].province == "MAO"
    assert res.new_units[0].coast is None


def test_fleet_gets_the_only_reachable_coast():
    fleet = _unit("FRA_F_GAS", Power.FRANCE, UnitType.FLEET, "GAS")

    res = adjudicate_turn([fleet], {fleet.id: _order(fleet, OrderType.MOVE, "SPA")}, {})

    assert (res.new_units[0].province, res.new_units[0].coast) == ("SPA", "NC")
