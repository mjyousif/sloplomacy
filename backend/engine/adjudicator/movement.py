"""Movement phases: the engine orders to submit, and reading back what happened."""

from collections import defaultdict

from domain.board import Unit, UnitType
from domain.orders import Order, OrderResolution, OrderType
from engine.adjudicator.context import ResolutionContext
from engine.adjudicator.translator import order_to_diplomacy_str
from engine.topology.provinces import PROVINCES


def build_movement_orders(
    units: list[Unit], orders: dict[str, Order], units_by_prov: dict[str, Unit]
) -> dict[str, list[str]]:
    power_orders: dict[str, list[str]] = {}
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
    return power_orders


# The engine's result codes for an order that failed, by code and by name.
_FAILURES = {
    10001: "no convoy",
    10002: "bounce",
    10003: "void",
    10004: "cut",
    10005: "dislodged",
    10006: "disrupted",
}


def _failures(ctx: ResolutionContext, u: Unit) -> set[str]:
    u_loc = f"{u.province}/{u.coast}" if u.coast else u.province
    res_list = ctx.results_for_phase.get(f"{u.unit_type.value} {u_loc}", [])
    return {
        name
        for code, name in _FAILURES.items()
        if any(r.code == code or name in str(r).lower() for r in res_list)
    }


def _arrivals(ctx: ResolutionContext) -> dict[str, str]:
    """Target to origin of every move that succeeds. The one into a dislodged unit's province
    is its attacker, and a retreat may never go back there."""
    arrivals: dict[str, str] = {}
    for u in ctx.units:
        ord_obj = ctx.orders.get(u.id)
        if (
            not u.is_dislodged
            and ord_obj
            and ord_obj.order_type == OrderType.MOVE
            and ord_obj.target
            and ctx.engine_kept_order(u)
            and not _failures(ctx, u)
        ):
            arrivals[ord_obj.target] = u.province
    return arrivals


def _void_reason(ctx: ResolutionContext, order: Order) -> str:
    """Why a support or convoy matched nothing: the other unit did something else."""
    other = ctx.province_name(order.aux_unit_origin)
    destination = ctx.province_name(order.target)
    if order.order_type == OrderType.CONVOY:
        return f"Convoy void: the army in {other} did not move to {destination}."
    if order.aux_unit_origin == order.target:
        return f"Support void: {other} did not hold."
    return f"Support void: {other} did not move to {destination}."


def resolve_movement(ctx: ResolutionContext) -> None:
    units, orders = ctx.units, ctx.orders
    engine_regular_by_pwr = ctx.engine_regular_by_pwr
    engine_dislodged_by_pwr = ctx.engine_dislodged_by_pwr
    resolutions, summary = ctx.resolutions, ctx.summary
    new_units, used_unit_ids = ctx.new_units, ctx.used_unit_ids
    engine_kept_order = ctx.engine_kept_order
    p_name_fn = ctx.province_name

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
            if not _failures(ctx, u) & {"cut", "dislodged", "void"}:
                if ord_obj.aux_unit_origin == ord_obj.target:
                    uncut_supports_for_hold[ord_obj.target] += 1
                else:
                    uncut_supports_for_move[(ord_obj.aux_unit_origin, ord_obj.target)] += 1

    arrivals = _arrivals(ctx)

    for u in units:
        if u.is_dislodged:
            continue
        ord_obj = orders.get(u.id)
        failures = _failures(ctx, u)

        no_convoy = "no convoy" in failures
        bounced = "bounce" in failures
        cut = "cut" in failures
        dislodged = "dislodged" in failures
        voided = "void" in failures
        disrupted = "disrupted" in failures
        dislodged_by = arrivals.get(u.province) if dislodged else None
        attacked_from = f" by the attack from {p_name_fn(dislodged_by)}" if dislodged_by else ""

        attack_strength = 1
        defense_strength = 1

        otype = ord_obj.order_type if ord_obj else OrderType.HOLD
        target = ord_obj.target if ord_obj else None

        rejected = otype != OrderType.HOLD and not engine_kept_order(u)
        succeeded = not (failures or rejected)

        if rejected:
            defense_strength = 1 + uncut_supports_for_hold.get(u.province, 0)
            reason = f"Illegal {otype.value} order rejected; unit held in {p_name_fn(u.province)}."
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
                if dislodged:
                    reason += f" Dislodged{attacked_from}!"
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} was dislodged!"
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
            if voided:
                reason = _void_reason(ctx, ord_obj)
                if dislodged:
                    reason += f" Dislodged{attacked_from}."
                    summary.append(
                        f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} dislodged."
                    )
            elif dislodged:
                reason = f"Dislodged{attacked_from}! Support broken."
                summary.append(
                    f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} dislodged."
                )
            elif cut:
                reason = "Support cut by enemy attack!"
                summary.append(
                    f"[{u.power.value}] {u.unit_type.value} {p_name_fn(u.province)} support cut."
                )
            else:
                reason = "Support held unbroken."
        elif otype == OrderType.CONVOY:
            if voided:
                reason = _void_reason(ctx, ord_obj)
                if dislodged:
                    reason += f" Dislodged{attacked_from}."
                    summary.append(f"[{u.power.value}] Fleet {p_name_fn(u.province)} dislodged.")
            elif disrupted or dislodged:
                reason = "Convoy disrupted by fleet dislodgement."
                summary.append(f"[{u.power.value}] Fleet {p_name_fn(u.province)} convoy disrupted.")
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
            dislodged_by=dislodged_by,
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
