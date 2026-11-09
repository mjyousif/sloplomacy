"""Movement rules over the map: who can move, support or be convoyed where, coasts included."""

from domain.models import ProvinceType, UnitType
from engine.topology.provinces import PROVINCES


def split_province_code(code: str) -> tuple[str, str | None]:
    if "/" in code:
        parts = code.split("/", 1)
        return parts[0].upper(), parts[1].upper()
    return code.upper(), None


def can_unit_move_directly(
    unit_type: UnitType,
    origin: str,
    origin_coast: str | None,
    target: str,
    target_coast: str | None = None,
) -> tuple[bool, str]:
    """Check if a unit at origin (with optional coast) can move directly to target (without convoy)."""
    if origin not in PROVINCES:
        return False, f"Unknown origin province '{origin}'."
    if target not in PROVINCES:
        return False, f"Unknown target province '{target}'."
    if origin == target:
        return False, "Move target cannot be the same as origin (use HOLD instead)."

    orig_prov = PROVINCES[origin]
    targ_prov = PROVINCES[target]

    if targ_prov.type == ProvinceType.IMPASSABLE:
        return False, f"{targ_prov.name} is impassable."

    if unit_type == UnitType.ARMY:
        if targ_prov.type == ProvinceType.SEA:
            return False, f"Army in {orig_prov.name} cannot enter sea zone {targ_prov.name}."
        if target in orig_prov.army_adj:
            return True, ""
        return False, f"Army in {orig_prov.name} is not adjacent to {targ_prov.name}."

    # Fleet logic
    if targ_prov.type == ProvinceType.LAND:
        return False, f"Fleet in {orig_prov.name} cannot move inland to {targ_prov.name}."

    coast_key = origin_coast or ""
    if orig_prov.coasts and not coast_key:
        # Fallback if coast wasn't specified on origin: check union of coasts
        possible_targets: list[str] = []
        for c_list in orig_prov.fleet_adj.values():
            possible_targets.extend(c_list)
    else:
        possible_targets = orig_prov.fleet_adj.get(coast_key, [])

    # Check if target or target/coast is in possible_targets
    matching_entries = [
        entry for entry in possible_targets if split_province_code(entry)[0] == target
    ]
    if not matching_entries:
        coast_label = f" ({origin_coast})" if origin_coast else ""
        return False, f"Fleet in {orig_prov.name}{coast_label} cannot move to {targ_prov.name}."

    # If target has multiple coasts and multiple coasts are reachable (e.g., CON -> BUL/EC or BUL/SC, MAO -> SPA/NC or SPA/SC)
    if targ_prov.coasts and target_coast:
        expected = f"{target}/{target_coast}"
        if expected not in matching_entries:
            return (
                False,
                f"Fleet in {orig_prov.name} cannot reach {targ_prov.name} ({target_coast}).",
            )

    return True, ""


def can_unit_support_province(
    unit_type: UnitType,
    origin: str,
    origin_coast: str | None,
    target_province: str,
) -> tuple[bool, str]:
    """
    A unit can support an action in target_province if it could move into target_province directly
    (ignoring which coast of target_province a fleet would land on).
    """
    return can_unit_move_directly(unit_type, origin, origin_coast, target_province, None)


def can_army_be_convoyed_theoretically(origin: str, target: str) -> bool:
    """Check if both origin and target are coastal provinces connected by at least one sea zone."""
    if origin not in PROVINCES or target not in PROVINCES or origin == target:
        return False
    orig_p = PROVINCES[origin]
    targ_p = PROVINCES[target]
    if orig_p.type != ProvinceType.COAST or targ_p.type != ProvinceType.COAST:
        return False
    return True
