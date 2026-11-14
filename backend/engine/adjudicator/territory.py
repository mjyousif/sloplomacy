"""Who holds the land that is not a supply center.

`GameState.ownership` maps supply centers to their owners, and also land provinces that are not
supply centers to the last power that stood in them, which only colours the map. A supply center
changes hands under the rulebook's Fall-only rule. Any other land province is claimed by a unit
that ends a movement or retreat phase in it, Spring or Fall, and keeps that owner after the unit
leaves until another power's unit ends a phase there (issue #258).
"""

from domain.board import Power, ProvinceType, Unit
from engine.topology.provinces import PROVINCES


def is_claimable_territory(province: str) -> bool:
    """Land a unit claims by standing in it: neither sea, impassable, nor a supply center."""
    info = PROVINCES.get(province)
    return bool(
        info
        and not info.is_supply_center
        and info.type not in (ProvinceType.SEA, ProvinceType.IMPASSABLE)
    )


def supply_center_owners(ownership: dict[str, Power]) -> dict[str, Power]:
    """Only the supply centers in `ownership`: what counts for builds, standings and victory."""
    return {
        prov: pwr
        for prov, pwr in ownership.items()
        if prov in PROVINCES and PROVINCES[prov].is_supply_center
    }


def claim_occupied_territory(ownership: dict[str, Power], units: list[Unit]) -> None:
    """Give each non-supply-center land province to the power whose unit now stands in it."""
    for unit in units:
        if not unit.is_dislodged and is_claimable_territory(unit.province):
            ownership[unit.province] = unit.power
