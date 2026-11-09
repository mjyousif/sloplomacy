"""Retreat phases: the engine orders to submit, and reading back where each unit went."""

from domain.models import Order, OrderResolution, OrderType, Unit
from engine.adjudicator.context import ResolutionContext
from engine.adjudicator.translator import order_to_diplomacy_str


def build_retreat_orders(
    units: list[Unit], orders: dict[str, Order], units_by_prov: dict[str, Unit]
) -> dict[str, list[str]]:
    power_orders: dict[str, list[str]] = {}
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
    return power_orders


def resolve_retreats(ctx: ResolutionContext) -> None:
    units, orders = ctx.units, ctx.orders
    results_for_phase = ctx.results_for_phase
    engine_regular_by_pwr = ctx.engine_regular_by_pwr
    resolutions, summary = ctx.resolutions, ctx.summary
    new_units, used_unit_ids = ctx.new_units, ctx.used_unit_ids
    p_name_fn = ctx.province_name

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
