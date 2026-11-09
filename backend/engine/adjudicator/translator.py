"""Translate between this app's orders and phase names and the `diplomacy` engine's strings."""

from domain.board import Unit
from domain.orders import Order, OrderType
from engine.topology.provinces import PROVINCES


def to_diplomacy_phase_code(season: str, year: int, phase: str) -> str:
    s_abbr = season[0].upper()  # 'S', 'F', 'W'
    p_lower = phase.lower()
    if "retreat" in p_lower:
        p_abbr = "R"
    elif "adjust" in p_lower or "build" in p_lower:
        p_abbr = "A"
    else:
        p_abbr = "M"
    return f"{s_abbr}{year}{p_abbr}"


def parse_diplomacy_phase(phase_str: str) -> tuple[str, int, str]:
    # e.g. "SPRING 1901 MOVEMENT", "FALL 1901 MOVEMENT", "WINTER 1901 ADJUSTMENTS", "SPRING 1901 RETREATS"
    parts = phase_str.strip().split()
    if len(parts) >= 3:
        season = parts[0].capitalize()
        try:
            year = int(parts[1])
        except ValueError:
            year = 1901
        phase = parts[2].capitalize()
        return season, year, phase
    return "Spring", 1901, "Movement"


def order_to_diplomacy_str(order: Order, units_by_prov: dict[str, Unit]) -> str | None:
    """Translate an order for the engine, or return None if it is incomplete and cannot be."""
    u_type = order.unit_type.value if hasattr(order.unit_type, "value") else str(order.unit_type)
    orig = f"{order.origin}/{order.origin_coast}" if order.origin_coast else order.origin

    if order.order_type == OrderType.HOLD:
        return f"{u_type} {orig} H"
    elif order.order_type == OrderType.MOVE:
        if not order.target:
            return None
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else order.target
        if order.via_convoy:
            return f"{u_type} {orig} - {dest} VIA"
        return f"{u_type} {orig} - {dest}"
    elif order.order_type == OrderType.SUPPORT:
        if not order.aux_unit_origin:
            return None
        aux_prov = order.aux_unit_origin
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = (
            aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        )
        aux_orig = f"{aux_prov}/{aux_unit.coast}" if (aux_unit and aux_unit.coast) else aux_prov
        target_prov = order.target or aux_prov
        if target_prov == aux_prov:
            return f"{u_type} {orig} S {aux_type} {aux_orig}"
        else:
            return f"{u_type} {orig} S {aux_type} {aux_orig} - {target_prov}"
    elif order.order_type == OrderType.CONVOY:
        if not order.aux_unit_origin or not order.target:
            return None
        aux_prov = order.aux_unit_origin
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = (
            aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        )
        return f"{u_type} {orig} C {aux_type} {aux_prov} - {order.target}"
    elif order.order_type == OrderType.BUILD:
        if u_type == "A":
            return f"A {order.origin} B"
        prov_info = PROVINCES.get(order.origin)
        coast = order.origin_coast or order.target_coast
        if not coast and prov_info and prov_info.coasts:
            coast = prov_info.coasts[0]
        loc = (
            f"{order.origin}/{coast}"
            if (prov_info and prov_info.coasts and coast)
            else order.origin
        )
        return f"F {loc} B"
    elif order.order_type == OrderType.DISBAND:
        return f"{u_type} {orig} D"
    elif order.order_type == OrderType.RETREAT:
        if not order.target:
            return f"{u_type} {orig} D"
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else order.target
        return f"{u_type} {orig} R {dest}"
    elif order.order_type == OrderType.WAIVE:
        return "WAIVE"
    return None
