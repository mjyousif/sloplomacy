"""Movement checks across units: friendly fire, self-bounces, swaps and unmatched supports."""

from domain.board import Power, Unit, UnitType
from domain.issues import IssueCode
from domain.orders import Order, OrderType
from engine.topology.provinces import get_initial_1901_units
from engine.validator.orchestrator import validate_orders


def test_validator_friendly_fire():
    """Supporting an opponent attack against your own holding unit triggers FRIENDLY_FIRE."""
    units = [
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
        Unit(id="GER_A_MUN", power=Power.GERMANY, unit_type=UnitType.ARMY, province="MUN"),
    ]
    orders = {
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "GER_A_MUN": Order(
            unit_id="GER_A_MUN",
            power=Power.GERMANY,
            unit_type=UnitType.ARMY,
            origin="MUN",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
        # France orders A MAR to support Germany's attack into French-held Burgundy!
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="MUN",
            target="BUR",
            is_explicit=True,
        ),
    }

    issues = validate_orders(units, orders, target_power=Power.FRANCE)
    codes = {i.code for i in issues}
    assert IssueCode.FRIENDLY_FIRE in codes
    ff_issue = next(i for i in issues if i.code == IssueCode.FRIENDLY_FIRE)
    assert "Burgundy" in ff_issue.message
    assert "FRA_A_BUR" in ff_issue.unit_ids


def test_validator_self_occupied_bounce_and_direct_swap():
    """Moving into a friendly occupied province without vacation triggers SELF_OCCUPIED_BOUNCE."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
    ]
    orders = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="PAR",
            is_explicit=True,
        ),
    }

    issues = validate_orders(units, orders)
    codes = {i.code for i in issues}
    assert IssueCode.SELF_OCCUPIED_BOUNCE in codes

    # Test direct head-to-head swap without a convoy
    units_swap = [
        Unit(id="FRA_A_BUR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="BUR"),
        Unit(id="FRA_A_MAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="MAR"),
    ]
    orders_swap = {
        "FRA_A_BUR": Order(
            unit_id="FRA_A_BUR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="BUR",
            order_type=OrderType.MOVE,
            target="MAR",
            is_explicit=True,
        ),
        "FRA_A_MAR": Order(
            unit_id="FRA_A_MAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="MAR",
            order_type=OrderType.MOVE,
            target="BUR",
            is_explicit=True,
        ),
    }
    issues_swap = validate_orders(units_swap, orders_swap)
    swap_issues = [i for i in issues_swap if "Direct Swap" in i.title]
    assert len(swap_issues) == 1
    assert swap_issues[0].code == IssueCode.SELF_BOUNCE


def test_self_bounce_and_unmatched_support_validation():
    units = get_initial_1901_units()
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

    # France orders A PAR -> BUR and A MAR -> BUR (Self-Bounce!)
    orders["FRA_A_PAR"].order_type = OrderType.MOVE
    orders["FRA_A_PAR"].target = "BUR"
    orders["FRA_A_MAR"].order_type = OrderType.MOVE
    orders["FRA_A_MAR"].target = "BUR"

    # England orders F EDI to support F LON -> NTH, while F LON is holding (Unmatched Support!)
    orders["ENG_F_EDI"].order_type = OrderType.SUPPORT
    orders["ENG_F_EDI"].aux_unit_origin = "LON"
    orders["ENG_F_EDI"].target = "NTH"

    issues = validate_orders(units, orders)
    codes = {i.code for i in issues}
    assert IssueCode.SELF_BOUNCE in codes
    assert IssueCode.UNMATCHED_SUPPORT in codes


def test_foreign_support_does_not_leak_into_friendly_bounce_diagnostics():
    """Secret foreign support must not alter friendly bounce warnings or leak support presence."""
    units = [
        Unit(id="ITA_A_VEN", power=Power.ITALY, unit_type=UnitType.ARMY, province="VEN"),
        Unit(id="ITA_A_PIE", power=Power.ITALY, unit_type=UnitType.ARMY, province="PIE"),
        Unit(id="AUT_A_TRI", power=Power.AUSTRIA, unit_type=UnitType.ARMY, province="TRI"),
    ]
    orders = {
        "ITA_A_VEN": Order(
            unit_id="ITA_A_VEN",
            power=Power.ITALY,
            unit_type=UnitType.ARMY,
            origin="VEN",
            order_type=OrderType.MOVE,
            target="TYR",
            is_explicit=True,
        ),
        "ITA_A_PIE": Order(
            unit_id="ITA_A_PIE",
            power=Power.ITALY,
            unit_type=UnitType.ARMY,
            origin="PIE",
            order_type=OrderType.MOVE,
            target="TYR",
            is_explicit=True,
        ),
        # Austria secretly supports Italy's Army Venice to Tyrolia
        "AUT_A_TRI": Order(
            unit_id="AUT_A_TRI",
            power=Power.AUSTRIA,
            unit_type=UnitType.ARMY,
            origin="TRI",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="VEN",
            target="TYR",
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    ita_bounce_issues = [
        i for i in issues if i.power == Power.ITALY and i.code == IssueCode.SELF_BOUNCE
    ]
    assert len(ita_bounce_issues) == 1
    issue = ita_bounce_issues[0]
    # Italy must see equal strength self-bounce, not "Even with support on Army Venice"
    assert "equal strength (1)" in issue.message
    assert "Even with support" not in issue.message


def test_support_hold_of_own_unit_is_not_friendly_fire():
    """Issue #256: supporting your own unit to hold is not an attack on it."""
    units = [
        Unit(id="AUS_A_BOH", power=Power.AUSTRIA, unit_type=UnitType.ARMY, province="BOH"),
        Unit(id="AUS_A_TYR", power=Power.AUSTRIA, unit_type=UnitType.ARMY, province="TYR"),
    ]
    orders = {
        "AUS_A_TYR": Order(
            unit_id="AUS_A_TYR",
            power=Power.AUSTRIA,
            unit_type=UnitType.ARMY,
            origin="TYR",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
        "AUS_A_BOH": Order(
            unit_id="AUS_A_BOH",
            power=Power.AUSTRIA,
            unit_type=UnitType.ARMY,
            origin="BOH",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="TYR",
            target="TYR",
            is_explicit=True,
        ),
    }

    issues = validate_orders(units, orders, target_power=Power.AUSTRIA)
    assert issues == []
