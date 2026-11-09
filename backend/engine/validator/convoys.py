"""Whether fleets ordered to convoy form a connected chain for an army."""

from domain.models import Order, OrderType, ProvinceType, Unit, UnitType
from engine.topology import PROVINCES, split_province_code


def has_active_convoy_chain(
    army_origin: str,
    army_target: str,
    units: list[Unit],
    orders: dict[str, Order],
) -> bool:
    """
    Check if there is a connected chain of Fleets in SEA provinces ordered to CONVOY
    the army from army_origin to army_target.
    """
    convoying_sea_provs: set[str] = set()
    for u in units:
        if u.unit_type == UnitType.FLEET and PROVINCES[u.province].type == ProvinceType.SEA:
            order = orders.get(u.id)
            if (
                order
                and order.order_type == OrderType.CONVOY
                and order.aux_unit_origin == army_origin
                and order.target == army_target
            ):
                convoying_sea_provs.add(u.province)

    if not convoying_sea_provs:
        return False

    # BFS from sea zones adjacent to army_origin to sea zones adjacent to army_target
    def fleet_touches_land(sea_prov: str, land_prov: str) -> bool:
        adj = PROVINCES[sea_prov].fleet_adj.get("", [])
        return any(split_province_code(a)[0] == land_prov for a in adj)

    start_seas = {s for s in convoying_sea_provs if fleet_touches_land(s, army_origin)}
    end_seas = {s for s in convoying_sea_provs if fleet_touches_land(s, army_target)}

    if not start_seas or not end_seas:
        return False

    visited: set[str] = set()
    queue = list(start_seas)
    while queue:
        curr = queue.pop(0)
        if curr in end_seas:
            return True
        if curr in visited:
            continue
        visited.add(curr)
        for neighbor in PROVINCES[curr].fleet_adj.get("", []):
            base_n = split_province_code(neighbor)[0]
            if base_n in convoying_sea_provs and base_n not in visited:
                queue.append(base_n)

    return False
