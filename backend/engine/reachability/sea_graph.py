"""The sea zones a convoy can travel through, and the coasts each one touches.

Built once from the static map. Only fleets in sea zones convoy, so coastal fleets never
appear here.
"""

from collections import defaultdict, deque
from collections.abc import Callable

from domain.board import ProvinceType, Unit, UnitType
from engine.topology.graph import split_province_code
from engine.topology.provinces import PROVINCES


def _build_tables() -> tuple[
    dict[str, frozenset[str]],
    dict[str, frozenset[str]],
    dict[str, tuple[str, ...]],
]:
    seas_by_coast: dict[str, set[str]] = {}
    coasts_by_sea: dict[str, set[str]] = {}
    neighbors_by_sea: dict[str, tuple[str, ...]] = {}
    for sea_id, sea in PROVINCES.items():
        if sea.type != ProvinceType.SEA:
            continue
        coasts_by_sea[sea_id] = set()
        adj_seas: list[str] = []
        for entry in sea.fleet_adj.get("", []):
            base = split_province_code(entry)[0]
            prov = PROVINCES.get(base)
            if not prov:
                continue
            if prov.type == ProvinceType.COAST:
                coasts_by_sea[sea_id].add(base)
                seas_by_coast.setdefault(base, set()).add(sea_id)
            elif prov.type == ProvinceType.SEA:
                adj_seas.append(base)
        neighbors_by_sea[sea_id] = tuple(adj_seas)
    return (
        {k: frozenset(v) for k, v in seas_by_coast.items()},
        {k: frozenset(v) for k, v in coasts_by_sea.items()},
        neighbors_by_sea,
    )


SEAS_BY_COAST, COASTS_BY_SEA, SEA_NEIGHBORS = _build_tables()


def sea_neighbors(sea: str) -> tuple[str, ...]:
    """Sea zones a fleet in `sea` touches."""
    return SEA_NEIGHBORS.get(sea, ())


def stationed_sea_fleets(units: list[Unit]) -> dict[str, Unit]:
    """Fleets that can convoy this phase, by the sea zone they hold."""
    return {
        u.province: u
        for u in units
        if u.unit_type == UnitType.FLEET
        and not u.is_dislodged
        and PROVINCES.get(u.province)
        and PROVINCES[u.province].type == ProvinceType.SEA
    }


def connected_seas(start: set[str], allowed: set[str]) -> set[str]:
    """Every sea zone in `allowed` linked to `start` through other zones in `allowed`."""
    seen = {s for s in start if s in allowed}
    queue = deque(seen)
    while queue:
        for nxt in sea_neighbors(queue.popleft()):
            if nxt in allowed and nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return seen


def coasts_touching(seas: set[str]) -> set[str]:
    """Coastal provinces bordering any of `seas`."""
    out: set[str] = set()
    for sea in seas:
        out |= COASTS_BY_SEA.get(sea, frozenset())
    return out


def _menger_two_disjoint_paths(
    starts: frozenset[str],
    ends: frozenset[str],
    via_sea: str,
    component: set[str],
) -> bool:
    """Menger's 2-vertex-disjoint paths from `via_sea`: one to `starts`, one to `ends`."""
    cap: dict[tuple[str, str], int] = defaultdict(int)
    adj: dict[str, set[str]] = defaultdict(set)

    def add_edge(u: str, v: str, c: int = 1) -> None:
        cap[(u, v)] += c
        adj[u].add(v)
        adj[v].add(u)

    src, snk, goal_a, goal_b = "_SRC", "_SNK", "_A", "_B"
    add_edge(src, f"{via_sea}:out", 2)
    add_edge(goal_a, snk, 1)
    add_edge(goal_b, snk, 1)

    for s in component:
        if s != via_sea:
            add_edge(f"{s}:in", f"{s}:out", 1)
        if s in starts:
            add_edge(f"{s}:out", goal_a, 1)
        if s in ends:
            add_edge(f"{s}:out", goal_b, 1)
        for nb in SEA_NEIGHBORS.get(s, ()):
            if nb in component and nb != via_sea:
                add_edge(f"{s}:out", f"{nb}:in", 1)

    for _ in range(2):
        parent: dict[str, str | None] = {src: None}
        q = deque([src])
        while q and snk not in parent:
            cur = q.popleft()
            for nxt in adj[cur]:
                if nxt not in parent and cap[(cur, nxt)] > 0:
                    parent[nxt] = cur
                    q.append(nxt)
        if snk not in parent:
            return False
        node = snk
        while (prev := parent[node]) is not None:
            cap[(prev, node)] -= 1
            cap[(node, prev)] += 1
            node = prev
    return True


def build_sea_path_checker(
    via_sea: str,
    allowed_seas: set[str],
) -> Callable[[str, str], bool]:
    """Return a cached `(origin_coast, target_coast) -> bool` checker for `via_sea`."""
    if via_sea not in allowed_seas:
        return lambda _o, _t: False

    component = connected_seas({via_sea}, allowed_seas)

    # Connected components of `component - {via_sea}` let us resolve cross-component pairs in O(1).
    comp_id: dict[str, int] = {}
    cid = 0
    for s in component:
        if s == via_sea or s in comp_id:
            continue
        comp_id[s] = cid
        q = deque([s])
        while q:
            cur = q.popleft()
            for nb in SEA_NEIGHBORS.get(cur, ()):
                if nb != via_sea and nb in component and nb not in comp_id:
                    comp_id[nb] = cid
                    q.append(nb)
        cid += 1

    # Pre-build the static Menger network for `(component, via_sea)` once; each miss only
    # wires `starts -> _A` and `ends -> _B` on top of a shallow copy.
    src, snk, goal_a, goal_b = "_SRC", "_SNK", "_A", "_B"
    base_cap: dict[tuple[str, str], int] = defaultdict(int)
    base_adj: dict[str, list[str]] = defaultdict(list)

    def _add_base(u: str, v: str, c: int) -> None:
        if (u, v) not in base_cap and (v, u) not in base_cap:
            base_adj[u].append(v)
            base_adj[v].append(u)
        base_cap[(u, v)] += c

    _add_base(src, f"{via_sea}:out", 2)
    _add_base(goal_a, snk, 1)
    _add_base(goal_b, snk, 1)
    for s in component:
        if s != via_sea:
            _add_base(f"{s}:in", f"{s}:out", 1)
        for nb in SEA_NEIGHBORS.get(s, ()):
            if nb in component and nb != via_sea:
                _add_base(f"{s}:out", f"{nb}:in", 1)

    coast_seas: dict[str, frozenset[str]] = {}
    coast_comps: dict[str, frozenset[int]] = {}
    for coast in coasts_touching(component):
        seas = SEAS_BY_COAST[coast] & component
        coast_seas[coast] = seas
        coast_comps[coast] = frozenset(comp_id[s] for s in seas if s != via_sea)

    cache: dict[tuple[frozenset[str], frozenset[str]], bool] = {}

    def _run_menger(starts: frozenset[str], ends: frozenset[str]) -> bool:
        cap = base_cap.copy()
        extra_adj: dict[str, list[str]] = {}
        for s in starts:
            u = f"{s}:out"
            cap[(u, goal_a)] = 1
            extra_adj.setdefault(u, []).append(goal_a)
            extra_adj.setdefault(goal_a, []).append(u)
        for s in ends:
            u = f"{s}:out"
            cap[(u, goal_b)] = 1
            extra_adj.setdefault(u, []).append(goal_b)
            extra_adj.setdefault(goal_b, []).append(u)

        for _ in range(2):
            parent: dict[str, str | None] = {src: None}
            q = deque([src])
            while q and snk not in parent:
                cur = q.popleft()
                for nxt in base_adj.get(cur, ()):
                    if nxt not in parent and cap.get((cur, nxt), 0) > 0:
                        parent[nxt] = cur
                        q.append(nxt)
                for nxt in extra_adj.get(cur, ()):
                    if nxt not in parent and cap.get((cur, nxt), 0) > 0:
                        parent[nxt] = cur
                        q.append(nxt)
            if snk not in parent:
                return False
            node = snk
            while (prev := parent[node]) is not None:
                cap[(prev, node)] = cap.get((prev, node), 0) - 1
                cap[(node, prev)] = cap.get((node, prev), 0) + 1
                node = prev
        return True

    def check(origin_coast: str, target_coast: str) -> bool:
        if origin_coast == target_coast:
            return False
        starts = coast_seas.get(origin_coast)
        ends = coast_seas.get(target_coast)
        if not starts or not ends:
            return False
        if via_sea in starts or via_sea in ends:
            return True

        sc = coast_comps[origin_coast]
        ec = coast_comps[target_coast]
        if len(sc) > 1 or len(ec) > 1 or sc != ec:
            return True

        if (starts, ends) in cache:
            return cache[(starts, ends)]
        if (ends, starts) in cache:
            return cache[(ends, starts)]
        res = _run_menger(starts, ends)
        cache[(starts, ends)] = res
        return res

    return check


def has_sea_path_through(
    origin_coast: str,
    target_coast: str,
    via_sea: str,
    allowed_seas: set[str],
) -> bool:
    """True when a simple path of `allowed_seas` from `origin_coast` to `target_coast` visits `via_sea`."""
    if origin_coast == target_coast or via_sea not in allowed_seas:
        return False
    starts = SEAS_BY_COAST.get(origin_coast, frozenset()) & allowed_seas
    ends = SEAS_BY_COAST.get(target_coast, frozenset()) & allowed_seas
    if not starts or not ends:
        return False
    if via_sea in starts and via_sea in ends:
        return True
    if via_sea in starts:
        return bool(connected_seas({via_sea}, allowed_seas) & ends)
    if via_sea in ends:
        return bool(connected_seas({via_sea}, allowed_seas) & starts)
    return _menger_two_disjoint_paths(
        starts, ends, via_sea, connected_seas({via_sea}, allowed_seas)
    )
