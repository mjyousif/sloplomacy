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
