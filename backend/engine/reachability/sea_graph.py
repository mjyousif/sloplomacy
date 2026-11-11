"""The sea zones a convoy can travel through, and the coasts each one touches.

Built once from the static map. Only fleets in sea zones convoy, so coastal fleets never
appear here.
"""

from collections import defaultdict, deque

from domain.board import ProvinceType, Unit, UnitType
from engine.topology.graph import split_province_code
from engine.topology.provinces import PROVINCES


def _build_tables() -> tuple[dict[str, frozenset[str]], dict[str, frozenset[str]]]:
    seas_by_coast: dict[str, set[str]] = {}
    coasts_by_sea: dict[str, set[str]] = {}
    for sea_id, sea in PROVINCES.items():
        if sea.type != ProvinceType.SEA:
            continue
        coasts_by_sea[sea_id] = set()
        for entry in sea.fleet_adj.get("", []):
            base = split_province_code(entry)[0]
            if PROVINCES.get(base) and PROVINCES[base].type == ProvinceType.COAST:
                coasts_by_sea[sea_id].add(base)
                seas_by_coast.setdefault(base, set()).add(sea_id)
    return (
        {k: frozenset(v) for k, v in seas_by_coast.items()},
        {k: frozenset(v) for k, v in coasts_by_sea.items()},
    )


SEAS_BY_COAST, COASTS_BY_SEA = _build_tables()


def sea_neighbors(sea: str) -> list[str]:
    """Sea zones a fleet in `sea` touches."""
    out = []
    for entry in PROVINCES[sea].fleet_adj.get("", []):
        base = split_province_code(entry)[0]
        if PROVINCES.get(base) and PROVINCES[base].type == ProvinceType.SEA:
            out.append(base)
    return out


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


def has_sea_path_through(
    origin_coast: str,
    target_coast: str,
    via_sea: str,
    allowed_seas: set[str],
) -> bool:
    """True when a simple path of `allowed_seas` from `origin_coast` to `target_coast` visits `via_sea`."""
    if origin_coast == target_coast or via_sea not in allowed_seas:
        return False
    starts = set(SEAS_BY_COAST.get(origin_coast, ())) & allowed_seas
    ends = set(SEAS_BY_COAST.get(target_coast, ())) & allowed_seas
    if not starts or not ends:
        return False
    if via_sea in starts and via_sea in ends:
        return True
    if via_sea in starts:
        return bool(connected_seas({via_sea}, allowed_seas) & ends)
    if via_sea in ends:
        return bool(connected_seas({via_sea}, allowed_seas) & starts)

    # Menger's 2-vertex-disjoint paths from `via_sea`: one to `starts`, one to `ends`.
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

    for s in allowed_seas:
        if s != via_sea:
            add_edge(f"{s}:in", f"{s}:out", 1)
        if s in starts:
            add_edge(f"{s}:out", goal_a, 1)
        if s in ends:
            add_edge(f"{s}:out", goal_b, 1)
        for nb in sea_neighbors(s):
            if nb in allowed_seas and nb != via_sea:
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
