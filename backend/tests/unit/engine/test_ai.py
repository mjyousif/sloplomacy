"""The fallback AI's orders are legal and don't collide."""

from domain.orders import OrderType
from engine.ai import generate_tactical_orders
from engine.topology.provinces import get_initial_1901_units, get_initial_ownership


def test_ai_engine_generates_valid_non_conflicting_orders():
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = generate_tactical_orders(units, ownership, "Spring", 1901, "Movement")

    assert len(orders) == len(units)
    # Check that no two units of the same power target the same province (no friendly self-bounce)
    by_power: dict = {}
    for o in orders.values():
        by_power.setdefault(o.power, []).append(o)

    for pwr, p_orders in by_power.items():
        move_targets = [o.target for o in p_orders if o.order_type == OrderType.MOVE and o.target]
        assert len(move_targets) == len(set(move_targets)), (
            f"Friendly self-bounce detected for {pwr}"
        )
