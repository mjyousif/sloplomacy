"""Winter adjustments: builds, disbands and waivers, including civil disorder disbands."""

from collections import defaultdict

import diplomacy
from domain.board import Power, Unit, UnitType
from domain.orders import Order, OrderResolution, OrderType
from engine.adjudicator.context import ResolutionContext
from engine.adjudicator.translator import order_to_diplomacy_str


def build_adjustment_orders(
    game: diplomacy.Game,
    units: list[Unit],
    orders: dict[str, Order],
    units_by_prov: dict[str, Unit],
    unit_by_id: dict[str, Unit],
) -> dict[str, list[str]]:
    power_orders: dict[str, list[str]] = {}
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
                    ord_obj.power.value if hasattr(ord_obj.power, "value") else str(ord_obj.power)
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
    return power_orders


def resolve_adjustments(ctx: ResolutionContext) -> None:
    units, orders = ctx.units, ctx.orders
    engine_regular_by_pwr = ctx.engine_regular_by_pwr
    resolutions, summary = ctx.resolutions, ctx.summary
    new_units, used_unit_ids = ctx.new_units, ctx.used_unit_ids
    p_name_fn = ctx.province_name

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
