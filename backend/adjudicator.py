from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple
import diplomacy
from map_data import PROVINCES, split_province_code
from models import (
    Order,
    OrderResolution,
    OrderType,
    Power,
    ProvinceType,
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


def parse_diplomacy_phase(phase_str: str) -> Tuple[str, int, str]:
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


def order_to_diplomacy_str(order: Order, units_by_prov: Dict[str, Unit]) -> Optional[str]:
    u_type = order.unit_type.value if hasattr(order.unit_type, "value") else str(order.unit_type)
    orig = f"{order.origin}/{order.origin_coast}" if order.origin_coast else order.origin

    if order.order_type == OrderType.HOLD:
        return f"{u_type} {orig} H"
    elif order.order_type == OrderType.MOVE:
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else (order.target or "")
        if order.via_convoy:
            return f"{u_type} {orig} - {dest} VIA"
        return f"{u_type} {orig} - {dest}"
    elif order.order_type == OrderType.SUPPORT:
        aux_prov = order.aux_unit_origin or ""
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        aux_orig = f"{aux_prov}/{aux_unit.coast}" if (aux_unit and aux_unit.coast) else aux_prov
        target_prov = order.target or aux_prov
        if target_prov == aux_prov:
            return f"{u_type} {orig} S {aux_type} {aux_orig}"
        else:
            return f"{u_type} {orig} S {aux_type} {aux_orig} - {target_prov}"
    elif order.order_type == OrderType.CONVOY:
        aux_prov = order.aux_unit_origin or ""
        aux_unit = units_by_prov.get(aux_prov)
        aux_type = aux_unit.unit_type.value if (aux_unit and hasattr(aux_unit.unit_type, "value")) else "A"
        target_prov = order.target or ""
        return f"{u_type} {orig} C {aux_type} {aux_prov} - {target_prov}"
    elif order.order_type == OrderType.BUILD:
        return f"{u_type} {orig} B"
    elif order.order_type == OrderType.DISBAND:
        return f"{u_type} {orig} D"
    elif order.order_type == OrderType.RETREAT:
        dest = f"{order.target}/{order.target_coast}" if order.target_coast else (order.target or "")
        return f"{u_type} {orig} R {dest}"
    elif order.order_type == OrderType.WAIVE:
        return "WAIVE"
    return None


def create_diplomacy_game(
    units: List[Unit],
    ownership: Dict[str, Power],
    season: str,
    year: int,
    phase: str,
) -> diplomacy.Game:
    game = diplomacy.Game()
    game.clear_units()
    game.clear_centers()

    # Set units
    units_by_pwr: Dict[str, List[str]] = {}
    for u in units:
        p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
        loc = f"{u.province}/{u.coast}" if u.coast else u.province
        u_str = f"{u.unit_type.value if hasattr(u.unit_type, 'value') else u.unit_type} {loc}"
        units_by_pwr.setdefault(p_name, []).append(u_str)

    for p_name, u_list in units_by_pwr.items():
        game.set_units(p_name, u_list)

    # Set supply centers
    centers_by_pwr: Dict[str, List[str]] = {}
    for prov, pwr in ownership.items():
        p_name = pwr.value if hasattr(pwr, "value") else str(pwr)
        centers_by_pwr.setdefault(p_name, []).append(prov)

    for p_name, c_list in centers_by_pwr.items():
        game.set_centers(p_name, c_list)

    phase_code = to_diplomacy_phase_code(season, year, phase)
    game.set_current_phase(phase_code)
    return game


def adjudicate_turn(
    units: List[Unit],
    orders: Dict[str, Order],
    ownership: Dict[str, Power],
    season: str = "Spring",
    year: int = 1901,
    phase: str = "Movement",
) -> SimulationResult:
    """
    Resolve a Diplomacy phase using the official DATC-compliant `diplomacy` engine.
    - Accurately determines bounces, cuts, dislodgements, circular movement, and convoy paradoxes.
    - Honors official supply center ownership timing: Spring movements do not capture SCs;
      Fall movements update ownership before the Winter adjustment phase.
    - Computes next phase information, builds counts, and retreat options.
    """
    game = create_diplomacy_game(units, ownership, season, year, phase)
    phase_code = to_diplomacy_phase_code(season, year, phase)

    units_by_prov = {u.province: u for u in units}
    unit_by_id = {u.id: u for u in units}

    # Format orders for diplomacy engine
    power_orders: Dict[str, List[str]] = {}
    for u in units:
        ord_obj = orders.get(u.id)
        if ord_obj:
            d_str = order_to_diplomacy_str(ord_obj, units_by_prov)
            if d_str:
                p_name = u.power.value if hasattr(u.power, "value") else str(u.power)
                power_orders.setdefault(p_name, []).append(d_str)

    # Include standalone build/waive orders
    for ord_key, ord_obj in orders.items():
        if ord_obj.order_type in (OrderType.BUILD, OrderType.WAIVE) and ord_key not in unit_by_id:
            p_name = ord_obj.power.value if hasattr(ord_obj.power, "value") else str(ord_obj.power)
            d_str = order_to_diplomacy_str(ord_obj, units_by_prov)
            if d_str:
                power_orders.setdefault(p_name, []).append(d_str)

    # Submit orders to game
    for p_name, ord_list in power_orders.items():
        game.set_orders(p_name, ord_list)

    # Process adjudication
    game.process()

    results_for_phase = game.result_history.get(phase_code, {})

    # Compute uncut supports for calculating attack/defense strengths
    # A support is cut if result code == 10004 or 'cut' in message
    uncut_supports_for_move: Dict[Tuple[str, str], int] = defaultdict(int)  # (orig, dest) -> count
    uncut_supports_for_hold: Dict[str, int] = defaultdict(int)  # target_prov -> count

    for u in units:
        ord_obj = orders.get(u.id)
        if ord_obj and ord_obj.order_type == OrderType.SUPPORT and ord_obj.aux_unit_origin and ord_obj.target:
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

    resolutions: Dict[str, OrderResolution] = {}
    summary: List[str] = []

    def p_name(code: Optional[str]) -> str:
        if not code:
            return ""
        return PROVINCES[code].name if code in PROVINCES else code

    for u in units:
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
        succeeded = not no_convoy and not bounced and not cut and not dislodged and not voided and not disrupted

        attack_strength = 1
        defense_strength = 1

        otype = ord_obj.order_type if ord_obj else OrderType.HOLD
        target = ord_obj.target if ord_obj else None

        if otype == OrderType.MOVE and target:
            attack_strength = 1 + uncut_supports_for_move.get((u.province, target), 0)
            if no_convoy:
                reason = f"Convoy path missing or disrupted moving to {p_name(target)}."
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} failed to move to {p_name(target)} (no convoy).")
            elif bounced:
                reason = f"Bounced attempting to move to {p_name(target)} (strength {attack_strength})."
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} bounced moving to {p_name(target)}.")
            elif dislodged:
                reason = f"Dislodged while attempting to move to {p_name(target)}!"
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} was dislodged!")
            else:
                reason = f"Advanced to {p_name(target)} with strength {attack_strength}."
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} -> {p_name(target)} succeeded.")
        elif otype == OrderType.SUPPORT:
            if cut:
                reason = "Support cut by enemy attack!"
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} support cut.")
            elif dislodged:
                reason = "Dislodged! Support broken."
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} dislodged.")
            else:
                reason = "Support held unbroken."
        elif otype == OrderType.CONVOY:
            if disrupted or dislodged:
                reason = "Convoy disrupted by fleet dislodgement."
                summary.append(f"[{u.power.value}] Fleet {p_name(u.province)} convoy disrupted.")
            else:
                reason = "Convoy route maintained."
        elif otype == OrderType.HOLD:
            defense_strength = 1 + uncut_supports_for_hold.get(u.province, 0)
            if dislodged:
                reason = f"Dislodged by superior force (defense {defense_strength})."
                summary.append(f"[{u.power.value}] {u.unit_type.value} {p_name(u.province)} dislodged.")
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

    # Next phase info from diplomacy game
    next_season, next_year, next_phase = parse_diplomacy_phase(game.phase)

    # Compute resulting units
    new_units: List[Unit] = []
    engine_units_by_pwr = game.get_units()

    # Track surviving existing units
    for u in units:
        res = resolutions.get(u.id)
        if res and res.dislodged:
            # Unit was dislodged; in movement phase it must retreat or is disbanded
            continue

        ord_obj = orders.get(u.id)
        if ord_obj and ord_obj.order_type == OrderType.MOVE and res and res.succeeded and ord_obj.target:
            dest = ord_obj.target
            dest_coast = ord_obj.target_coast
            # Auto-infer destination coast for fleet entering multi-coast province if needed
            if u.unit_type == UnitType.FLEET and PROVINCES.get(dest) and PROVINCES[dest].coasts and not dest_coast:
                p_units = engine_units_by_pwr.get(u.power.value, [])
                for u_str in p_units:
                    if dest in u_str and "/" in u_str:
                        dest_coast = u_str.split("/")[1]
                        break
            new_units.append(
                Unit(
                    id=u.id,
                    power=u.power,
                    unit_type=u.unit_type,
                    province=dest,
                    coast=dest_coast,
                )
            )
        else:
            new_units.append(
                Unit(
                    id=u.id,
                    power=u.power,
                    unit_type=u.unit_type,
                    province=u.province,
                    coast=u.coast,
                )
            )

    # Check for new units created via builds (in Adjustments phase)
    existing_provs = {u.province for u in new_units}
    for p_name, u_strs in engine_units_by_pwr.items():
        pwr = Power(p_name)
        for u_str in u_strs:
            parts = u_str.split()
            utype_str = parts[0]
            loc_str = parts[1]
            base_prov, prov_coast = split_province_code(loc_str)
            if base_prov not in existing_provs:
                new_uid = f"{pwr.value[:3]}_{utype_str}_{base_prov}"
                new_units.append(
                    Unit(
                        id=new_uid,
                        power=pwr,
                        unit_type=UnitType(utype_str),
                        province=base_prov,
                        coast=prov_coast,
                    )
                )
                existing_provs.add(base_prov)

    # Supply center ownership from diplomacy engine
    new_ownership: Dict[str, Power] = {}
    engine_centers = game.get_centers()
    for p_name, c_list in engine_centers.items():
        pwr = Power(p_name)
        for c in c_list:
            new_ownership[c] = pwr

    # Extract builds and retreats status
    game_state_data = game.get_state()
    builds_data = game_state_data.get("builds")
    retreats_data = game_state_data.get("retreats")

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
    )
