"""The 1901 map data: adjacencies are symmetric and every province is there."""

from engine.topology.graph import split_province_code
from engine.topology.provinces import PROVINCES


def test_map_symmetry_and_75_provinces():
    # 75 playable provinces + 1 impassable Switzerland = 76 entries
    assert len(PROVINCES) == 76
    supply_centers = [p for p in PROVINCES.values() if p.is_supply_center]
    assert len(supply_centers) == 34

    # Check army adjacency symmetry
    for pid, pinfo in PROVINCES.items():
        for neighbor in pinfo.army_adj:
            assert neighbor in PROVINCES, f"{pid} references unknown army neighbor {neighbor}"
            assert pid in PROVINCES[neighbor].army_adj, (
                f"Army adjacency {pid} <-> {neighbor} is not symmetric!"
            )

    # Check fleet adjacency symmetry
    for pid, pinfo in PROVINCES.items():
        for coast, neighbors in pinfo.fleet_adj.items():
            full_self = f"{pid}/{coast}" if coast else pid
            for n_entry in neighbors:
                n_base, n_coast = split_province_code(n_entry)
                assert n_base in PROVINCES, (
                    f"{full_self} references unknown fleet neighbor {n_entry}"
                )
                n_fleet_list = PROVINCES[n_base].fleet_adj.get(n_coast or "", [])
                assert full_self in n_fleet_list, (
                    f"Fleet adjacency {full_self} <-> {n_entry} is not symmetric!"
                )
