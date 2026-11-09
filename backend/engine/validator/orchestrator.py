"""validate_orders: run every check for the current phase, in a fixed order."""

from typing import Any

from domain.models import Order, Power, Unit, ValidationIssue
from engine.validator.adjustments import validate_adjustments
from engine.validator.diagnostics import check_friendly_bounces
from engine.validator.issues import IssueCollector
from engine.validator.legality import check_unit_orders
from engine.validator.retreats import validate_retreats


def validate_orders(
    units: list[Unit],
    orders: dict[str, Order],
    include_unassigned_warnings: bool = False,
    target_power: Power | None = None,
    phase: str = "Movement",
    builds: dict[str, Any] | None = None,
    retreats: dict[str, Any] | None = None,
) -> list[ValidationIssue]:
    """
    Perform comprehensive legality & tactical sanity checks on all current orders.
    Supports Movement, Retreats, and Winter Adjustments phases.
    """
    collector = IssueCollector(target_power)
    unit_by_prov: dict[str, Unit] = {u.province: u for u in units if not u.is_dislodged}

    # --- RETREATS PHASE VALIDATION ---
    if phase == "Retreats":
        validate_retreats(units, orders, retreats, include_unassigned_warnings, collector)
        return collector.issues

    # --- WINTER ADJUSTMENTS PHASE VALIDATION ---
    if phase == "Adjustments":
        validate_adjustments(units, orders, builds, include_unassigned_warnings, collector)
        return collector.issues

    # --- MOVEMENT PHASE VALIDATION ---
    # 1. Per-unit legality & tactical checks
    check_unit_orders(units, orders, unit_by_prov, include_unassigned_warnings, collector)
    # 2. Check Friendly Self-Bounces & Friendly Occupied Bounces per Great Power
    check_friendly_bounces(units, orders, unit_by_prov, collector)
    return collector.issues
