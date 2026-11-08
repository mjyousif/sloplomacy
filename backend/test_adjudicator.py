import random

import pytest

from adjudicator import adjudicate_turn, create_diplomacy_game, order_to_diplomacy_str
from map_data import (
    PROVINCES,
    can_unit_support_province,
    get_initial_1901_units,
    get_initial_ownership,
    split_province_code,
)
from models import Order, OrderType, Power, ProvinceType, Unit, UnitType


def test_adjudicator_support_cut_by_attack():
    """An attack on a supporting unit cuts its support (DATC 6.D.1)."""
    units = [
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
        Unit(id="GER_A_RUH", power=Power.GERMANY, unit_type=UnitType.ARMY, province="RUH"),
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_A_BEL", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BEL"),
    ]
    ownership = {
        "MUN": Power.GERMANY,
        "RUH": Power.GERMANY,
        "BUR": Power.FRANCE,
        "BEL": Power.FRANCE,
    }

    orders = {
        # Germany attacks BUR with support from RUH
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        "GER_A_RUH": Order(
            unit_id="GER_A_RUH",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="RUH",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="BUR",
            is_explicit=True,
        ),
        # France holds BUR and cuts RUH's support using BEL
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "FRA_A_BEL": Order(
            unit_id="FRA_A_BEL",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BEL",
            order_type=OrderType.MOVE,
            target="RUH",
            is_explicit=True,
        ),
    }

    res = adjudicate_turn(units, orders, ownership)
    assert res.resolutions["GER_A_RUH"].cut is True
    assert res.resolutions["GER_A_MUN"].bounced is True
    assert res.resolutions["FRA_A_BUR"].dislodged is False


def test_adjudicator_support_not_cut_by_target_unit():
    """An attack from the province being attacked does NOT cut support (DATC 6.D.2)."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        Unit(id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR"),
    ]
    ownership = {"PAR": Power.FRANCE, "MAR": Power.FRANCE, "BUR": Power.GERMANY}

    orders = {
        # France attacks BUR supported by MAR
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="BUR",
            is_explicit=True,
        ),
        # Defender in BUR attempts to cut MAR's support by attacking MAR
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.MOVE,
            target="MAR",
            is_explicit=True,
        ),
    }

    res = adjudicate_turn(units, orders, ownership)
    assert res.resolutions["FRA_A_MAR"].cut is False
    assert res.resolutions["FRA_A_PAR"].succeeded is True
    assert res.resolutions["GER_A_BUR"].dislodged is True


def test_adjudicator_beleaguered_garrison():
    """Two opposing supported attacks of equal strength bounce, leaving defender intact (DATC 6.E.1)."""
    units = [
        Unit(id="RUS_A_BEL", power=Power.RUSSIA, unit_type=UnitType.ARMY, province="BEL"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
        Unit(id="ENG_F_ENG", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="ENG"),
        Unit(id="GER_A_RUH", power=Power.GERMANY, unit_type=UnitType.ARMY, province="RUH"),
        Unit(id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR"),
    ]
    ownership = {"BEL": Power.RUSSIA, "NTH": Power.ENGLAND, "RUH": Power.GERMANY}

    orders = {
        "RUS_A_BEL": Order(
            unit_id="RUS_A_BEL",
            power=Power.RUSSIA,
            unit_type=UnitType.ARMY,
            origin="BEL",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        # England attacks BEL with str 2
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "ENG_F_ENG": Order(
            unit_id="ENG_F_ENG",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="NTH",
            target="BEL",
            is_explicit=True,
        ),
        # Germany also attacks BEL with str 2
        "GER_A_RUH": Order(
            unit_id="GER_A_RUH",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="RUH",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="RUH",
            target="BEL",
            is_explicit=True,
        ),
    }

    res = adjudicate_turn(units, orders, ownership)
    assert res.resolutions["ENG_F_NTH"].bounced is True
    assert res.resolutions["GER_A_RUH"].bounced is True
    assert res.resolutions["RUS_A_BEL"].dislodged is False
    assert res.resolutions["RUS_A_BEL"].succeeded is True


def test_adjudicator_convoy_success_and_disruption():
    """Convoy delivers army when fleet holds, but fails when convoying fleet is dislodged."""
    units = [
        Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
    ]
    ownership = {"LON": Power.ENGLAND, "EDI": Power.ENGLAND}

    # Case 1: Undisturbed convoy succeeds
    orders_ok = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.MOVE,
            target="BEL",
            via_convoy=True,
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.CONVOY,
            aux_unit_origin="LON",
            target="BEL",
            is_explicit=True,
        ),
    }
    res_ok = adjudicate_turn(units, orders_ok, ownership)
    assert res_ok.resolutions["ENG_A_LON"].succeeded is True
    new_provinces = {u.province for u in res_ok.new_units}
    assert "BEL" in new_provinces

    # Case 2: Germany dislodges F NTH with str 2 attack -> Convoy disrupted
    units_disrupted = units + [
        Unit(id="GER_F_SKA", power=Power.GERMANY, unit_type=UnitType.FLEET, province="SKA"),
        Unit(id="GER_F_NWG", power=Power.GERMANY, unit_type=UnitType.FLEET, province="NWG"),
    ]
    ownership_disrupted = dict(ownership, SKA=Power.GERMANY, NWG=Power.GERMANY)
    orders_disrupted = dict(orders_ok)
    orders_disrupted["GER_F_SKA"] = Order(
        unit_id="GER_F_SKA",
        power=Power.GERMANY,
        unit_type=UnitType.FLEET,
        origin="SKA",
        order_type=OrderType.MOVE,
        target="NTH",
        is_explicit=True,
    )
    orders_disrupted["GER_F_NWG"] = Order(
        unit_id="GER_F_NWG",
        power=Power.GERMANY,
        unit_type=UnitType.FLEET,
        origin="NWG",
        order_type=OrderType.SUPPORT,
        aux_unit_origin="SKA",
        target="NTH",
        is_explicit=True,
    )

    res_disrupted = adjudicate_turn(units_disrupted, orders_disrupted, ownership_disrupted)
    assert res_disrupted.resolutions["ENG_F_NTH"].dislodged is True
    assert res_disrupted.resolutions["ENG_A_LON"].succeeded is False
    disrupted_provinces = {u.province for u in res_disrupted.new_units if u.power == Power.ENGLAND}
    assert "BEL" not in disrupted_provinces
    assert "LON" in disrupted_provinces


def test_adjudicator_dislodgement_triggers_retreat_phase():
    """A dislodged unit transitions game into the Retreats phase with valid retreat destinations."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        Unit(id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR"),
    ]
    ownership = {"PAR": Power.FRANCE, "MAR": Power.FRANCE, "BUR": Power.GERMANY}

    orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="BUR",
            is_explicit=True,
        ),
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }

    res = adjudicate_turn(units, orders, ownership, "Spring", 1901, "Movement")
    assert res.resolutions["GER_A_BUR"].dislodged is True
    assert res.next_phase == "Retreats"
    assert res.retreats is not None
    # Germany must have retreat options from Burgundy, but NOT Paris (where attack came from)
    ger_retreats = res.retreats.get("GERMANY", {})
    assert "A BUR" in ger_retreats
    assert "PAR" not in ger_retreats["A BUR"]
    assert len(ger_retreats["A BUR"]) > 0


def test_adjudicator_winter_disbands_deficit():
    """In Fall/Winter, if units exceed SC count, disbands are required."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
    ]
    # France only owns 2 SCs (PAR, BRE) but has 3 units occupying non-SC provinces BUR & MAO
    ownership = {"PAR": Power.FRANCE, "BRE": Power.FRANCE}
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in units
    }

    res = adjudicate_turn(units, orders, ownership, "Fall", 1901, "Movement")
    assert res.next_season == "Winter"
    assert res.next_phase == "Adjustments"
    assert res.builds is not None
    # France has count -1 (must disband 1 unit)
    assert res.builds["FRANCE"]["count"] == -1


def test_adjudicator_retreat_phase_execution():
    """Dislodged units remain in new_units with is_dislodged=True and can retreat or disband in Retreats phase."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        Unit(id="GER_A_BUR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="BUR"),
    ]
    ownership = {"PAR": Power.FRANCE, "MAR": Power.FRANCE, "BUR": Power.GERMANY}
    orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="BUR",
            is_explicit=True,
        ),
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }

    res_mov = adjudicate_turn(units, orders, ownership, "Spring", 1901, "Movement")
    assert res_mov.next_phase == "Retreats"
    dislodged_units = [u for u in res_mov.new_units if u.is_dislodged]
    assert len(dislodged_units) == 1
    assert dislodged_units[0].id == "GER_A_BUR"
    assert dislodged_units[0].province == "BUR"

    # Case 1: Germany retreats GER_A_BUR to MUN
    retreat_orders = {
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.RETREAT,
            target="MUN",
            is_explicit=True,
        )
    }
    res_ret = adjudicate_turn(
        res_mov.new_units,
        retreat_orders,
        res_mov.new_ownership,
        "Spring",
        1901,
        "Retreats",
        retreats=res_mov.retreats,
    )
    assert res_ret.next_season == "Fall"
    assert res_ret.next_phase == "Movement"
    assert res_ret.resolutions["GER_A_BUR"].succeeded is True
    ger_unit = next((u for u in res_ret.new_units if u.id == "GER_A_BUR"), None)
    assert ger_unit is not None
    assert ger_unit.province == "MUN"
    assert ger_unit.is_dislodged is False

    # Case 2: Germany disbands GER_A_BUR during Retreats
    disband_orders = {
        "GER_A_BUR": Order(
            unit_id="GER_A_BUR",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.DISBAND,
            is_explicit=True,
        )
    }
    res_dis = adjudicate_turn(
        res_mov.new_units,
        disband_orders,
        res_mov.new_ownership,
        "Spring",
        1901,
        "Retreats",
        retreats=res_mov.retreats,
    )
    assert all(u.id != "GER_A_BUR" for u in res_dis.new_units)


def test_adjudicator_winter_builds_and_unique_unit_ids():
    """Winter builds spawn new units with unique IDs even when original home units moved elsewhere."""
    # FRA_A_PAR moved to HOL, FRA_A_MAR moved to SPA, FRA_F_BRE moved to POR
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="HOL"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="SPA"),
        Unit(id="FRA_F_BRE", power=Power.FRANCE, unit_type=UnitType.FLEET, province="POR"),
        Unit(id="RUS_A_STP", power=Power.RUSSIA, unit_type=UnitType.ARMY, province="FIN"),
    ]
    ownership = {
        "PAR": Power.FRANCE,
        "MAR": Power.FRANCE,
        "BRE": Power.FRANCE,
        "SPA": Power.FRANCE,
        "POR": Power.FRANCE,
        "STP": Power.RUSSIA,
        "MOS": Power.RUSSIA,
    }
    orders = {
        "BUILD_FRANCE_PAR": Order(
            unit_id="BUILD_FRANCE_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.BUILD,
            is_explicit=True,
        ),
        "BUILD_FRANCE_BRE": Order(
            unit_id="BUILD_FRANCE_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.BUILD,
            is_explicit=True,
        ),
        "BUILD_FRANCE_MAR": Order(
            unit_id="BUILD_FRANCE_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.WAIVE,
            is_explicit=True,
        ),
        # Russia builds Fleet on STP/NC
        "BUILD_RUSSIA_STP": Order(
            unit_id="BUILD_RUSSIA_STP",
            power=Power.RUSSIA,
            unit_type=UnitType.FLEET,
            origin="STP",
            origin_coast="NC",
            order_type=OrderType.BUILD,
            is_explicit=True,
        ),
    }

    res = adjudicate_turn(units, orders, ownership, "Winter", 1901, "Adjustments")
    assert res.next_season == "Spring"
    assert res.next_year == 1902
    assert res.next_phase == "Movement"

    fra_units = [u for u in res.new_units if u.power == Power.FRANCE]
    assert len(fra_units) == 5
    # Verify all unit IDs are unique
    fra_ids = [u.id for u in fra_units]
    assert len(set(fra_ids)) == 5
    assert "FRA_A_PAR" in fra_ids
    assert "FRA_A_PAR_2" in fra_ids

    rus_stp = next(
        (u for u in res.new_units if u.power == Power.RUSSIA and u.province == "STP"), None
    )
    assert rus_stp is not None
    assert rus_stp.unit_type == UnitType.FLEET
    assert rus_stp.coast == "NC"


def test_adjudicator_winter_disbands_execution():
    """Explicit disband or civil disorder in Winter Adjustments removes the unit from new_units."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
    ]
    ownership = {"PAR": Power.FRANCE, "BRE": Power.FRANCE}
    orders = {
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.DISBAND,
            is_explicit=True,
        )
    }

    res = adjudicate_turn(units, orders, ownership, "Winter", 1901, "Adjustments")
    fra_units = [u for u in res.new_units if u.power == Power.FRANCE]
    assert len(fra_units) == 2
    assert all(u.id != "FRA_A_BUR" for u in fra_units)


def _unit(uid, power, unit_type, province, coast=None):
    return Unit(id=uid, power=power, unit_type=unit_type, province=province, coast=coast)


def _order(
    unit, order_type=OrderType.HOLD, target=None, aux=None, target_coast=None, via_convoy=False
):
    return Order(
        unit_id=unit.id,
        power=unit.power,
        unit_type=unit.unit_type,
        origin=unit.province,
        origin_coast=unit.coast,
        order_type=order_type,
        target=target,
        target_coast=target_coast,
        aux_unit_origin=aux,
        via_convoy=via_convoy,
        is_explicit=True,
    )


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
