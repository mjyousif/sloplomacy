"""Retreat phase checks: where each dislodged unit is ordered to go."""

from collections import defaultdict
from typing import Any

from domain.models import IssueCode, IssueSeverity, Order, OrderType, Power, Unit
from engine.topology import PROVINCES, split_province_code
from engine.validator.issues import IssueCollector, province_name


def validate_retreats(
    units: list[Unit],
    orders: dict[str, Order],
    retreats: dict[str, Any] | None,
    include_unassigned_warnings: bool,
    collector: IssueCollector,
) -> None:
    add_issue = collector.add
    p_name = province_name

    retreats_by_power_and_dest: dict[Power, dict[str, list[Unit]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for unit in units:
        if not unit.is_dislodged:
            continue
        order = orders.get(unit.id)
        if not order:
            continue

        if include_unassigned_warnings and not order.is_explicit:
            add_issue(
                severity=IssueSeverity.WARNING,
                code=IssueCode.UNASSIGNED_UNIT,
                title=f"No Retreat Ordered in {p_name(unit.province)}",
                message=f"Dislodged {unit.unit_type.value} {p_name(unit.province)} will disband unless it is ordered to retreat.",
                unit_ids=[unit.id],
                provinces=[unit.province],
                power=unit.power,
            )

        if order.order_type == OrderType.RETREAT:
            if not order.target or order.target not in PROVINCES:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_MOVE,
                    "Missing Retreat Destination",
                    f"Dislodged {unit.unit_type.value} {p_name(unit.province)} must select a valid retreat destination or Disband.",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            if retreats:
                u_loc = f"{unit.province}/{unit.coast}" if unit.coast else unit.province
                u_key = f"{unit.unit_type.value} {u_loc}"
                p_ret = retreats.get(unit.power.value, {})
                valid_locs = p_ret.get(
                    u_key, p_ret.get(f"{unit.unit_type.value} {unit.province}", [])
                )
                valid_bases = {split_province_code(loc)[0] for loc in valid_locs}
                if order.target not in valid_bases:
                    add_issue(
                        IssueSeverity.ERROR,
                        IssueCode.ILLEGAL_MOVE,
                        f"Illegal Retreat to {p_name(order.target)}",
                        f"Dislodged {unit.unit_type.value} {p_name(unit.province)} cannot retreat to {p_name(order.target)} (occupied, attacker origin, or contested bounce).",
                        [unit.id],
                        [unit.province, order.target],
                        unit.power,
                    )
            retreats_by_power_and_dest[unit.power][order.target].append(unit)

    for power, dest_map in retreats_by_power_and_dest.items():
        for dest, ret_units in dest_map.items():
            if len(ret_units) > 1:
                u_names = ", ".join(f"{u.unit_type.value} {p_name(u.province)}" for u in ret_units)
                add_issue(
                    IssueSeverity.WARNING,
                    IssueCode.SELF_BOUNCE,
                    f"Retreat Collision in {p_name(dest)}",
                    f"Multiple dislodged units ({u_names}) are retreating to {p_name(dest)}. In Diplomacy, colliding retreats bounce and BOTH units are disbanded!",
                    [u.id for u in ret_units],
                    [dest] + [u.province for u in ret_units],
                    power,
                )
