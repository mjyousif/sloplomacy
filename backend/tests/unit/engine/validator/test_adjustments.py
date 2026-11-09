"""Winter checks: builds that would be lost."""

from domain.board import Power, UnitType
from domain.issues import IssueCode
from domain.orders import Order, OrderType
from engine.validator.orchestrator import validate_orders


def _french_build_slot(home, order_type, is_explicit):
    return Order(
        unit_id=f"BUILD_FRANCE_{home}",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin=home,
        order_type=order_type,
        is_explicit=is_explicit,
    )


def _build_warnings(orders, count=2):
    issues = validate_orders(
        [],
        {o.unit_id: o for o in orders},
        include_unassigned_warnings=True,
        phase="Adjustments",
        builds={"FRANCE": {"count": count, "homes": ["PAR", "MAR", "BRE"]}},
    )
    return [i for i in issues if i.code == IssueCode.UNASSIGNED_UNIT]


def test_validator_warns_about_builds_that_would_be_lost():
    orders = [
        _french_build_slot("PAR", OrderType.BUILD, True),
        _french_build_slot("MAR", OrderType.WAIVE, False),
        _french_build_slot("BRE", OrderType.WAIVE, False),
    ]

    warnings = _build_warnings(orders)

    assert len(warnings) == 1
    assert warnings[0].title == "1 Unused Build"
    assert warnings[0].provinces == ["MAR", "BRE"]


def test_validator_is_quiet_once_every_build_is_decided():
    all_used = [
        _french_build_slot("PAR", OrderType.BUILD, True),
        _french_build_slot("MAR", OrderType.BUILD, True),
        _french_build_slot("BRE", OrderType.WAIVE, False),
    ]
    waived_on_purpose = [
        _french_build_slot("PAR", OrderType.WAIVE, True),
        _french_build_slot("MAR", OrderType.WAIVE, True),
        _french_build_slot("BRE", OrderType.WAIVE, True),
    ]

    assert _build_warnings(all_used) == []
    assert _build_warnings(waived_on_purpose) == []
