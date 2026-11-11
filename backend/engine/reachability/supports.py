"""Which units a piece can support, and into which provinces.

A unit supports into a province it could move to directly, ignoring which coast a fleet
would land on. It can support a hold where the other unit stands, and a move wherever that
unit could go, by land or by a convoy fleets on the board could form.
"""

from domain.board import Unit
from domain.game_state import SupportOption
from engine.topology.graph import split_province_code


def supportable_provinces(direct_moves: list[str]) -> set[str]:
    """Provinces a piece can lend support into: the bases of its direct moves."""
    return {split_province_code(code)[0] for code in direct_moves}


def valid_supports(
    supporter: Unit,
    units: list[Unit],
    reach_by_unit: dict[str, set[str]],
    support_into: set[str],
) -> list[SupportOption]:
    """Every other unit `supporter` can legally support, with the provinces it can support."""
    if supporter.is_dislodged:
        return []
    options: list[SupportOption] = []
    for other in units:
        if other.id == supporter.id or other.is_dislodged:
            continue
        hold = other.province in support_into
        moves = sorted(
            (reach_by_unit.get(other.id, set()) & support_into)
            - {other.province, supporter.province}
        )
        if hold or moves:
            options.append(
                SupportOption(unit_id=other.id, province=other.province, hold=hold, moves=moves)
            )
    return options
