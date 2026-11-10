"""Movement phase, per unit: is each order legal, and is it a likely blunder."""

from domain.board import ProvinceType, Unit, UnitType
from domain.issues import IssueCode, IssueSeverity
from domain.orders import Order, OrderType
from engine.topology.graph import (
    can_army_be_convoyed_theoretically,
    can_unit_move_directly,
    can_unit_support_province,
    split_province_code,
)
from engine.topology.provinces import PROVINCES
from engine.validator.convoys import has_active_convoy_chain, has_potential_convoy_chain
from engine.validator.issues import IssueCollector, province_name


def check_unit_orders(
    units: list[Unit],
    orders: dict[str, Order],
    unit_by_prov: dict[str, Unit],
    include_unassigned_warnings: bool,
    collector: IssueCollector,
) -> None:
    add_issue = collector.add
    p_name = province_name

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
                if unit.unit_type == UnitType.ARMY and can_army_be_convoyed_theoretically(
                    unit.province, order.target
                ):
                    if not has_active_convoy_chain(
                        unit.province, order.target, units, orders, power=unit.power
                    ):
                        if has_potential_convoy_chain(
                            unit.province, order.target, units, orders, army_power=unit.power
                        ):
                            add_issue(
                                IssueSeverity.INFO,
                                IssueCode.BROKEN_CONVOY,
                                f"Foreign Convoy Required to {p_name(order.target)}",
                                f"Army in {p_name(unit.province)} is ordered to {p_name(order.target)} across water. "
                                f"This move requires convoy orders from foreign fleet(s) to succeed.",
                                [unit.id],
                                [unit.province, order.target],
                                unit.power,
                            )
                        else:
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

            if supported_unit.power != unit.power:
                target_desc = (
                    "holding in place"
                    if order.aux_unit_origin == order.target
                    else f"moving to {p_name(order.target)}"
                )
                add_issue(
                    IssueSeverity.INFO,
                    IssueCode.UNMATCHED_SUPPORT,
                    f"Foreign Support for {supported_unit.power.value.capitalize()} in {p_name(supported_unit.province)}",
                    f"{unit.unit_type.value} {p_name(unit.province)} is supporting foreign {supported_unit.power.value.capitalize()} {supported_unit.unit_type.value} in {p_name(supported_unit.province)} {target_desc}. "
                    f"This support will only take effect if {supported_unit.power.value.capitalize()} orders it.",
                    [unit.id, supported_unit.id],
                    [unit.province, supported_unit.province, order.target],
                    unit.power,
                )
            else:
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
            if (
                unit.unit_type != UnitType.FLEET
                or PROVINCES[unit.province].type != ProvinceType.SEA
            ):
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
            elif convoyed_unit.power != unit.power:
                add_issue(
                    IssueSeverity.INFO,
                    IssueCode.BROKEN_CONVOY,
                    f"Foreign Convoy for {convoyed_unit.power.value.capitalize()} in {p_name(convoyed_unit.province)}",
                    f"Fleet in {p_name(unit.province)} is ordered to convoy foreign {convoyed_unit.power.value.capitalize()} Army in {p_name(convoyed_unit.province)} → {p_name(order.target)}. "
                    f"This convoy will only take effect if {convoyed_unit.power.value.capitalize()} orders the Army to move to {p_name(order.target)}.",
                    [unit.id, convoyed_unit.id],
                    [unit.province, convoyed_unit.province, order.target],
                    unit.power,
                )
            else:
                conv_order = orders.get(convoyed_unit.id)
                if (
                    not conv_order
                    or conv_order.order_type != OrderType.MOVE
                    or conv_order.target != order.target
                ):
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
