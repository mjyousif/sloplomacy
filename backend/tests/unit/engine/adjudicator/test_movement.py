"""Movement adjudication: supports and cuts, convoys, bounces and dislodgements."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.adjudicator.resolver import adjudicate_turn
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership


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


def test_adjudicator_self_bounce_and_supported_advance():
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

    # France self-bounces in BUR
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "BUR"

    # Germany supports A MUN -> BUR? Wait: if France bounces in BUR (strength 1 vs 1), and Germany moves A MUN -> BUR (str 1), all three bounce!
    res = adjudicate_turn(units, orders, ownership)
    assert res.resolutions["FRA_A_PAR"].bounced is True
    assert res.resolutions["FRA_A_MAR"].bounced is True

    # Now if France supports A PAR -> BUR with A MAR, while Germany moves A MUN -> BUR (str 1):
    orders["FRA_A_MAR"].order_type = OrderType.SUPPORT
    orders["FRA_A_MAR"].aux_unit_origin = "PAR"
    orders["FRA_A_MAR"].target = "BUR"
    orders["GER_A_MUN"].order_type = OrderType.MOVE
    orders["GER_A_MUN"].target = "BUR"

    res2 = adjudicate_turn(units, orders, ownership)
    assert res2.resolutions["FRA_A_PAR"].succeeded is True
    assert res2.resolutions["FRA_A_PAR"].attack_strength == 2
    assert res2.resolutions["GER_A_MUN"].bounced is True
