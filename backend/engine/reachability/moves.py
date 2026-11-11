"""Where a unit can step to: its adjacent moves, or in a retreat phase its legal retreats."""

from typing import Any

from domain.board import Unit, UnitType
from engine.topology.provinces import PROVINCES


def _dedupe(entries: list[str]) -> list[str]:
    return list(dict.fromkeys(entries))


def direct_move_codes(unit: Unit) -> list[str]:
    """
    Adjacent provinces in map order. A fleet's entry onto a split coast keeps its coast
    ("SPA/NC"), exactly as the topology lists it.
    """
    origin = PROVINCES.get(unit.province)
    if not origin:
        return []
    if unit.unit_type == UnitType.ARMY:
        return _dedupe(list(origin.army_adj))
    if origin.coasts and not unit.coast:
        entries = [e for coast_list in origin.fleet_adj.values() for e in coast_list]
    else:
        entries = list(origin.fleet_adj.get(unit.coast or "", []))
    return _dedupe(entries)


def retreat_codes(unit: Unit, retreats: dict[str, Any] | None) -> list[str]:
    """The retreats the adjudicator allows a dislodged unit, keyed as `A PAR` or `F SPA/NC`."""
    if not unit.is_dislodged or not retreats:
        return []
    by_unit = retreats.get(unit.power.value) or {}
    loc = f"{unit.province}/{unit.coast}" if unit.coast else unit.province
    kind = unit.unit_type.value
    raw = by_unit.get(f"{kind} {loc}") or by_unit.get(f"{kind} {unit.province}") or []
    return _dedupe([str(code).upper() for code in raw])
