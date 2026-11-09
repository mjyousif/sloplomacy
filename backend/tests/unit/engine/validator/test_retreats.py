"""Retreat checks: a dislodged unit left without a retreat disbands."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.validator.orchestrator import validate_orders


def test_validator_warns_that_an_unordered_retreat_disbands():
    unit = Unit(
        id="FRA_A_BUR",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        province="BUR",
        is_dislodged=True,
    )
    order = Order(
        unit_id=unit.id,
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        origin="BUR",
        order_type=OrderType.DISBAND,
        is_explicit=False,
    )

    issues = validate_orders(
        [unit], {unit.id: order}, include_unassigned_warnings=True, phase="Retreats"
    )

    assert any("will disband" in i.message for i in issues)
