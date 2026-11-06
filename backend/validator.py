from collections import defaultdict
from typing import Any, Dict, List, Optional, Set
from map_data import (
    PROVINCES,
    can_army_be_convoyed_theoretically,
    can_unit_move_directly,
    can_unit_support_province,
    split_province_code,
)
from models import (
    IssueCode,
    IssueSeverity,
    Order,
    OrderType,
    Power,
    ProvinceType,
    Unit,
    UnitType,
    ValidationIssue,
)


def has_active_convoy_chain(
    army_origin: str,
    army_target: str,
    units: List[Unit],
    orders: Dict[str, Order],
) -> bool:
    """
    Check if there is a connected chain of Fleets in SEA provinces ordered to CONVOY
    the army from army_origin to army_target.
    """
    convoying_sea_provs: Set[str] = set()
    for u in units:
        if u.unit_type == UnitType.FLEET and PROVINCES[u.province].type == ProvinceType.SEA:
            order = orders.get(u.id)
            if (
                order
                and order.order_type == OrderType.CONVOY
                and order.aux_unit_origin == army_origin
                and order.target == army_target
            ):
                convoying_sea_provs.add(u.province)

    if not convoying_sea_provs:
        return False

    # BFS from sea zones adjacent to army_origin to sea zones adjacent to army_target
    def fleet_touches_land(sea_prov: str, land_prov: str) -> bool:
        adj = PROVINCES[sea_prov].fleet_adj.get("", [])
        return any(split_province_code(a)[0] == land_prov for a in adj)

    start_seas = {s for s in convoying_sea_provs if fleet_touches_land(s, army_origin)}
    end_seas = {s for s in convoying_sea_provs if fleet_touches_land(s, army_target)}

    if not start_seas or not end_seas:
        return False

    visited: Set[str] = set()
    queue = list(start_seas)
    while queue:
        curr = queue.pop(0)
        if curr in end_seas:
            return True
        if curr in visited:
            continue
        visited.add(curr)
        for neighbor in PROVINCES[curr].fleet_adj.get("", []):
            base_n = split_province_code(neighbor)[0]
            if base_n in convoying_sea_provs and base_n not in visited:
                queue.append(base_n)

    return False


def validate_orders(
    units: List[Unit],
    orders: Dict[str, Order],
    include_unassigned_warnings: bool = False,
    target_power: Optional[Power] = None,
    phase: str = "Movement",
    builds: Optional[Dict[str, Any]] = None,
    retreats: Optional[Dict[str, Any]] = None,
) -> List[ValidationIssue]:
    """
    Perform comprehensive legality & tactical sanity checks on all current orders.
    Supports Movement, Retreats, and Winter Adjustments phases.
    """
    issues: List[ValidationIssue] = []
    unit_by_prov: Dict[str, Unit] = {u.province: u for u in units if not u.is_dislodged}

    def p_name(code: Optional[str]) -> str:
        if not code:
            return "Unknown"
        return PROVINCES[code].name if code in PROVINCES else code

    issue_counter = 0

    def add_issue(
        severity: IssueSeverity,
        code: IssueCode,
        title: str,
        message: str,
        unit_ids: List[str],
        provinces: List[str],
        power: Power,
    ):
        nonlocal issue_counter
        if target_power and power != target_power:
            return
        issue_counter += 1
        issues.append(
            ValidationIssue(
                id=f"issue_{issue_counter}_{code.value}",
                severity=severity,
                code=code,
                title=title,
                message=message,
                unit_ids=unit_ids,
                provinces=provinces,
                power=power,
            )
        )

    # --- RETREATS PHASE VALIDATION ---
    if phase == "Retreats":
        retreats_by_power_and_dest: Dict[Power, Dict[str, List[Unit]]] = defaultdict(lambda: defaultdict(list))
        for unit in units:
            if not unit.is_dislodged:
                continue
            order = orders.get(unit.id)
            if not order:
                continue

            if include_unassigned_warnings and not order.is_explicit:
                add_issue(
                    severity=IssueSeverity.WARNING,
                    code=IssueCode.UNASSIGNED_UNIT,
                    title=f"No Retreat Ordered in {p_name(unit.province)}",
                    message=f"Dislodged {unit.unit_type.value} {p_name(unit.province)} will disband unless it is ordered to retreat.",
                    unit_ids=[unit.id],
                    provinces=[unit.province],
                    power=unit.power,
                )

            if order.order_type == OrderType.RETREAT:
                if not order.target or order.target not in PROVINCES:
                    add_issue(
                        IssueSeverity.ERROR,
                        IssueCode.ILLEGAL_MOVE,
                        "Missing Retreat Destination",
                        f"Dislodged {unit.unit_type.value} {p_name(unit.province)} must select a valid retreat destination or Disband.",
                        [unit.id],
                        [unit.province],
                        unit.power,
                    )
                    continue

                if retreats:
                    u_loc = f"{unit.province}/{unit.coast}" if unit.coast else unit.province
                    u_key = f"{unit.unit_type.value} {u_loc}"
                    p_ret = retreats.get(unit.power.value, {})
                    valid_locs = p_ret.get(u_key, p_ret.get(f"{unit.unit_type.value} {unit.province}", []))
                    valid_bases = {split_province_code(loc)[0] for loc in valid_locs}
                    if order.target not in valid_bases:
                        add_issue(
                            IssueSeverity.ERROR,
                            IssueCode.ILLEGAL_MOVE,
                            f"Illegal Retreat to {p_name(order.target)}",
                            f"Dislodged {unit.unit_type.value} {p_name(unit.province)} cannot retreat to {p_name(order.target)} (occupied, attacker origin, or contested bounce).",
                            [unit.id],
                            [unit.province, order.target],
                            unit.power,
                        )
                retreats_by_power_and_dest[unit.power][order.target].append(unit)

        for power, dest_map in retreats_by_power_and_dest.items():
            for dest, ret_units in dest_map.items():
                if len(ret_units) > 1:
                    u_names = ", ".join(f"{u.unit_type.value} {p_name(u.province)}" for u in ret_units)
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.SELF_BOUNCE,
                        f"Retreat Collision in {p_name(dest)}",
                        f"Multiple dislodged units ({u_names}) are retreating to {p_name(dest)}. In Diplomacy, colliding retreats bounce and BOTH units are disbanded!",
                        [u.id for u in ret_units],
                        [dest] + [u.province for u in ret_units],
                        power,
                    )
        return issues

    # --- WINTER ADJUSTMENTS PHASE VALIDATION ---
    if phase == "Adjustments":
        if builds:
            for p_str, b_info in builds.items():
                pwr = Power(p_str)
                count = b_info.get("count", 0)
                homes = b_info.get("homes", [])
                pwr_units = [u for u in units if u.power == pwr]
                if count < 0:
                    needed_disbands = abs(count)
                    disbanding_units = [
                        u for u in pwr_units if orders.get(u.id) and orders[u.id].order_type == OrderType.DISBAND
                    ]
                    if len(disbanding_units) < needed_disbands:
                        rem = needed_disbands - len(disbanding_units)
                        add_issue(
                            IssueSeverity.WARNING,
                            IssueCode.UNASSIGNED_UNIT,
                            f"Select {rem} More Unit{'s' if rem > 1 else ''} to Disband",
                            f"{p_str.capitalize()} has {len(pwr_units)} units but fewer supply centers and must disband {needed_disbands} unit{'s' if needed_disbands > 1 else ''} ({len(disbanding_units)}/{needed_disbands} selected).",
                            [u.id for u in pwr_units],
                            [u.province for u in pwr_units],
                            pwr,
                        )
                elif count > 0 and homes and include_unassigned_warnings:
                    slots = min(count, len(homes))
                    chosen = [
                        h for h in homes
                        if orders.get(f"BUILD_{p_str}_{h}")
                        and orders[f"BUILD_{p_str}_{h}"].order_type == OrderType.BUILD
                    ]
                    undecided = [
                        h for h in homes
                        if orders.get(f"BUILD_{p_str}_{h}")
                        and orders[f"BUILD_{p_str}_{h}"].order_type == OrderType.WAIVE
                        and not orders[f"BUILD_{p_str}_{h}"].is_explicit
                    ]
                    unused = slots - len(chosen)
                    if unused > 0 and undecided:
                        add_issue(
                            IssueSeverity.WARNING,
                            IssueCode.UNASSIGNED_UNIT,
                            f"{unused} Unused Build{'s' if unused > 1 else ''}",
                            f"{p_str.capitalize()} may build {slots} unit{'s' if slots > 1 else ''} ({len(chosen)}/{slots} chosen). Builds not ordered are waived.",
                            [f"BUILD_{p_str}_{h}" for h in undecided],
                            undecided,
                            pwr,
                        )
        return issues

    # --- MOVEMENT PHASE VALIDATION ---
    # 1. Per-unit legality & tactical checks
    for unit in units:
        if unit.is_dislodged:
            continue
        order = orders.get(unit.id)
        if not order:
            continue

        if include_unassigned_warnings and not order.is_explicit:
            add_issue(
                severity=IssueSeverity.WARNING,
                code=IssueCode.UNASSIGNED_UNIT,
                title=f"Unconfirmed Order in {p_name(unit.province)}",
                message=f"{unit.unit_type.value} {p_name(unit.province)} has not been given an explicit order and will default to HOLD.",
                unit_ids=[unit.id],
                provinces=[unit.province],
                power=unit.power,
            )

        if order.order_type == OrderType.HOLD:
            continue

        elif order.order_type == OrderType.MOVE:
            if not order.target or order.target not in PROVINCES:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_MOVE,
                    "Missing Destination",
                    f"{unit.unit_type.value} {p_name(unit.province)} has a MOVE order without a valid destination.",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            ok, reason = can_unit_move_directly(
                unit.unit_type, unit.province, unit.coast, order.target, order.target_coast
            )
            if not ok:
                # Check if Army could be convoyed
                if unit.unit_type == UnitType.ARMY and can_army_be_convoyed_theoretically(unit.province, order.target):
                    if not has_active_convoy_chain(unit.province, order.target, units, orders):
                        add_issue(
                            IssueSeverity.WARNING,
                            IssueCode.BROKEN_CONVOY,
                            f"Missing Fleet Convoy to {p_name(order.target)}",
                            f"Army in {p_name(unit.province)} is ordered to {p_name(order.target)} across water, "
                            f"but no connected Fleet chain is currently ordered to CONVOY it.",
                            [unit.id],
                            [unit.province, order.target],
                            unit.power,
                        )
                else:
                    add_issue(
                        IssueSeverity.ERROR,
                        IssueCode.ILLEGAL_MOVE,
                        f"Illegal Move to {p_name(order.target)}",
                        reason,
                        [unit.id],
                        [unit.province, order.target],
                        unit.power,
                    )
            else:
                # Check if fleet moves to a multi-coast province from a sea zone that touches BOTH coasts without specifying coast
                targ_prov = PROVINCES[order.target]
                if unit.unit_type == UnitType.FLEET and targ_prov.coasts and not order.target_coast:
                    coast_key = unit.coast or ""
                    adj_list = PROVINCES[unit.province].fleet_adj.get(coast_key, [])
                    matching_coasts = [
                        split_province_code(a)[1]
                        for a in adj_list
                        if split_province_code(a)[0] == order.target and split_province_code(a)[1]
                    ]
                    if len(matching_coasts) > 1:
                        add_issue(
                            IssueSeverity.ERROR,
                            IssueCode.ILLEGAL_MOVE,
                            f"Ambiguous Coast for {p_name(order.target)}",
                            f"Fleet in {p_name(unit.province)} can reach multiple coasts of {p_name(order.target)} "
                            f"({', '.join(matching_coasts)}); specify which coast.",
                            [unit.id],
                            [unit.province, order.target],
                            unit.power,
                        )

        elif order.order_type == OrderType.SUPPORT:
            if not order.aux_unit_origin or not order.target:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_SUPPORT,
                    "Incomplete Support Order",
                    f"{unit.unit_type.value} {p_name(unit.province)} must specify both the unit to support and its target province.",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            if order.aux_unit_origin == unit.province:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.VOID_SUPPORT_SELF,
                    "Cannot Support Self",
                    f"{unit.unit_type.value} {p_name(unit.province)} cannot support itself.",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            can_sup, sup_reason = can_unit_support_province(
                unit.unit_type, unit.province, unit.coast, order.target
            )
            if not can_sup:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_SUPPORT,
                    f"Cannot Support Into {p_name(order.target)}",
                    f"{unit.unit_type.value} {p_name(unit.province)} cannot project support into {p_name(order.target)}: {sup_reason}",
                    [unit.id],
                    [unit.province, order.target],
                    unit.power,
                )
                continue

            supported_unit = unit_by_prov.get(order.aux_unit_origin)
            if not supported_unit:
                add_issue(
                    IssueSeverity.WARNING,
                    IssueCode.UNMATCHED_SUPPORT,
                    f"No Unit in {p_name(order.aux_unit_origin)}",
                    f"{unit.unit_type.value} {p_name(unit.province)} is supporting a unit in {p_name(order.aux_unit_origin)}, which is currently unoccupied.",
                    [unit.id],
                    [unit.province, order.aux_unit_origin, order.target],
                    unit.power,
                )
                continue

            supported_order = orders.get(supported_unit.id)
            is_support_hold = order.aux_unit_origin == order.target

            if is_support_hold:
                # Supporting unit to HOLD in place
                if supported_order and supported_order.order_type == OrderType.MOVE:
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.UNMATCHED_SUPPORT,
                        f"Unmatched Support Hold for {p_name(supported_unit.province)}",
                        f"{unit.unit_type.value} {p_name(unit.province)} is ordered to support {supported_unit.unit_type.value} {p_name(supported_unit.province)} holding in place, "
                        f"but {p_name(supported_unit.province)} is ordered to MOVE to {p_name(supported_order.target)}.",
                        [unit.id, supported_unit.id],
                        [unit.province, supported_unit.province],
                        unit.power,
                    )
            else:
                # Supporting unit to MOVE from aux_unit_origin -> target
                if (
                    not supported_order
                    or supported_order.order_type != OrderType.MOVE
                    or supported_order.target != order.target
                ):
                    actual_desc = "holding in place"
                    if supported_order and supported_order.order_type == OrderType.MOVE:
                        actual_desc = f"moving to {p_name(supported_order.target)}"
                    elif supported_order and supported_order.order_type == OrderType.SUPPORT:
                        actual_desc = "giving support elsewhere"
                    elif supported_order and supported_order.order_type == OrderType.CONVOY:
                        actual_desc = "convoying"

                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.UNMATCHED_SUPPORT,
                        f"Unmatched Support for {p_name(supported_unit.province)} → {p_name(order.target)}",
                        f"{unit.unit_type.value} {p_name(unit.province)} is supporting {supported_unit.unit_type.value} {p_name(supported_unit.province)} → {p_name(order.target)}, "
                        f"but {p_name(supported_unit.province)} is currently {actual_desc}.",
                        [unit.id, supported_unit.id],
                        [unit.province, supported_unit.province, order.target],
                        unit.power,
                    )

                # Check Friendly Fire: supporting an attack on a province occupied by your own unit
                occupant = unit_by_prov.get(order.target)
                if occupant and occupant.power == unit.power:
                    occ_order = orders.get(occupant.id)
                    if not occ_order or occ_order.order_type != OrderType.MOVE:
                        add_issue(
                            IssueSeverity.WARNING,
                            IssueCode.FRIENDLY_FIRE,
                            f"Supporting Attack on Own Unit in {p_name(order.target)}",
                            f"{unit.unit_type.value} {p_name(unit.province)} is supporting an attack into {p_name(order.target)}, "
                            f"which is occupied by your own {occupant.unit_type.value} {p_name(occupant.province)}!",
                            [unit.id, occupant.id],
                            [unit.province, order.target],
                            unit.power,
                        )

        elif order.order_type == OrderType.CONVOY:
            if unit.unit_type != UnitType.FLEET or PROVINCES[unit.province].type != ProvinceType.SEA:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_CONVOY,
                    f"Illegal Convoy by {p_name(unit.province)}",
                    f"Only a Fleet in a sea zone can execute a CONVOY order ({p_name(unit.province)} is {PROVINCES[unit.province].type.value}).",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            if not order.aux_unit_origin or not order.target:
                add_issue(
                    IssueSeverity.ERROR,
                    IssueCode.ILLEGAL_CONVOY,
                    "Incomplete Convoy Order",
                    f"Fleet in {p_name(unit.province)} must specify the Army origin and destination province.",
                    [unit.id],
                    [unit.province],
                    unit.power,
                )
                continue

            convoyed_unit = unit_by_prov.get(order.aux_unit_origin)
            if not convoyed_unit or convoyed_unit.unit_type != UnitType.ARMY:
                add_issue(
                    IssueSeverity.WARNING,
                    IssueCode.BROKEN_CONVOY,
                    f"No Army in {p_name(order.aux_unit_origin)} to Convoy",
                    f"Fleet in {p_name(unit.province)} is ordered to convoy an Army from {p_name(order.aux_unit_origin)}, but no Army is present there.",
                    [unit.id],
                    [unit.province, order.aux_unit_origin, order.target],
                    unit.power,
                )
            else:
                conv_order = orders.get(convoyed_unit.id)
                if not conv_order or conv_order.order_type != OrderType.MOVE or conv_order.target != order.target:
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.BROKEN_CONVOY,
                        f"Unmatched Convoy for Army {p_name(convoyed_unit.province)}",
                        f"Fleet in {p_name(unit.province)} is ordered to convoy A {p_name(convoyed_unit.province)} → {p_name(order.target)}, "
                        f"but A {p_name(convoyed_unit.province)} is not ordered to move to {p_name(order.target)}.",
                        [unit.id, convoyed_unit.id],
                        [unit.province, convoyed_unit.province, order.target],
                        unit.power,
                    )

    # 2. Check Friendly Self-Bounces & Friendly Occupied Bounces per Great Power
    move_support_counts: Dict[str, int] = defaultdict(int)
    for u in units:
        if u.is_dislodged:
            continue
        o = orders.get(u.id)
        if o and o.order_type == OrderType.SUPPORT and o.aux_unit_origin and o.target and o.aux_unit_origin != o.target:
            sup_unit = unit_by_prov.get(o.aux_unit_origin)
            if sup_unit:
                sup_order = orders.get(sup_unit.id)
                if sup_order and sup_order.order_type == OrderType.MOVE and sup_order.target == o.target:
                    can_s, _ = can_unit_support_province(u.unit_type, u.province, u.coast, o.target)
                    if can_s:
                        move_support_counts[sup_unit.id] += 1

    moves_by_power_and_target: Dict[Power, Dict[str, List[Unit]]] = defaultdict(lambda: defaultdict(list))
    for u in units:
        if u.is_dislodged:
            continue
        o = orders.get(u.id)
        if o and o.order_type == OrderType.MOVE and o.target and o.target != u.province:
            moves_by_power_and_target[u.power][o.target].append(u)

    for power, target_map in moves_by_power_and_target.items():
        for dest, moving_units in target_map.items():
            if len(moving_units) > 1:
                strengths = sorted(
                    [(1 + move_support_counts[mu.id], mu) for mu in moving_units],
                    key=lambda x: x[0],
                    reverse=True,
                )
                unit_names = ", ".join(f"{mu.unit_type.value} {p_name(mu.province)}" for mu in moving_units)
                if strengths[0][0] == strengths[1][0]:
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.SELF_BOUNCE,
                        f"Self-Bounce in {p_name(dest)}",
                        f"Multiple friendly units ({unit_names}) are ordered to move into {p_name(dest)} with equal strength ({strengths[0][0]}). "
                        f"They will bounce each other and both stay in place!",
                        [mu.id for mu in moving_units],
                        [dest] + [mu.province for mu in moving_units],
                        power,
                    )
                else:
                    add_issue(
                        IssueSeverity.WARNING,
                        IssueCode.SELF_BOUNCE,
                        f"Friendly Collision in {p_name(dest)}",
                        f"Multiple friendly units ({unit_names}) are ordered to {p_name(dest)}. "
                        f"Even with support on {strengths[0][1].unit_type.value} {p_name(strengths[0][1].province)}, the other friendly unit(s) will bounce.",
                        [mu.id for mu in moving_units],
                        [dest] + [mu.province for mu in moving_units],
                        power,
                    )

            occupant = unit_by_prov.get(dest)
            if occupant and occupant.power == power:
                occ_order = orders.get(occupant.id)
                for mover in moving_units:
                    if not occ_order or occ_order.order_type != OrderType.MOVE:
                        add_issue(
                            IssueSeverity.WARNING,
                            IssueCode.SELF_OCCUPIED_BOUNCE,
                            f"Blocked by Friendly Unit in {p_name(dest)}",
                            f"{mover.unit_type.value} {p_name(mover.province)} is ordered to {p_name(dest)}, "
                            f"which is occupied by your own {occupant.unit_type.value} {p_name(occupant.province)} ({occ_order.order_type.value if occ_order else 'HOLD'}). "
                            f"You cannot dislodge your own unit, so {p_name(mover.province)} will bounce!",
                            [mover.id, occupant.id],
                            [mover.province, dest],
                            power,
                        )
                    elif occ_order.target == mover.province and not occ_order.via_convoy and not orders[mover.id].via_convoy:
                        if mover.id < occupant.id:
                            add_issue(
                                IssueSeverity.WARNING,
                                IssueCode.SELF_BOUNCE,
                                f"Illegal Direct Swap ({p_name(mover.province)} ↔ {p_name(dest)})",
                                f"{mover.unit_type.value} {p_name(mover.province)} and {occupant.unit_type.value} {p_name(dest)} "
                                f"are ordered to trade places directly without a convoy. In Diplomacy, units cannot swap places directly and both will bounce!",
                                [mover.id, occupant.id],
                                [mover.province, dest],
                                power,
                            )

    return issues
