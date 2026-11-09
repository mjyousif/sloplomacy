from collections import defaultdict
from typing import Any

import diplomacy
from map_data import PROVINCES, split_province_code
from models import (
    Order,
    OrderResolution,
    OrderType,
    Power,
    SimulationResult,
    Unit,
    UnitType,
)


def to_diplomacy_phase_code(season: str, year: int, phase: str) -> str:
    s_abbr = season[0].upper()  # 'S', 'F', 'W'
    p_lower = phase.lower()
    if "retreat" in p_lower:
        p_abbr = "R"
    elif "adjust" in p_lower or "build" in p_lower:
        p_abbr = "A"
    else:
        p_abbr = "M"
    return f"{s_abbr}{year}{p_abbr}"


def parse_diplomacy_phase(phase_str: str) -> tuple[str, int, str]:
    # e.g. "SPRING 1901 MOVEMENT", "FALL 1901 MOVEMENT", "WINTER 1901 ADJUSTMENTS", "SPRING 1901 RETREATS"
    parts = phase_str.strip().split()
    if len(parts) >= 3:
        season = parts[0].capitalize()
        try:
            year = int(parts[1])
        except ValueError:
            year = 1901
        phase = parts[2].capitalize()
        return season, year, phase
    return "Spring", 1901, "Movement"


def order_to_diplomacy_str(order: Order, units_by_prov: dict[str, Unit]) -> str | None:
    """Translate an order for the engine, or return None if it is incomplete and cannot be."""
    u_type = order.unit_type.value if hasattr(order.unit_type, "value") else str(order.unit_type)
    orig = f"{order.origin}/{order.origin_coast}" if order.origin_coast else order.origin

    if order.order_type == OrderType.HOLD:
        return f"{u_type} {orig} H"
    elif order.order_type == OrderType.MOVE:
        if not order.target:
            return None
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else order.target
        if order.via_convoy:
            return f"{u_type} {orig} - {dest} VIA"
        return f"{u_type} {orig} - {dest}"
    elif order.order_type == OrderType.SUPPORT:
        if not order.aux_unit_origin:
            return None
        aux_prov = order.aux_unit_origin
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = (
            aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        )
        aux_orig = f"{aux_prov}/{aux_unit.coast}" if (aux_unit and aux_unit.coast) else aux_prov
        target_prov = order.target or aux_prov
        if target_prov == aux_prov:
            return f"{u_type} {orig} S {aux_type} {aux_orig}"
        else:
            return f"{u_type} {orig} S {aux_type} {aux_orig} - {target_prov}"
    elif order.order_type == OrderType.CONVOY:
        if not order.aux_unit_origin or not order.target:
            return None
        aux_prov = order.aux_unit_origin
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = (
            aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        )
        return f"{u_type} {orig} C {aux_type} {aux_prov} - {order.target}"
    elif order.order_type == OrderType.BUILD:
        if u_type == "A":
            return f"A {order.origin} B"
        prov_info = PROVINCES.get(order.origin)
        coast = order.origin_coast or order.target_coast
        if not coast and prov_info and prov_info.coasts:
            coast = prov_info.coasts[0]
        loc = (
            f"{order.origin}/{coast}"
            if (prov_info and prov_info.coasts and coast)
            else order.origin
        )
        return f"F {loc} B"
    elif order.order_type == OrderType.DISBAND:
        return f"{u_type} {orig} D"
    elif order.order_type == OrderType.RETREAT:
        if not order.target:
            return f"{u_type} {orig} D"
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else order.target
        return f"{u_type} {orig} R {dest}"
    elif order.order_type == OrderType.WAIVE:
        return "WAIVE"
    return None


def create_diplomacy_game(
    units: list[Unit],
    ownership: dict[str, Power],
    season: str,
    year: int,
    phase: str,
    retreats: dict[str, Any] | None = None,
) -> diplomacy.Game:
    game = diplomacy.Game()
    game.clear_units()
    game.clear_centers()

    phase_code = to_diplomacy_phase_code(season, year, phase)
    game.set_current_phase(phase_code)

    # Set supply centers first so adjustment calculations have accurate ownership
    centers_by_pwr: dict[str, list[str]] = {}
    for prov, pwr in ownership.items():
        p_name = pwr.value if hasattr(pwr, "value") else str(pwr)
        centers_by_pwr.setdefault(p_name, []).append(prov)

    for p_name, c_list in centers_by_pwr.items():
        game.set_centers(p_name, c_list)

    # Set units (regular units first, then dislodged units prefixed with '*' during Retreats phase)
    units_by_pwr: dict[str, list[str]] = {}
    for u in units:
        if u.is_dislodged and not phase_code.endswith("R"):
            continue
        p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
        ut_val = u.unit_type.value if hasattr(u.unit_type, "value") else str(u.unit_type)
        loc = f"{u.province}/{u.coast}" if u.coast else u.province
        prefix = "*" if (u.is_dislodged and phase_code.endswith("R")) else ""
        u_str = f"{prefix}{ut_val} {loc}"
        units_by_pwr.setdefault(p_name, []).append(u_str)

    for p_name, u_list in units_by_pwr.items():
        game.set_units(p_name, u_list)

    # If in Retreats phase and explicit DATC retreat options were recorded from the Movement phase, restore them
    if phase_code.endswith("R") and retreats:
        for p_name, r_dict in retreats.items():
            if isinstance(r_dict, dict):
                pwr_obj = game.get_power(p_name)
                if pwr_obj:
                    for u_key, r_locs in r_dict.items():
                        if u_key in pwr_obj.retreats and isinstance(r_locs, list):
                            pwr_obj.retreats[u_key] = [str(x).upper() for x in r_locs]

    return game


def compute_current_builds(
    units: list[Unit],
    ownership: dict[str, Power],
    year: int = 1901,
) -> dict[str, Any]:
    """Compute the exact DATC build/disband counts and unoccupied home centers for a Winter Adjustments phase."""
    game = create_diplomacy_game(units, ownership, "Winter", year, "Adjustments")
    return game.get_state().get("builds", {})


def adjudicate_turn(
    units: list[Unit],
    orders: dict[str, Order],
    ownership: dict[str, Power],
    season: str = "Spring",
    year: int = 1901,
    phase: str = "Movement",
    retreats: dict[str, Any] | None = None,
) -> SimulationResult:
    """
    Resolve a Diplomacy phase using the official DATC-compliant `diplomacy` engine.
    - Accurately determines bounces, cuts, dislodgements, circular movement, and convoy paradoxes.
    - Honors official supply center ownership timing: Spring movements do not capture SCs;
      Fall movements (and Fall retreats) update ownership before the Winter adjustment phase.
    - Supports Retreats (RETREAT / DISBAND) and Winter Adjustments (BUILD / DISBAND / WAIVE).
    """
    game = create_diplomacy_game(units, ownership, season, year, phase, retreats=retreats)
    phase_code = to_diplomacy_phase_code(season, year, phase)

    units_by_prov = {u.province: u for u in units if not u.is_dislodged}
    unit_by_id = {u.id: u for u in units}

    # Format orders for diplomacy engine based on phase type
    power_orders: dict[str, list[str]] = {}

    if phase_code.endswith("M"):
        for u in units:
            if u.is_dislodged:
                continue
            ord_obj = orders.get(u.id)
            if ord_obj and ord_obj.order_type in (
                OrderType.HOLD,
                OrderType.MOVE,
                OrderType.SUPPORT,
                OrderType.CONVOY,
            ):
                d_str = order_to_diplomacy_str(ord_obj, units_by_prov)
                if d_str:
                    p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
                    power_orders.setdefault(p_name, []).append(d_str)

    elif phase_code.endswith("R"):
        for u in units:
            if not u.is_dislodged:
                continue
            p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
            ord_obj = orders.get(u.id)
            if ord_obj and ord_obj.order_type == OrderType.RETREAT and ord_obj.target:
                d_str = order_to_diplomacy_str(ord_obj, units_by_prov)
                if d_str:
                    power_orders.setdefault(p_name, []).append(d_str)
            else:
                ut_val = u.unit_type.value if hasattr(u.unit_type, "value") else str(u.unit_type)
                orig = f"{u.province}/{u.coast}" if u.coast else u.province
                power_orders.setdefault(p_name, []).append(f"{ut_val} {orig} D")

    elif phase_code.endswith("A"):
        pre_builds = game.get_state().get("builds", {})
        for p_name, b_info in pre_builds.items():
            count = b_info.get("count", 0)
            homes = b_info.get("homes", [])
            if count < 0:
                # Power must disband abs(count) units
                disband_candidates = [
                    u
                    for u in units
                    if (u.power.value if hasattr(u.power, "value") else str(u.power)) == p_name
                    and orders.get(u.id) is not None
                    and orders[u.id].order_type == OrderType.DISBAND
                ]
                disband_candidates.sort(key=lambda u: not orders[u.id].is_explicit)
                for u in disband_candidates[: abs(count)]:
                    d_str = order_to_diplomacy_str(orders[u.id], units_by_prov)
                    if d_str:
                        power_orders.setdefault(p_name, []).append(d_str)
            elif count > 0 and homes:
                max_b = min(count, len(homes))
                build_candidates: list[Order] = []
                for ord_key, ord_obj in orders.items():
                    ord_pwr = (
                        ord_obj.power.value
                        if hasattr(ord_obj.power, "value")
                        else str(ord_obj.power)
                    )
                    if (
                        ord_key not in unit_by_id
                        and ord_pwr == p_name
                        and ord_obj.origin in homes
                        and ord_obj.order_type == OrderType.BUILD
                    ):
                        build_candidates.append(ord_obj)
                # Explicit user build selections always take priority over unconfirmed defaults
                build_candidates.sort(key=lambda o: not o.is_explicit)
                chosen_builds = build_candidates[:max_b]
                for b_ord in chosen_builds:
                    d_str = order_to_diplomacy_str(b_ord, units_by_prov)
                    if d_str:
                        power_orders.setdefault(p_name, []).append(d_str)
                waive_count = max_b - len(chosen_builds)
                for _ in range(waive_count):
                    power_orders.setdefault(p_name, []).append("WAIVE")

    # Submit orders to game
    for p_name, ord_list in power_orders.items():
        game.set_orders(p_name, ord_list)

    # The engine silently drops orders it finds illegal and the unit simply holds, with no
    # result code to show for it. Record what it kept, so that a dropped order is never
    # applied or reported as a success.
    kept_orders: set[tuple[str, str, str]] = set()
    for p_name in power_orders:
        for kept in game.get_orders(p_name):
            parts = kept.split()
            if len(parts) >= 2:
                kept_orders.add((p_name, parts[0], split_province_code(parts[1])[0]))

    def engine_kept_order(u: Unit) -> bool:
        return (u.power.value, u.unit_type.value, u.province) in kept_orders

    # Process adjudication
    game.process()

    results_for_phase = game.result_history.get(phase_code, {})
    engine_units_by_pwr = game.get_units()

    # Parse surviving regular and dislodged units from the engine after process()
    engine_regular_by_pwr: dict[str, list[tuple[str, str, str | None]]] = defaultdict(list)
    engine_dislodged_by_pwr: dict[str, list[tuple[str, str, str | None]]] = defaultdict(list)
    for p_name, u_strs in engine_units_by_pwr.items():
        for u_str in u_strs:
            is_dis = u_str.startswith("*")
            clean_str = u_str[1:] if is_dis else u_str
            parts = clean_str.split()
            if len(parts) < 2:
                continue
            ut_str = parts[0]
            base_prov, prov_coast = split_province_code(parts[1])
            if is_dis:
                engine_dislodged_by_pwr[p_name].append((ut_str, base_prov, prov_coast))
            else:
                engine_regular_by_pwr[p_name].append((ut_str, base_prov, prov_coast))

    resolutions: dict[str, OrderResolution] = {}
    summary: list[str] = []

    def p_name_fn(code: str | None) -> str:
        if not code:
            return ""
        return PROVINCES[code].name if code in PROVINCES else code

    new_units: list[Unit] = []
    used_unit_ids: set[str] = set()

    if phase_code.endswith("M"):
        # Compute uncut supports for calculating attack/defense strengths
        uncut_supports_for_move: dict[tuple[str, str], int] = defaultdict(int)
        uncut_supports_for_hold: dict[str, int] = defaultdict(int)

        for u in units:
            if u.is_dislodged:
                continue
            ord_obj = orders.get(u.id)
            if (
                ord_obj
                and ord_obj.order_type == OrderType.SUPPORT
                and ord_obj.aux_unit_origin
                and ord_obj.target
                and engine_kept_order(u)
            ):
                u_loc = f"{u.province}/{u.coast}" if u.coast else u.province
                u_key = f"{u.unit_type.value} {u_loc}"
                u_res = results_for_phase.get(u_key, [])
                was_cut = any(r.code == 10004 or "cut" in str(r).lower() for r in u_res)
                was_dislodged = any(r.code == 10005 or "dislodged" in str(r).lower() for r in u_res)
                was_void = any(r.code == 10003 or "void" in str(r).lower() for r in u_res)
                if not was_cut and not was_dislodged and not was_void:
                    if ord_obj.aux_unit_origin == ord_obj.target:
                        uncut_supports_for_hold[ord_obj.target] += 1
                    else:
                        uncut_supports_for_move[(ord_obj.aux_unit_origin, ord_obj.target)] += 1

        for u in units:
            if u.is_dislodged:
                continue
            ord_obj = orders.get(u.id)
            u_loc = f"{u.province}/{u.coast}" if u.coast else u.province
            u_key = f"{u.unit_type.value} {u_loc}"
            res_list = results_for_phase.get(u_key, [])

            no_convoy = any(r.code == 10001 or "no convoy" in str(r).lower() for r in res_list)
            bounced = any(r.code == 10002 or "bounce" in str(r).lower() for r in res_list)
            cut = any(r.code == 10004 or "cut" in str(r).lower() for r in res_list)
            dislodged = any(r.code == 10005 or "dislodged" in str(r).lower() for r in res_list)
            voided = any(r.code == 10003 or "void" in str(r).lower() for r in res_list)
            disrupted = any(r.code == 10006 or "disrupted" in str(r).lower() for r in res_list)

            attack_strength = 1
            defense_strength = 1

            otype = ord_obj.order_type if ord_obj else OrderType.HOLD
            target = ord_obj.target if ord_obj else None

            rejected = otype != OrderType.HOLD and not engine_kept_order(u)
            succeeded = not (
                no_convoy or bounced or cut or dislodged or voided or disrupted or rejected
            )

            if rejected:
                defense_strength = 1 + uncut_supports_for_hold.get(u.province, 0)
                reason = (
                    f"Illegal {otype.value} order rejected; unit held in {p_name_fn(u.province)}."
                )
                summary.append(
                    f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} held: illegal {otype.value} order rejected."
                )
                if dislodged:
                    reason += " Dislodged by superior force."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} dislodged."
                    )
            elif otype == OrderType.MOVE and target:
                attack_strength = 1 + uncut_supports_for_move.get((u.province, target), 0)
                if no_convoy:
                    reason = f"Convoy path missing or disrupted moving to {p_name_fn(target)}."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} failed to move to {p_name_fn(target)} (no convoy)."
                    )
                elif bounced:
                    reason = f"Bounced attempting to move to {p_name_fn(target)} (strength {attack_strength})."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} bounced moving to {p_name_fn(target)}."
                    )
                elif dislodged:
                    reason = f"Dislodged while attempting to move to {p_name_fn(target)}!"
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} was dislodged!"
                    )
                else:
                    reason = f"Advanced to {p_name_fn(target)} with strength {attack_strength}."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} -> {p_name_fn(target)} succeeded."
                    )
            elif otype == OrderType.SUPPORT:
                if cut:
                    reason = "Support cut by enemy attack!"
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} support cut."
                    )
                elif dislodged:
                    reason = "Dislodged! Support broken."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} dislodged."
                    )
                else:
                    reason = "Support held unbroken."
            elif otype == OrderType.CONVOY:
                if disrupted or dislodged:
                    reason = "Convoy disrupted by fleet dislodgement."
                    summary.append(
                        f"[{u.power.value}] Fleet {p_name_fn(u.province)} convoy disrupted."
                    )
                else:
                    reason = "Convoy route maintained."
            elif otype == OrderType.HOLD:
                defense_strength = 1 + uncut_supports_for_hold.get(u.province, 0)
                if dislodged:
                    reason = f"Dislodged by superior force (defense {defense_strength})."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} dislodged."
                    )
                else:
                    reason = f"Held position (defense strength {defense_strength})."
            else:
                reason = "Order resolved."

            resolutions[u.id] = OrderResolution(
                unit_id=u.id,
                origin=u.province,
                order_type=otype,
                target=target,
                succeeded=succeeded,
                bounced=bounced,
                cut=cut,
                dislodged=dislodged,
                attack_strength=attack_strength,
                defense_strength=defense_strength,
                reason=reason,
            )

            if dislodged:
                # Check if this dislodged unit has valid retreat options in the upcoming Retreats phase
                has_retreat = any(
                    ut == u.unit_type.value and bp == u.province
                    for ut, bp, _ in engine_dislodged_by_pwr.get(u.power.value, [])
                )
                if has_retreat:
                    new_units.append(
                        Unit(
                            id=u.id,
                            power=u.power,
                            unit_type=u.unit_type,
                            province=u.province,
                            coast=u.coast,
                            is_dislodged=True,
                        )
                    )
                    used_unit_ids.add(u.id)
                else:
                    resolutions[u.id].reason += " (No valid retreat — unit destroyed!)"
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} had no valid retreat and was destroyed."
                    )
                continue

            if ord_obj and ord_obj.order_type == OrderType.MOVE and succeeded and ord_obj.target:
                dest = ord_obj.target
                dest_coast = ord_obj.target_coast
                if (
                    u.unit_type == UnitType.FLEET
                    and PROVINCES.get(dest)
                    and PROVINCES[dest].coasts
                    and not dest_coast
                ):
                    for ut, bp, cst in engine_regular_by_pwr.get(u.power.value, []):
                        if ut == u.unit_type.value and bp == dest and cst:
                            dest_coast = cst
                            break
                new_units.append(
                    Unit(
                        id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        province=dest,
                        coast=dest_coast,
                        is_dislodged=False,
                    )
                )
                used_unit_ids.add(u.id)
            else:
                new_units.append(
                    Unit(
                        id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        province=u.province,
                        coast=u.coast,
                        is_dislodged=False,
                    )
                )
                used_unit_ids.add(u.id)

    elif phase_code.endswith("R"):
        # Retreats Phase Resolution
        for u in units:
            if not u.is_dislodged:
                new_units.append(
                    Unit(
                        id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        province=u.province,
                        coast=u.coast,
                        is_dislodged=False,
                    )
                )
                used_unit_ids.add(u.id)
                resolutions[u.id] = OrderResolution(
                    unit_id=u.id,
                    origin=u.province,
                    order_type=OrderType.HOLD,
                    succeeded=True,
                    reason="Held position during retreats phase.",
                )
                continue

            ord_obj = orders.get(u.id)
            u_loc = f"{u.province}/{u.coast}" if u.coast else u.province
            u_key = f"{u.unit_type.value} {u_loc}"
            res_list = results_for_phase.get(
                u_key, results_for_phase.get(f"{u.unit_type.value} {u.province}", [])
            )

            bounced = any(r.code == 10002 or "bounce" in str(r).lower() for r in res_list)
            disbanded = any(r.code == 10007 or "disband" in str(r).lower() for r in res_list)
            voided = any(r.code == 10003 or "void" in str(r).lower() for r in res_list)

            otype = ord_obj.order_type if ord_obj else OrderType.DISBAND
            target = ord_obj.target if ord_obj else None

            if otype == OrderType.RETREAT and target:
                # Verify unit is now present at target in engine_regular_by_pwr
                matched_coast = ord_obj.target_coast if ord_obj else None
                landed = False
                for ut, bp, cst in engine_regular_by_pwr.get(u.power.value, []):
                    if ut == u.unit_type.value and bp == target:
                        landed = True
                        if cst:
                            matched_coast = cst
                        break

                if landed and not bounced and not disbanded and not voided:
                    new_units.append(
                        Unit(
                            id=u.id,
                            power=u.power,
                            unit_type=u.unit_type,
                            province=target,
                            coast=matched_coast,
                            is_dislodged=False,
                        )
                    )
                    used_unit_ids.add(u.id)
                    reason = f"Retreated safely to {p_name_fn(target)}."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} retreated to {p_name_fn(target)}."
                    )
                    resolutions[u.id] = OrderResolution(
                        unit_id=u.id,
                        origin=u.province,
                        order_type=OrderType.RETREAT,
                        target=target,
                        succeeded=True,
                        reason=reason,
                    )
                else:
                    if bounced:
                        reason = f"Retreat to {p_name_fn(target)} bounced — unit disbanded!"
                        summary.append(
                            f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} bounced retreating to {p_name_fn(target)} and was disbanded."
                        )
                    else:
                        reason = f"Invalid retreat to {p_name_fn(target)} — unit disbanded!"
                        summary.append(
                            f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} failed to retreat and was disbanded."
                        )
                    resolutions[u.id] = OrderResolution(
                        unit_id=u.id,
                        origin=u.province,
                        order_type=OrderType.RETREAT,
                        target=target,
                        succeeded=False,
                        bounced=bounced,
                        reason=reason,
                    )
            else:
                reason = f"Disbanded dislodged {u.unit_type.value} in {p_name_fn(u.province)}."
                summary.append(
                    f"[{u.power.value}] Dislodged {u.unit_type.value} {p_name_fn(u.province)} was disbanded."
                )
                resolutions[u.id] = OrderResolution(
                    unit_id=u.id,
                    origin=u.province,
                    order_type=OrderType.DISBAND,
                    succeeded=True,
                    reason=reason,
                )

    elif phase_code.endswith("A"):
        # Winter Adjustments Phase Resolution (Disbands & Builds)
        surviving_provs_by_pwr: dict[str, set[str]] = defaultdict(set)
        for p_name, reg_list in engine_regular_by_pwr.items():
            for _, bp, _ in reg_list:
                surviving_provs_by_pwr[p_name].add(bp)

        existing_provs: set[str] = set()
        for u in units:
            p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
            ord_obj = orders.get(u.id)
            if u.province in surviving_provs_by_pwr.get(p_name, set()):
                # Unit survived Adjustments phase
                new_units.append(
                    Unit(
                        id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        province=u.province,
                        coast=u.coast,
                        is_dislodged=False,
                    )
                )
                used_unit_ids.add(u.id)
                existing_provs.add(u.province)
                resolutions[u.id] = OrderResolution(
                    unit_id=u.id,
                    origin=u.province,
                    order_type=OrderType.HOLD,
                    succeeded=True,
                    reason=f"Retained {u.unit_type.value} in {p_name_fn(u.province)}.",
                )
            else:
                # Unit was disbanded (either explicitly or via Civil Disorder distance rules)
                was_explicit_disband = bool(ord_obj and ord_obj.order_type == OrderType.DISBAND)
                reason = (
                    f"Disbanded {u.unit_type.value} in {p_name_fn(u.province)}."
                    if was_explicit_disband
                    else f"Auto-disbanded {u.unit_type.value} in {p_name_fn(u.province)} (civil disorder deficit)."
                )
                summary.append(f"[{p_name}] Disbanded {u.unit_type.value} {p_name_fn(u.province)}.")
                resolutions[u.id] = OrderResolution(
                    unit_id=u.id,
                    origin=u.province,
                    order_type=OrderType.DISBAND,
                    succeeded=True,
                    reason=reason,
                )

        # Check for new units created via builds
        for p_name, reg_list in engine_regular_by_pwr.items():
            pwr = Power(p_name)
            for utype_str, base_prov, prov_coast in reg_list:
                if base_prov not in existing_provs:
                    base_uid = f"{pwr.value[:3]}_{utype_str}_{base_prov}"
                    new_uid = base_uid
                    suffix = 2
                    while new_uid in used_unit_ids:
                        new_uid = f"{base_uid}_{suffix}"
                        suffix += 1
                    used_unit_ids.add(new_uid)
                    existing_provs.add(base_prov)

                    new_units.append(
                        Unit(
                            id=new_uid,
                            power=pwr,
                            unit_type=UnitType(utype_str),
                            province=base_prov,
                            coast=prov_coast,
                            is_dislodged=False,
                        )
                    )
                    coast_label = f" ({prov_coast})" if prov_coast else ""
                    summary.append(
                        f"[{p_name}] Built {'Army' if utype_str == 'A' else 'Fleet'} in {p_name_fn(base_prov)}{coast_label}."
                    )
                    b_id = f"BUILD_{p_name}_{base_prov}"
                    resolutions[b_id] = OrderResolution(
                        unit_id=b_id,
                        origin=base_prov,
                        order_type=OrderType.BUILD,
                        target=base_prov,
                        succeeded=True,
                        reason=f"Built {'Army' if utype_str == 'A' else 'Fleet'} in {p_name_fn(base_prov)}{coast_label}.",
                    )

        # Also record resolutions for waived builds
        for ord_key, ord_obj in orders.items():
            if ord_key.startswith("BUILD_") and ord_key not in resolutions:
                if ord_obj.order_type == OrderType.WAIVE:
                    resolutions[ord_key] = OrderResolution(
                        unit_id=ord_key,
                        origin=ord_obj.origin,
                        order_type=OrderType.WAIVE,
                        succeeded=True,
                        reason=f"Waived build in {p_name_fn(ord_obj.origin)}.",
                    )

    # Next phase info from diplomacy game. A finished game has no next phase (its phase is the
    # bare word "COMPLETED"), so the clock stays on the phase that decided it.
    winner: Power | None = None
    if game.is_game_done:
        next_season, next_year, next_phase = season, year, phase
        if len(game.outcome) > 1:
            winner = Power(game.outcome[1])
    else:
        next_season, next_year, next_phase = parse_diplomacy_phase(game.phase)

    # Supply center ownership from diplomacy engine
    new_ownership: dict[str, Power] = {}
    engine_centers = game.get_centers()
    for p_name, c_list in engine_centers.items():
        pwr = Power(p_name)
        for c in c_list:
            new_ownership[c] = pwr

    # Extract builds and retreats status for the NEXT phase
    game_state_data = game.get_state()
    builds_data = None if game.is_game_done else game_state_data.get("builds")
    retreats_data = None if game.is_game_done else game_state_data.get("retreats")

    return SimulationResult(
        resolutions=resolutions,
        summary=summary,
        new_units=new_units,
        new_ownership=new_ownership,
        next_season=next_season,
        next_year=next_year,
        next_phase=next_phase,
        builds=builds_data,
        retreats=retreats_data,
        winner=winner,
    )
