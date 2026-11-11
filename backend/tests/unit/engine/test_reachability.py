"""Unit tests for backend-authoritative reachability: moves, convoys, sea paths, and supports."""

from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderType
from engine.reachability import compute_unit_options
from engine.reachability.sea_graph import (
    COASTS_BY_SEA,
    SEAS_BY_COAST,
    has_sea_path_through,
    sea_neighbors,
)


def _brute_simple_path(
    origin_coast: str, target_coast: str, via_sea: str, allowed_seas: set[str]
) -> bool:
    """Reference DFS over simple paths in `allowed_seas` for cross-checking Menger's 2-path solver."""
    if origin_coast == target_coast or via_sea not in allowed_seas:
        return False
    starts = set(SEAS_BY_COAST.get(origin_coast, ())) & allowed_seas
    ends = set(SEAS_BY_COAST.get(target_coast, ())) & allowed_seas

    def dfs(cur: str, seen: set[str], hit_via: bool) -> bool:
        if cur in ends and hit_via:
            return True
        for nb in sea_neighbors(cur):
            if nb in allowed_seas and nb not in seen:
                if dfs(nb, seen | {nb}, hit_via or nb == via_sea):
                    return True
        return False

    return any(dfs(s, {s}, s == via_sea) for s in starts)


def test_direct_moves_and_split_coasts():
    units = [
        Unit(id="FRA_A_PAR", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PAR"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
        Unit(
            id="RUS_F_STP",
            power=Power.RUSSIA,
            unit_type=UnitType.FLEET,
            province="STP",
            coast="SC",
        ),
    ]
    opts = compute_unit_options(units, {}, "Movement")
    assert set(opts["FRA_A_PAR"].direct_moves) == {"PIC", "BUR", "GAS", "BRE"}
    assert "SPA/NC" in opts["FRA_F_MAO"].direct_moves
    assert "SPA/SC" in opts["FRA_F_MAO"].direct_moves
    assert "BOT" in opts["RUS_F_STP"].direct_moves
    assert "BAR" not in opts["RUS_F_STP"].direct_moves


def test_retreats_adjustments_and_won_games():
    dislodged = Unit(
        id="FRA_A_PAR",
        power=Power.FRANCE,
        unit_type=UnitType.ARMY,
        province="PAR",
        is_dislodged=True,
    )
    standing = Unit(id="GER_A_PAR", power=Power.GERMANY, unit_type=UnitType.ARMY, province="PAR")
    retreats = {"FRANCE": {"A PAR": ["GAS", "PIC"]}}
    ret_opts = compute_unit_options([dislodged, standing], {}, "Retreats", retreats=retreats)
    assert list(ret_opts) == ["FRA_A_PAR"]
    assert ret_opts["FRA_A_PAR"].direct_moves == ["GAS", "PIC"]

    assert compute_unit_options([standing], {}, "Adjustments") == {}
    assert compute_unit_options([standing], {}, "Movement", winner=Power.FRANCE) == {}


def test_army_convoy_destinations_and_adjacent_via_convoy():
    """Active convoys turn green (including adjacent swap-via-convoy coasts); others stay potential."""
    units = [
        Unit(id="FRA_A_PIC", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIC"),
        Unit(id="FRA_F_ENG", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ENG"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
    ]
    opts_idle = compute_unit_options(units, {}, "Movement")["FRA_A_PIC"]
    assert opts_idle.active_convoys == []
    # Both distant Spain and adjacent Belgium can be reached by convoy across ENG/MAO
    assert "SPA" in opts_idle.potential_convoys
    assert "BEL" in opts_idle.potential_convoys

    # Ordering F ENG C A PIC -> BEL promotes adjacent BEL to active_convoys (DATC 4.A.3 swap)
    orders_adj = {
        "FRA_F_ENG": Order(
            unit_id="FRA_F_ENG",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="BEL",
            is_explicit=True,
        )
    }
    opts_adj = compute_unit_options(units, orders_adj, "Movement")["FRA_A_PIC"]
    assert opts_adj.active_convoys == ["BEL"]
    assert "BEL" not in opts_adj.potential_convoys

    # Ordering both F ENG and F MAO promotes 2-fleet SPA to active_convoys
    orders_chain = {
        "FRA_F_ENG": Order(
            unit_id="FRA_F_ENG",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="SPA",
            is_explicit=True,
        ),
        "FRA_F_MAO": Order(
            unit_id="FRA_F_MAO",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="MAO",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="SPA",
            is_explicit=True,
        ),
    }
    opts_chain = compute_unit_options(units, orders_chain, "Movement")["FRA_A_PIC"]
    assert opts_chain.active_convoys == ["SPA"]


def test_fleet_convoy_options_exclude_dead_end_non_path_coasts_and_promote_ready_chains():
    """F MAO cannot carry A PIC to LON/WAL/BEL (path never visits MAO), and promotes SPA once F ENG convoys."""
    units = [
        Unit(id="FRA_A_PIC", power=Power.FRANCE, unit_type=UnitType.ARMY, province="PIC"),
        Unit(id="GER_A_HOL", power=Power.GERMANY, unit_type=UnitType.ARMY, province="HOL"),
        Unit(id="FRA_F_ENG", power=Power.FRANCE, unit_type=UnitType.FLEET, province="ENG"),
        Unit(id="FRA_F_MAO", power=Power.FRANCE, unit_type=UnitType.FLEET, province="MAO"),
        Unit(id="ENG_F_NTH", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="NTH"),
    ]
    opts = compute_unit_options(units, {}, "Movement")

    # F MAO -> A PIC: must include MAO shores (SPA, POR, NAF, GAS, BRE) and exclude ENG/NTH-only shores
    mao_pic = opts["FRA_F_MAO"].convoy_targets["PIC"]
    assert mao_pic.direct == []
    assert {"SPA", "POR", "NAF", "GAS", "BRE"} <= set(mao_pic.chained)
    for dead_end in ("LON", "WAL", "BEL", "NWY", "DEN"):
        assert dead_end not in mao_pic.direct
        assert dead_end not in mao_pic.chained

    # F ENG -> A HOL: must exclude NTH-only shores (NWY, DEN, EDI, YOR)
    eng_hol = opts["FRA_F_ENG"].convoy_targets["HOL"]
    for nth_only in ("NWY", "DEN", "EDI", "YOR"):
        assert nth_only not in eng_hol.direct
        assert nth_only not in eng_hol.chained
    assert {"LON", "WAL", "BRE", "PIC"} <= set(eng_hol.chained)

    # Once F ENG is ordered CONVOY A PIC -> SPA, F MAO promotes SPA to direct (completes chain!)
    orders = {
        "FRA_F_ENG": Order(
            unit_id="FRA_F_ENG",
            power=Power.FRANCE,
            unit_type=UnitType.FLEET,
            origin="ENG",
            order_type=OrderType.CONVOY,
            aux_unit_origin="PIC",
            target="SPA",
            is_explicit=True,
        )
    }
    opts_after = compute_unit_options(units, orders, "Movement")
    mao_pic_after = opts_after["FRA_F_MAO"].convoy_targets["PIC"]
    assert mao_pic_after.direct == ["SPA"]
    assert "SPA" not in mao_pic_after.chained


def test_has_sea_path_through_matches_brute_force_simple_paths():
    """Verify Menger 2-disjoint-path check equals exact simple-path search across tricky topologies."""
    allowed = {"NTH", "ENG", "MAO", "IRI", "NAO", "HEL", "SKA", "WES"}
    coasts = sorted({c for s in allowed for c in COASTS_BY_SEA[s]})
    for via in sorted(allowed):
        for orig in coasts[:10]:
            for dest in coasts[:10]:
                assert has_sea_path_through(orig, dest, via, allowed) == _brute_simple_path(
                    orig, dest, via, allowed
                ), f"Mismatch for {orig} -> {dest} via {via}"


def test_valid_supports_include_convoyed_moves_and_split_coasts():
    units = [
        Unit(id="ENG_A_LON", power=Power.ENGLAND, unit_type=UnitType.ARMY, province="LON"),
        Unit(id="ENG_F_ENG", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="ENG"),
        Unit(id="ENG_F_MAO", power=Power.ENGLAND, unit_type=UnitType.FLEET, province="MAO"),
        Unit(id="FRA_F_WES", power=Power.FRANCE, unit_type=UnitType.FLEET, province="WES"),
    ]
    opts = compute_unit_options(units, {}, "Movement")
    wes_sup = {s.unit_id: s for s in opts["FRA_F_WES"].valid_supports}
    # F WES borders SPA and NAF, which A LON can reach via ENG -> MAO convoy!
    assert "ENG_A_LON" in wes_sup
    assert {"NAF", "SPA"} <= set(wes_sup["ENG_A_LON"].moves)
