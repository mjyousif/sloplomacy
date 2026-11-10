"""Movement phase, across units: self-bounces, bounces off your own units and direct swaps."""

from collections import defaultdict

from domain.board import Power, Unit
from domain.issues import IssueCode, IssueSeverity
from domain.orders import Order, OrderType
from engine.topology.graph import can_unit_support_province
from engine.validator.issues import IssueCollector, province_name


def check_friendly_bounces(
    units: list[Unit],
    orders: dict[str, Order],
    unit_by_prov: dict[str, Unit],
    collector: IssueCollector,
) -> None:
    add_issue = collector.add
    p_name = province_name

    move_support_counts: dict[str, int] = defaultdict(int)
    for u in units:
        if u.is_dislodged:
            continue
        o = orders.get(u.id)
        if (
            o
            and o.order_type == OrderType.SUPPORT
            and o.aux_unit_origin
            and o.target
            and o.aux_unit_origin != o.target
        ):
            sup_unit = unit_by_prov.get(o.aux_unit_origin)
            if sup_unit and sup_unit.power == u.power:
                sup_order = orders.get(sup_unit.id)
                if (
                    sup_order
                    and sup_order.order_type == OrderType.MOVE
                    and sup_order.target == o.target
                ):
                    can_s, _ = can_unit_support_province(u.unit_type, u.province, u.coast, o.target)
                    if can_s:
                        move_support_counts[sup_unit.id] += 1

    moves_by_power_and_target: dict[Power, dict[str, list[Unit]]] = defaultdict(
        lambda: defaultdict(list)
    )
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
                unit_names = ", ".join(
                    f"{mu.unit_type.value} {p_name(mu.province)}" for mu in moving_units
                )
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
                    elif (
                        occ_order.target == mover.province
                        and not occ_order.via_convoy
                        and not orders[mover.id].via_convoy
                    ):
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
