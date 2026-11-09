"""Supply center capture timing and winter builds and disbands."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership


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


def test_spring_vs_fall_sc_ownership_and_winter_builds():
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in units
    }

    # France: A MAR -> SPA, A PAR -> BUR, F BRE -> MAO in Spring 1901
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "SPA"
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_F_BRE"].order_type = OrderType.MOVE
    orders["FRA_F_BRE"].target = "MAO"

    # Spring resolution: A MAR occupies SPA, but SPA must NOT be owned yet!
    res_spring = adjudicate_turn(units, orders, ownership, "Spring", 1901, "Movement")
    assert "SPA" not in res_spring.new_ownership, "Supply centers should not be captured in Spring!"
    assert res_spring.next_season == "Fall"
    assert res_spring.next_year == 1901
    assert res_spring.next_phase == "Movement"

    # Fall resolution: France moves into POR and BEL
    fall_units = res_spring.new_units
    fall_orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            origin_coast=u.coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )
        for u in fall_units
    }
    fall_orders["FRA_A_PAR"].order_type = OrderType.MOVE
    fall_orders["FRA_A_PAR"].target = "BEL"
    fall_orders["FRA_F_BRE"].order_type = OrderType.MOVE
    fall_orders["FRA_F_BRE"].target = "POR"

    res_fall = adjudicate_turn(
        fall_units, fall_orders, res_spring.new_ownership, "Fall", 1901, "Movement"
    )
    # In Fall, ownership updates!
    assert res_fall.new_ownership.get("SPA") == Power.FRANCE
    assert res_fall.new_ownership.get("BEL") == Power.FRANCE
    assert res_fall.new_ownership.get("POR") == Power.FRANCE
    assert res_fall.next_season == "Winter"
    assert res_fall.next_phase == "Adjustments"
    assert res_fall.builds is not None
    assert res_fall.builds["FRANCE"]["count"] == 3
    assert set(res_fall.builds["FRANCE"]["homes"]) == {"BRE", "MAR", "PAR"}

    # Winter adjustments: France orders builds in PAR, BRE, MAR
    winter_units = res_fall.new_units
    winter_orders = {}
    for h in res_fall.builds["FRANCE"]["homes"]:
        b_id = f"BUILD_FRANCE_{h}"
        winter_orders[b_id] = Order(
            unit_id=b_id,
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin=h,
            order_type=OrderType.BUILD,
            is_explicit=True,
        )

    res_winter = adjudicate_turn(
        winter_units, winter_orders, res_fall.new_ownership, "Winter", 1901, "Adjustments"
    )
    assert res_winter.next_season == "Spring"
    assert res_winter.next_year == 1902
    assert res_winter.next_phase == "Movement"
    fra_1902_units = [u for u in res_winter.new_units if u.power == Power.FRANCE]
    assert len(fra_1902_units) == 6
