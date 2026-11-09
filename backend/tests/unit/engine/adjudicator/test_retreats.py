"""Retreat phase adjudication."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn


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
