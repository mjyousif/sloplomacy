"""Convoy orders and whether ordered fleets form a chain."""

from domain.board import Power, Unit, UnitType
from domain.issues import IssueCode
from domain.orders import Order, OrderType
from engine.validator.convoys import has_active_convoy_chain
from engine.validator.orchestrator import validate_orders


def test_validator_convoy_validation_and_chain():
    """Verify convoy chain BFS and BROKEN_CONVOY detection."""
    units = [
        Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
    ]

    # Case 1: Army attempts to move across sea to BEL with no convoy order
    orders_no_convoy = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.MOVE,
            target="BEL",
            is_explicit=True,
        ),
        "ENG_F_NTH": Order(
            unit_id="ENG_F_NTH",
            power=Power.ENGLAND,
            unit_type=UnitType.FLEET,
            origin="NTH",
            order_type=OrderType.HOLD,
            is_explicit=True,
        ),
    }
    assert has_active_convoy_chain("LON", "BEL", units, orders_no_convoy) is False
    issues1 = validate_orders(units, orders_no_convoy)
    assert any(i.code == IssueCode.BROKEN_CONVOY for i in issues1)

    # Case 2: Matching convoy orders form an active chain
    orders_valid_convoy = {
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
    assert has_active_convoy_chain("LON", "BEL", units, orders_valid_convoy) is True
    issues2 = validate_orders(units, orders_valid_convoy)
    assert not any(i.code == IssueCode.BROKEN_CONVOY for i in issues2)

    # Case 3: Fleet ordered to convoy an army that is holding in place
    orders_convoy_non_moving = {
        "ENG_A_LON": Order(
            unit_id="ENG_A_LON",
            power=Power.ENGLAND,
            unit_type=UnitType.ARMY,
            origin="LON",
            order_type=OrderType.HOLD,
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
    issues3 = validate_orders(units, orders_convoy_non_moving)
    assert any(i.code == IssueCode.BROKEN_CONVOY for i in issues3)
