"""Pure campaign statistics and War Ledger aggregation from resolved turn history."""

from collections import defaultdict

from domain.board import Power, Unit, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderResolution, OrderType, SimulationResult
from domain.stats import CampaignAward, CampaignStatsResponse, PowerStats, SCTimelinePoint
from engine.adjudicator.resolver import adjudicate_turn, compute_current_builds
from engine.adjudicator.territory import supply_center_owners


def _count_scs(sc_owners: dict[str, Power]) -> dict[Power, int]:
    counts: dict[Power, int] = {p: 0 for p in Power}
    for owner in sc_owners.values():
        counts[owner] += 1
    return counts


def _timeline_label(season: str, year: int, is_final: bool = False) -> str:
    return f"Final ({season} {year})" if is_final else f"{season} {year}"


def _record_timeline_point(
    timeline: list[SCTimelinePoint],
    season: str,
    year: int,
    counts: dict[Power, int],
    *,
    is_winner_turn: bool = False,
) -> None:
    if not timeline:
        timeline.append(
            SCTimelinePoint(
                label=_timeline_label(season, year),
                season=season,
                year=year,
                counts=dict(counts),
            )
        )
        return

    last = timeline[-1]
    if last.season == season and last.year == year:
        if is_winner_turn and counts != last.counts:
            timeline.append(
                SCTimelinePoint(
                    label=_timeline_label(season, year, is_final=True),
                    season=season,
                    year=year,
                    counts=dict(counts),
                )
            )
        else:
            last.counts = dict(counts)
    else:
        timeline.append(
            SCTimelinePoint(
                label=_timeline_label(season, year),
                season=season,
                year=year,
                counts=dict(counts),
            )
        )


def _accumulate_movement_stats(
    snap: GameState,
    resolution: SimulationResult,
    stats: dict[Power, PowerStats],
    support_matrix: dict[Power, dict[Power, int]],
    attack_matrix: dict[Power, dict[Power, int]],
) -> None:
    regular_units = [u for u in snap.units if not u.is_dislodged]
    units_by_prov = {u.province: u for u in regular_units}
    snap_sc_owners = supply_center_owners(snap.ownership)
    surviving_dislodged_ids = {nu.id for nu in resolution.new_units if nu.is_dislodged}

    bounced_by_power_target: dict[tuple[Power, str], int] = defaultdict(int)
    succeeded_targets: set[str] = set()
    move_orders_into: dict[str, list[tuple[Unit, Order, OrderResolution | None]]] = defaultdict(
        list
    )

    for u in regular_units:
        ord_obj = snap.orders.get(u.id)
        res = resolution.resolutions.get(u.id)

        if ord_obj and ord_obj.order_type == OrderType.MOVE and ord_obj.target:
            move_orders_into[ord_obj.target].append((u, ord_obj, res))
            if res and res.succeeded:
                stats[u.power].moves_succeeded += 1
                succeeded_targets.add(ord_obj.target)
            elif res and res.bounced:
                stats[u.power].moves_bounced += 1
                bounced_by_power_target[(u.power, ord_obj.target)] += 1

            is_illegal = bool(res and res.reason.startswith("Illegal "))
            if not is_illegal:
                target_u = units_by_prov.get(ord_obj.target)
                if target_u and target_u.power != u.power:
                    attack_matrix[u.power][target_u.power] += 1
                else:
                    sc_owner = snap_sc_owners.get(ord_obj.target)
                    if sc_owner and sc_owner != u.power:
                        attack_matrix[u.power][sc_owner] += 1

        elif ord_obj and ord_obj.order_type == OrderType.SUPPORT and ord_obj.aux_unit_origin:
            supported_u = units_by_prov.get(ord_obj.aux_unit_origin)
            if supported_u and supported_u.power != u.power:
                stats[u.power].foreign_supports_given += 1
                stats[supported_u.power].foreign_supports_received += 1
                support_matrix[u.power][supported_u.power] += 1
                if res and res.succeeded and not res.cut and not res.dislodged:
                    stats[u.power].foreign_supports_effective += 1

        elif ord_obj and ord_obj.order_type == OrderType.CONVOY and res and res.succeeded:
            stats[u.power].convoys_executed += 1
            convoyed_u = (
                units_by_prov.get(ord_obj.aux_unit_origin) if ord_obj.aux_unit_origin else None
            )
            if convoyed_u and convoyed_u.power != u.power:
                stats[u.power].foreign_convoys += 1
                stats[convoyed_u.power].foreign_convoys += 1

        if res and res.dislodged:
            attacker = units_by_prov.get(res.dislodged_by) if res.dislodged_by else None
            if attacker and attacker.power != u.power:
                stats[attacker.power].enemies_dislodged += 1
            if u.id not in surviving_dislodged_ids:
                stats[u.power].units_destroyed += 1

    for (pwr, target), bounce_count in bounced_by_power_target.items():
        if bounce_count >= 2 and target not in succeeded_targets:
            stats[pwr].self_bounces += 1

    for sup_u in regular_units:
        sup_ord = snap.orders.get(sup_u.id)
        sup_res = resolution.resolutions.get(sup_u.id)
        if not sup_ord or sup_ord.order_type != OrderType.SUPPORT or not (sup_res and sup_res.cut):
            continue
        seen_cutters: set[Power] = set()
        for atk_u, _atk_ord, atk_res in move_orders_into.get(sup_u.province, []):
            if atk_u.power == sup_u.power or atk_u.power in seen_cutters:
                continue
            if atk_res and (
                atk_res.reason.startswith("Illegal ") or "no convoy" in atk_res.reason.lower()
            ):
                continue
            if sup_ord.target == atk_u.province and not (atk_res and atk_res.succeeded):
                continue
            seen_cutters.add(atk_u.power)
            stats[atk_u.power].supports_cut += 1


def _accumulate_retreat_stats(
    snap: GameState,
    resolution: SimulationResult,
    stats: dict[Power, PowerStats],
) -> None:
    for u in snap.units:
        if not u.is_dislodged:
            continue
        res = resolution.resolutions.get(u.id)
        if res and res.order_type == OrderType.RETREAT and res.succeeded:
            continue
        stats[u.power].units_destroyed += 1


def _accumulate_adjustment_stats(
    snap: GameState,
    resolution: SimulationResult,
    stats: dict[Power, PowerStats],
) -> None:
    new_units_by_pwr_prov = {(nu.power, nu.province): nu for nu in resolution.new_units}
    builds_by_power: dict[Power, int] = defaultdict(int)

    for res_id, res in resolution.resolutions.items():
        if res.order_type != OrderType.BUILD or not res.succeeded:
            continue
        ord_obj = snap.orders.get(res_id)
        built_u = new_units_by_pwr_prov.get((ord_obj.power, res.origin)) if ord_obj else None
        if built_u is None:
            for (pwr, prov), nu in new_units_by_pwr_prov.items():
                if prov == res.origin and (not ord_obj or pwr == ord_obj.power):
                    built_u = nu
                    break
        pwr = built_u.power if built_u else (ord_obj.power if ord_obj else None)
        utype = built_u.unit_type if built_u else (ord_obj.unit_type if ord_obj else None)
        if pwr is not None:
            stats[pwr].units_built += 1
            builds_by_power[pwr] += 1
            if utype == UnitType.ARMY:
                stats[pwr].armies_built += 1
            elif utype == UnitType.FLEET:
                stats[pwr].fleets_built += 1

    for u in snap.units:
        res = resolution.resolutions.get(u.id)
        if res and res.order_type == OrderType.DISBAND and res.succeeded:
            stats[u.power].units_disbanded += 1

    builds_info = (
        snap.builds
        if snap.builds is not None
        else compute_current_builds(snap.units, snap.ownership, snap.year)
    )
    for p_key, b_info in builds_info.items():
        try:
            pwr = Power(p_key)
        except ValueError:
            continue
        if not isinstance(b_info, dict):
            continue
        count = int(b_info.get("count", 0))
        homes = b_info.get("homes", [])
        if count > 0 and homes:
            max_b = min(count, len(homes))
            stats[pwr].builds_waived += max(0, max_b - builds_by_power.get(pwr, 0))


def _compute_awards(stats: dict[Power, PowerStats]) -> list[CampaignAward]:
    award_specs = [
        (
            "kingmaker",
            "Kingmaker",
            "Most Foreign Supports Given",
            lambda s: s.foreign_supports_given,
            lambda n: f"{n} support{'s' if n != 1 else ''}",
        ),
        (
            "iron_chancellor",
            "Iron Chancellor",
            "Most Enemy Units Dislodged",
            lambda s: s.enemies_dislodged,
            lambda n: f"{n} dislodged",
        ),
        (
            "grand_admiral",
            "Grand Admiral",
            "Most Convoys Executed",
            lambda s: s.convoys_executed,
            lambda n: f"{n} convoy{'s' if n != 1 else ''}",
        ),
        (
            "attrition_magnet",
            "Attrition Magnet",
            "Most Units Lost & Disbanded",
            lambda s: s.units_destroyed + s.units_disbanded,
            lambda n: f"{n} lost",
        ),
    ]
    fallback_specs = [
        (
            "expansionist",
            "Imperial Expansionist",
            "Most Supply Centers Captured",
            lambda s: s.scs_captured,
            lambda n: f"{n} captured",
        ),
        (
            "industrialist",
            "War Industrialist",
            "Most Units Commissioned",
            lambda s: s.units_built,
            lambda n: f"{n} built",
        ),
        (
            "tactician",
            "Master Tactician",
            "Successful Offensives",
            lambda s: s.moves_succeeded,
            lambda n: f"{n} move{'s' if n != 1 else ''}",
        ),
    ]

    awards: list[CampaignAward] = []
    powers_ordered = list(Power)

    def _pick_leader(metric_fn) -> tuple[Power, int] | None:
        best_power: Power | None = None
        best_val = 0
        for p in powers_ordered:
            val = metric_fn(stats[p])
            if val > best_val:
                best_val = val
                best_power = p
        if best_power is None or best_val <= 0:
            return None
        return best_power, best_val

    for award_id, title, subtitle, metric_fn, format_fn in award_specs:
        leader = _pick_leader(metric_fn)
        if leader:
            pwr, val = leader
            awards.append(
                CampaignAward(
                    id=award_id,
                    title=title,
                    subtitle=subtitle,
                    power=pwr,
                    value=format_fn(val),
                    count=val,
                )
            )

    if len(awards) < 4:
        for award_id, title, subtitle, metric_fn, format_fn in fallback_specs:
            if len(awards) >= 4:
                break
            leader = _pick_leader(metric_fn)
            if leader:
                pwr, val = leader
                awards.append(
                    CampaignAward(
                        id=award_id,
                        title=title,
                        subtitle=subtitle,
                        power=pwr,
                        value=format_fn(val),
                        count=val,
                    )
                )

    return awards


def compute_campaign_stats(
    history: list[GameState],
    current_state: GameState,
    player_names: dict[Power, str] | None = None,
) -> CampaignStatsResponse:
    """Compute campaign statistics solely from resolved `history` and public `current_state`.

    Never inspects `current_state.orders`, `preview`, `issues`, or `unit_options` so live
    unresolved turn orders are never leaked.
    """
    names = player_names or {}
    stats: dict[Power, PowerStats] = {
        p: PowerStats(power=p, player_name=names.get(p)) for p in Power
    }
    support_matrix: dict[Power, dict[Power, int]] = {p: {q: 0 for q in Power} for p in Power}
    attack_matrix: dict[Power, dict[Power, int]] = {p: {q: 0 for q in Power} for p in Power}

    initial_ownership = history[0].ownership if history else current_state.ownership
    prev_sc_owners = supply_center_owners(initial_ownership)
    prev_counts = _count_scs(prev_sc_owners)
    for p in Power:
        stats[p].peak_scs = prev_counts[p]

    init_season = history[0].season if history else current_state.season
    init_year = history[0].year if history else current_state.year
    sc_timeline: list[SCTimelinePoint] = []
    _record_timeline_point(sc_timeline, init_season, init_year, prev_counts)

    turns_resolved = 0
    for snap in history:
        if snap.phase == "Admin" and snap.admin_resolution is not None:
            resolution = snap.admin_resolution
        else:
            turns_resolved += 1
            resolution = adjudicate_turn(
                snap.units,
                snap.orders,
                snap.ownership,
                snap.season,
                snap.year,
                snap.phase,
                retreats=snap.retreats,
            )
            if snap.phase == "Movement":
                _accumulate_movement_stats(snap, resolution, stats, support_matrix, attack_matrix)
            elif snap.phase == "Retreats":
                _accumulate_retreat_stats(snap, resolution, stats)
            elif snap.phase == "Adjustments":
                _accumulate_adjustment_stats(snap, resolution, stats)

        new_sc_owners = supply_center_owners(resolution.new_ownership)
        if snap.phase != "Admin" and new_sc_owners != prev_sc_owners:
            for prov in set(prev_sc_owners.keys()) | set(new_sc_owners.keys()):
                old_owner = prev_sc_owners.get(prov)
                new_owner = new_sc_owners.get(prov)
                if old_owner != new_owner:
                    if new_owner is not None:
                        stats[new_owner].scs_captured += 1
                    if old_owner is not None:
                        stats[old_owner].scs_lost += 1

        prev_sc_owners = new_sc_owners
        new_counts = _count_scs(new_sc_owners)
        for p in Power:
            if new_counts[p] > stats[p].peak_scs:
                stats[p].peak_scs = new_counts[p]

        _record_timeline_point(
            sc_timeline,
            resolution.next_season or snap.season,
            resolution.next_year or snap.year,
            new_counts,
            is_winner_turn=bool(resolution.winner),
        )

    current_sc_owners = supply_center_owners(current_state.ownership)
    current_counts = _count_scs(current_sc_owners)
    active_unit_powers = {u.power for u in current_state.units if not u.is_dislodged}
    surrendered_set = set(current_state.surrendered_powers)

    if sc_timeline and current_counts != sc_timeline[-1].counts:
        _record_timeline_point(
            sc_timeline,
            current_state.season,
            current_state.year,
            current_counts,
            is_winner_turn=bool(current_state.winner),
        )

    for p in Power:
        ps = stats[p]
        ps.current_scs = current_counts[p]
        ps.peak_scs = max(ps.peak_scs, ps.current_scs)
        ps.is_eliminated = ps.current_scs == 0 and p not in active_unit_powers
        ps.is_surrendered = p in surrendered_set
        total_moves = ps.moves_succeeded + ps.moves_bounced
        ps.move_success_rate = (
            round(100.0 * ps.moves_succeeded / total_moves, 1) if total_moves > 0 else 0.0
        )

    awards = _compute_awards(stats)

    return CampaignStatsResponse(
        game_id=current_state.game_id,
        turns_resolved=turns_resolved,
        powers=stats,
        sc_timeline=sc_timeline,
        support_matrix=support_matrix,
        attack_matrix=attack_matrix,
        awards=awards,
    )
