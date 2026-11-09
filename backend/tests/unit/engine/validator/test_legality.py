"""Movement checks one unit at a time: illegal moves and supports, unconfirmed orders."""

from domain.board import Power, Unit, UnitType
from domain.issues import IssueCode, IssueSeverity
from domain.orders import Order, OrderType
from engine.topology.provinces import get_initial_1901_units
from engine.validator.orchestrator import validate_orders


def test_validator_illegal_moves_and_support_boundaries():
    """Detect illegal moves and out-of-reach supports."""
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_F_BRE", power=Power.FRANCE, unit_type=UnitType.FLEET, province="BRE"),
    ]

    orders = {
        # Army cannot move into the English Channel (sea)
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.MOVE,
            target="ENG",
            is_explicit=True,
        ),
        # Fleet in Brest cannot move inland to Paris
        "FRA_F_BRE": Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.MOVE,
            target="PAR",
            is_explicit=True,
        ),
    }
    issues = validate_orders(units, orders)
    error_codes = [i.code for i in issues if i.severity == IssueSeverity.ERROR]
    assert error_codes.count(IssueCode.ILLEGAL_MOVE) == 2

    # Support out of reach: Army in Paris cannot support into Rome
    orders_support = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="BRE",
            target="ROM",
            is_explicit=True,
        ),
        "FRA_F_BRE": Order(
            unit_id="FRA_F_BRE",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="BRE",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }
    issues_sup = validate_orders(units, orders_support)
    assert any(i.code == IssueCode.ILLEGAL_SUPPORT for i in issues_sup)

    # Unit cannot support itself
    orders_self_sup = {
        "FRA_A_PAR": Order(
            unit_id="FRA_A_PAR",
            power=Power.FRANCE,
            unit_type=UnitType.ARMY,
            origin="PAR",
            order_type=OrderType.SUPPORT,
            aux_unit_origin="PAR",
            target="PAR",
            is_explicit=True,
        ),
    }
    issues_self = validate_orders(units[:1], orders_self_sup)
    assert any(i.code == IssueCode.VOID_SUPPORT_SELF for i in issues_self)


def test_validator_unassigned_unit_warnings():
    """Unassigned units generate warnings only when requested."""
    units = get_initial_1901_units()[:2]
    orders = {
        u.id: Order(
            unit_id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            origin=u.province,
            order_type=OrderType.HOLD,
            is_explicit=False,
        )
        for u in units
    }

    no_warn = validate_orders(units, orders, include_unassigned_warnings=False)
    assert not any(i.code == IssueCode.UNASSIGNED_UNIT for i in no_warn)

    with_warn = validate_orders(units, orders, include_unassigned_warnings=True)
    assert sum(1 for i in with_warn if i.code == IssueCode.UNASSIGNED_UNIT) == 2
