import re
from typing import Any

from domain.models import Order, OrderType, Power, Unit, UnitType
from engine.adjudicator.resolver import create_diplomacy_game
from engine.topology import PROVINCES, split_province_code


def parse_diplomacy_order_str(order_str: str, power: Power, unit_id: str) -> Order | None:
    """Parse a DATC order string from python diplomacy library into our Pydantic Order model."""
    s = order_str.strip()
    if not s:
        return None

    if s == "WAIVE":
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY,
            origin="",
            order_type=OrderType.WAIVE,
            is_explicit=True,
        )

    # BUILD: A PAR B or F STP/NC B
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+B$", s)
    if m:
        u_type_str, loc = m.groups()
        base, coast = split_province_code(loc)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.BUILD,
            is_explicit=True,
        )

    # DISBAND: A PAR D
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+D$", s)
    if m:
        u_type_str, loc = m.groups()
        base, coast = split_province_code(loc)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.DISBAND,
            is_explicit=True,
        )

    # RETREAT: A PAR R BUR or F MAO R SPA/NC
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+R\s+([A-Z0-9/]+)$", s)
    if m:
        u_type_str, loc, tgt = m.groups()
        base, coast = split_province_code(loc)
        t_base, t_coast = split_province_code(tgt)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.RETREAT,
            target=t_base,
            target_coast=t_coast,
            is_explicit=True,
        )

    # HOLD: A PAR H
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+H$", s)
    if m:
        u_type_str, loc = m.groups()
        base, coast = split_province_code(loc)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.HOLD,
            is_explicit=True,
        )

    # MOVE: A PAR - BUR or A LON - BEL VIA
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+-\s+([A-Z0-9/]+)(\s+VIA)?$", s)
    if m:
        u_type_str, loc, tgt, via = m.groups()
        base, coast = split_province_code(loc)
        t_base, t_coast = split_province_code(tgt)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.MOVE,
            target=t_base,
            target_coast=t_coast,
            via_convoy=bool(via),
            is_explicit=True,
        )

    # SUPPORT MOVE: A PAR S A MAR - BUR
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+S\s+(A|F)\s+([A-Z0-9/]+)\s+-\s+([A-Z0-9/]+)$", s)
    if m:
        u_type_str, loc, aux_t, aux_loc, tgt = m.groups()
        base, coast = split_province_code(loc)
        aux_b, aux_c = split_province_code(aux_loc)
        t_b, t_c = split_province_code(tgt)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.SUPPORT,
            aux_unit_origin=aux_b,
            target=t_b,
            target_coast=t_c,
            is_explicit=True,
        )

    # SUPPORT HOLD: A PAR S A MAR or A PAR S A MAR H
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+S\s+(A|F)\s+([A-Z0-9/]+)(?:\s+H)?$", s)
    if m:
        u_type_str, loc, aux_t, aux_loc = m.groups()
        base, coast = split_province_code(loc)
        aux_b, aux_c = split_province_code(aux_loc)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.SUPPORT,
            aux_unit_origin=aux_b,
            target=aux_b,
            is_explicit=True,
        )

    # CONVOY: F NTH C A LON - BEL
    m = re.match(r"^(A|F)\s+([A-Z0-9/]+)\s+C\s+(A|F)\s+([A-Z0-9/]+)\s+-\s+([A-Z0-9/]+)$", s)
    if m:
        u_type_str, loc, aux_t, aux_loc, tgt = m.groups()
        base, coast = split_province_code(loc)
        aux_b, aux_c = split_province_code(aux_loc)
        t_b, t_c = split_province_code(tgt)
        return Order(
            unit_id=unit_id,
            power=power,
            unit_type=UnitType.ARMY if u_type_str == "A" else UnitType.FLEET,
            origin=base,
            origin_coast=coast,
            order_type=OrderType.CONVOY,
            aux_unit_origin=aux_b,
            target=t_b,
            target_coast=t_c,
            is_explicit=True,
        )

    return None


def generate_tactical_orders(
    units: list[Unit],
    ownership: dict[str, Power],
    season: str,
    year: int,
    phase: str,
    target_powers: list[Power] | None = None,
    retreats: dict[str, Any] | None = None,
    builds: dict[str, Any] | None = None,
) -> dict[str, Order]:
    """
    Authoritative Diplomacy Tactical AI Engine.
    Generates intelligent, DATC-compliant, non-colliding tactical orders
    for specified Great Powers (or all powers if target_powers is None).
    """
    ai_orders: dict[str, Order] = {}
    powers_to_plan = target_powers or list(Power)

    # 1. Adjustments Phase AI
    if phase == "Adjustments":
        for p in powers_to_plan:
            p_val = p.value
            b_info = (builds or {}).get(p_val, {})
            count = b_info.get("count", 0)
            homes = b_info.get("homes", [])

            if count > 0:
                # Building units in vacant home supply centers
                build_slots = min(count, len(homes))
                for idx, h in enumerate(homes):
                    b_id = f"BUILD_{p_val}_{h}"
                    prov_info = PROVINCES.get(h)
                    if idx < build_slots:
                        is_coastal = bool(prov_info and prov_info.coasts)
                        choose_fleet = is_coastal and (
                            p == Power.ENGLAND
                            or (idx == 0 and h in ["STP", "ANK", "NAP", "KIE", "TRI"])
                        )
                        u_type = UnitType.FLEET if choose_fleet else UnitType.ARMY
                        coast = (
                            prov_info.coasts[0]
                            if (choose_fleet and prov_info and prov_info.coasts)
                            else None
                        )
                        if choose_fleet and h == "STP":
                            coast = "NC"
                        ai_orders[b_id] = Order(
                            unit_id=b_id,
                            power=p,
                            unit_type=u_type,
                            origin=h,
                            origin_coast=coast,
                            order_type=OrderType.BUILD,
                            is_explicit=True,
                        )
                    else:
                        ai_orders[b_id] = Order(
                            unit_id=b_id,
                            power=p,
                            unit_type=UnitType.ARMY,
                            origin=h,
                            order_type=OrderType.WAIVE,
                            is_explicit=True,
                        )
            elif count < 0:
                needed_disbands = abs(count)
                p_units = [u for u in units if u.power == p]
                for idx, u in enumerate(p_units):
                    if idx < needed_disbands:
                        ai_orders[u.id] = Order(
                            unit_id=u.id,
                            power=p,
                            unit_type=u.unit_type,
                            origin=u.province,
                            origin_coast=u.coast,
                            order_type=OrderType.DISBAND,
                            is_explicit=True,
                        )
                    else:
                        ai_orders[u.id] = Order(
                            unit_id=u.id,
                            power=p,
                            unit_type=u.unit_type,
                            origin=u.province,
                            origin_coast=u.coast,
                            order_type=OrderType.HOLD,
                            is_explicit=True,
                        )
            else:
                for u in units:
                    if u.power == p:
                        ai_orders[u.id] = Order(
                            unit_id=u.id,
                            power=p,
                            unit_type=u.unit_type,
                            origin=u.province,
                            origin_coast=u.coast,
                            order_type=OrderType.HOLD,
                            is_explicit=True,
                        )
        return ai_orders

    # 2. Retreats Phase AI
    if phase == "Retreats":
        r_game = create_diplomacy_game(
            units, ownership, season, year, "Retreats", retreats=retreats
        )
        active_retreats = retreats or r_game.get_state().get("retreats", {})

        for u in units:
            if u.power not in powers_to_plan:
                continue
            if u.is_dislodged:
                u_loc = f"{u.province}/{u.coast}" if u.coast else u.province
                u_key = f"{u.unit_type.value} {u_loc}"
                p_ret = active_retreats.get(u.power.value, {})
                valid_dests = p_ret.get(u_key, p_ret.get(f"{u.unit_type.value} {u.province}", []))

                if valid_dests:
                    first_base, first_coast = split_province_code(valid_dests[0])
                    ai_orders[u.id] = Order(
                        unit_id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        origin=u.province,
                        origin_coast=u.coast,
                        order_type=OrderType.RETREAT,
                        target=first_base,
                        target_coast=first_coast,
                        is_explicit=True,
                    )
                else:
                    ai_orders[u.id] = Order(
                        unit_id=u.id,
                        power=u.power,
                        unit_type=u.unit_type,
                        origin=u.province,
                        origin_coast=u.coast,
                        order_type=OrderType.DISBAND,
                        is_explicit=True,
                    )
            else:
                ai_orders[u.id] = Order(
                    unit_id=u.id,
                    power=u.power,
                    unit_type=u.unit_type,
                    origin=u.province,
                    origin_coast=u.coast,
                    order_type=OrderType.HOLD,
                    is_explicit=True,
                )
        return ai_orders

    # 3. Movement Phase AI
    d_game = create_diplomacy_game(units, ownership, season, year, "Movement")
    all_possible = d_game.get_all_possible_orders()

    units_by_prov: dict[str, Unit] = {u.province: u for u in units}
    neutral_scs = {
        pid for pid, pinfo in PROVINCES.items() if pinfo.is_supply_center and pid not in ownership
    }
    enemy_scs = {pid for pid, pwr in ownership.items() if pwr not in powers_to_plan}
    occupied_provs = set(units_by_prov.keys())

    # Strategic water/staging choke points
    strategic_waters = {
        "MAO": {"POR", "SPA", "BRE", "ENG", "NAF"},
        "NTH": {"BEL", "HOL", "DEN", "NOR", "LON", "EDI"},
        "ION": {"TUN", "GRE", "NAP", "ALB"},
        "BLA": {"BUL", "RUM", "SEV", "ANK"},
        "BOT": {"SWE", "STP"},
        "BAL": {"DEN", "SWE", "BER", "KIE"},
        "AEG": {"BUL", "GRE", "CON", "SMY"},
        "WES": {"SPA", "TUN"},
        "TYS": {"TUN", "NAP", "ROM"},
        "ADR": {"TRI", "VEN", "ALB"},
    }

    for p in powers_to_plan:
        p_units = [u for u in units if u.power == p]
        if not p_units:
            continue

        assigned_targets: set[str] = set()
        planned_moves: dict[str, tuple[str, str | None]] = {}
        unit_orders: dict[str, Order] = {}

        # First pass: Score and assign primary MOVE or HOLD orders
        for u in p_units:
            loc_key = f"{u.province}/{u.coast}" if u.coast else u.province
            candidate_strs = all_possible.get(loc_key, all_possible.get(u.province, []))

            scored_candidates: list[tuple[float, str, Any]] = []
            for c_str in candidate_strs:
                parsed = parse_diplomacy_order_str(c_str, p, u.id)
                if not parsed:
                    continue

                score = 0.0
                if parsed.order_type == OrderType.MOVE:
                    dest = parsed.target or ""
                    if dest in assigned_targets:
                        score -= 500.0
                    other_u = units_by_prov.get(dest)
                    if (
                        other_u
                        and other_u.power == p
                        and planned_moves.get(other_u.id, (None,))[0] == u.province
                    ):
                        score -= 600.0

                    if dest in neutral_scs:
                        score += 150.0  # Top priority: claim neutral SC
                    elif dest in enemy_scs:
                        score += 120.0  # Second priority: capture enemy SC
                    elif u.unit_type == UnitType.FLEET and dest in strategic_waters:
                        # Sea zones adjacent to neutral SCs get major strategic priority
                        sc_touching = len(strategic_waters[dest].intersection(neutral_scs))
                        score += 90.0 + (sc_touching * 25.0)
                    elif PROVINCES.get(dest, None) and any(
                        adj in neutral_scs for adj in PROVINCES[dest].army_adj
                    ):
                        score += 65.0  # Stepping stone adjacent to neutral SC
                    elif dest not in occupied_provs:
                        score += 35.0  # General advance
                    else:
                        score += 10.0

                    score += (hash(dest) % 7) * 0.5

                elif parsed.order_type == OrderType.HOLD:
                    if u.province in ownership and ownership[u.province] == p:
                        score += 40.0
                    else:
                        score += 15.0

                elif parsed.order_type == OrderType.SUPPORT:
                    score = -50.0
                elif parsed.order_type == OrderType.CONVOY:
                    score = -20.0

                scored_candidates.append((score, c_str, parsed))

            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            best_parsed = (
                scored_candidates[0][2]
                if scored_candidates
                else Order(
                    unit_id=u.id,
                    power=p,
                    unit_type=u.unit_type,
                    origin=u.province,
                    origin_coast=u.coast,
                    order_type=OrderType.HOLD,
                    is_explicit=True,
                )
            )

            if best_parsed.order_type == OrderType.MOVE and best_parsed.target:
                assigned_targets.add(best_parsed.target)
                planned_moves[u.id] = (best_parsed.target, best_parsed.target_coast)

            unit_orders[u.id] = best_parsed

        # Second pass: Consider converting non-critical moves or holds into SUPPORT
        for u in p_units:
            current_ord = unit_orders[u.id]
            # Don't convert if moving to neutral SC, enemy SC, or strategic water
            is_priority_action = current_ord.order_type == OrderType.MOVE and (
                current_ord.target in neutral_scs
                or current_ord.target in enemy_scs
                or (u.unit_type == UnitType.FLEET and current_ord.target in strategic_waters)
            )
            if not is_priority_action:
                loc_key = f"{u.province}/{u.coast}" if u.coast else u.province
                candidate_strs = all_possible.get(loc_key, all_possible.get(u.province, []))
                for c_str in candidate_strs:
                    cand = parse_diplomacy_order_str(c_str, p, u.id)
                    if (
                        cand
                        and cand.order_type == OrderType.SUPPORT
                        and cand.aux_unit_origin
                        and cand.target
                    ):
                        aux_u = units_by_prov.get(cand.aux_unit_origin)
                        if aux_u and aux_u.power == p:
                            aux_move = planned_moves.get(aux_u.id)
                            # Support if aux_u is moving to contested enemy SC or occupied province
                            if (
                                aux_move
                                and aux_move[0] == cand.target
                                and (cand.target in enemy_scs or cand.target in occupied_provs)
                            ):
                                cand.is_explicit = True
                                unit_orders[u.id] = cand
                                break

        ai_orders.update(unit_orders)

    return ai_orders
