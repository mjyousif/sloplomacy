"""What a phase's resolution reads back from the engine, and the results it adds to."""

from dataclasses import dataclass, field
from typing import Any

from domain.models import Order, OrderResolution, Unit
from engine.topology import PROVINCES

# A unit as the engine reports it after processing: (unit type, base province, coast).
EngineUnit = tuple[str, str, str | None]


@dataclass
class ResolutionContext:
    units: list[Unit]
    orders: dict[str, Order]
    results_for_phase: dict[str, Any]
    engine_regular_by_pwr: dict[str, list[EngineUnit]]
    engine_dislodged_by_pwr: dict[str, list[EngineUnit]]
    # (power, unit type, province) of every order the engine kept. See adjudicate_turn.
    kept_orders: set[tuple[str, str, str]]
    resolutions: dict[str, OrderResolution] = field(default_factory=dict)
    summary: list[str] = field(default_factory=list)
    new_units: list[Unit] = field(default_factory=list)
    used_unit_ids: set[str] = field(default_factory=set)

    def engine_kept_order(self, u: Unit) -> bool:
        return (u.power.value, u.unit_type.value, u.province) in self.kept_orders

    @staticmethod
    def province_name(code: str | None) -> str:
        if not code:
            return ""
        return PROVINCES[code].name if code in PROVINCES else code
