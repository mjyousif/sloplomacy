"""Winter adjustment checks: builds and disbands against what each power owes."""

from typing import Any

from domain.models import IssueCode, IssueSeverity, Order, OrderType, Power, Unit
from engine.validator.issues import IssueCollector


def validate_adjustments(
    units: list[Unit],
    orders: dict[str, Order],
    builds: dict[str, Any] | None,
    include_unassigned_warnings: bool,
    collector: IssueCollector,
) -> None:
    add_issue = collector.add

    if builds:
        for p_str, b_info in builds.items():
            pwr = Power(p_str)
            count = b_info.get("count", 0)
            homes = b_info.get("homes", [])
            pwr_units = [u for u in units if u.power == pwr]
            if count < 0:
                needed_disbands = abs(count)
                disbanding_units = [
                    u
                    for u in pwr_units
                    if orders.get(u.id) and orders[u.id].order_type == OrderType.DISBAND
                ]
                if len(disbanding_units) < needed_disbands:
                    rem = needed_disbands - len(disbanding_units)
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.UNASSIGNED_UNIT,
                        f"Select {rem} More Unit{'s' if rem > 1 else ''} to Disband",
                        f"{p_str.capitalize()} has {len(pwr_units)} units but fewer supply centers and must disband {needed_disbands} unit{'s' if needed_disbands > 1 else ''} ({len(disbanding_units)}/{needed_disbands} selected).",
                        [u.id for u in pwr_units],
                        [u.province for u in pwr_units],
                        pwr,
                    )
            elif count > 0 and homes and include_unassigned_warnings:
                slots = min(count, len(homes))
                chosen = [
                    h
                    for h in homes
                    if orders.get(f"BUILD_{p_str}_{h}")
                    and orders[f"BUILD_{p_str}_{h}"].order_type == OrderType.BUILD
                ]
                undecided = [
                    h
                    for h in homes
                    if orders.get(f"BUILD_{p_str}_{h}")
                    and orders[f"BUILD_{p_str}_{h}"].order_type == OrderType.WAIVE
                    and not orders[f"BUILD_{p_str}_{h}"].is_explicit
                ]
                unused = slots - len(chosen)
                if unused > 0 and undecided:
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.UNASSIGNED_UNIT,
                        f"{unused} Unused Build{'s' if unused > 1 else ''}",
                        f"{p_str.capitalize()} may build {slots} unit{'s' if slots > 1 else ''} ({len(chosen)}/{slots} chosen). Builds not ordered are waived.",
                        [f"BUILD_{p_str}_{h}" for h in undecided],
                        undecided,
                        pwr,
                    )
