from adjudicator import adjudicate_turn
from models import Order, OrderType, Power, Unit, UnitType


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

    rus_stp = next((u for u in res.new_units if u.power == Power.RUSSIA and u.province == "STP"), None)
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

