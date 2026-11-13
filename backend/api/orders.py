"""FastAPI router for tactical orders and order confirmations."""

from domain.board import UnitType
from domain.game_state import GameState
from domain.orders import OrderType
from domain.requests import OrderSubmissionRequest, SetPowerRequest, SingleOrderUpdateRequest
from engine.order_utils import (
    build_slot_power,
    refresh_diagnostics_and_simulation,
    reject_stale_turn,
    validate_order_references,
)
from fastapi import APIRouter, Depends, HTTPException, Query, status
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    sanitize_game_state_for_viewer,
    verify_power_authorization,
)
from storage.store import (
    is_multiplayer_match,
    persist_game,
    resolve_game,
    sync_summary,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

router = APIRouter(tags=["Match & Tactical Operations"])


@router.post(
    "/api/order",
    response_model=GameState,
    summary="Submit Single Order",
    description="Submit or update a tactical order for a single military unit or winter adjustment slot.",
)
async def update_single_order(
    req: SingleOrderUpdateRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    reject_stale_turn(game, req.turn)
    validate_order_references(req.order)
    unit_map = {u.id: u for u in game.units}
    target_power = req.order.power
    if req.order.unit_id in unit_map:
        target_power = unit_map[req.order.unit_id].power
    elif req.order.unit_id.startswith("BUILD_"):
        slot_power = build_slot_power(req.order.unit_id)
        if slot_power is None:
            raise HTTPException(
                status_code=404, detail=f"Unit or build order {req.order.unit_id} not found."
            )
        target_power = slot_power
    verify_power_authorization(game.game_id, target_power, current_user)

    if req.order.unit_id in unit_map:
        unit = unit_map[req.order.unit_id]
        updated_order = req.order.model_copy()
        updated_order.power = unit.power
        updated_order.unit_type = unit.unit_type
        updated_order.origin = unit.province
        updated_order.origin_coast = unit.coast
        if unit.unit_type == UnitType.ARMY:
            updated_order.target_coast = None
        game.orders[unit.id] = updated_order

        # In Winter Adjustments when count < 0, cap DISBAND orders to abs(count)
        if (
            game.phase == "Adjustments"
            and updated_order.order_type == OrderType.DISBAND
            and game.builds
        ):
            b_info = game.builds.get(unit.power.value, {})
            max_disbands = abs(b_info.get("count", 0)) if b_info.get("count", 0) < 0 else 0
            if max_disbands > 0:
                other_disbands = [
                    game.orders[u.id]
                    for u in game.units
                    if u.power == unit.power
                    and u.id != unit.id
                    and u.id in game.orders
                    and game.orders[u.id].order_type == OrderType.DISBAND
                ]
                while 1 + len(other_disbands) > max_disbands:
                    to_keep = other_disbands.pop(0)
                    to_keep.order_type = OrderType.HOLD

        if unit.power in game.finalized_powers:
            game.finalized_powers.remove(unit.power)
    elif req.order.unit_id.startswith("BUILD_"):
        updated_build = req.order.model_copy()
        updated_build.power = target_power
        if updated_build.unit_type == UnitType.ARMY:
            updated_build.origin_coast = None
        game.orders[req.order.unit_id] = updated_build

        # If user selects BUILD on a home center when max build slots are already full, auto-waive an excess slot
        if (
            game.phase == "Adjustments"
            and updated_build.order_type == OrderType.BUILD
            and game.builds
        ):
            p_name = updated_build.power.value
            b_info = game.builds.get(p_name, {})
            homes = b_info.get("homes", [])
            max_builds = min(b_info.get("count", 0), len(homes))
            if max_builds > 0:
                other_builds = [
                    game.orders[f"BUILD_{p_name}_{h}"]
                    for h in homes
                    if f"BUILD_{p_name}_{h}" != req.order.unit_id
                    and f"BUILD_{p_name}_{h}" in game.orders
                    and game.orders[f"BUILD_{p_name}_{h}"].order_type == OrderType.BUILD
                ]
                other_builds.sort(key=lambda o: o.is_explicit)
                while 1 + len(other_builds) > max_builds:
                    to_waive = other_builds.pop(0)
                    to_waive.order_type = OrderType.WAIVE

        if target_power in game.finalized_powers:
            game.finalized_powers.remove(target_power)
    else:
        raise HTTPException(
            status_code=404, detail=f"Unit or build order {req.order.unit_id} not found."
        )

    if req.active_power:
        game.active_power = req.active_power

    game.state_revision += 1
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return sanitize_game_state_for_viewer(game, target_power)


@router.post(
    "/api/orders/batch",
    response_model=GameState,
    summary="Submit Batch Orders",
    description="Update multiple orders atomically (all or nothing: rejected with 400 if any order is invalid).",
)
async def update_batch_orders(
    req: OrderSubmissionRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    verify_power_authorization(game.game_id, req.power, current_user)
    unit_map = {u.id: u for u in game.units}
    for o in req.orders:
        validate_order_references(o)
        if is_multiplayer_match(game.game_id):
            owner = (
                unit_map[o.unit_id].power if o.unit_id in unit_map else build_slot_power(o.unit_id)
            )
            if owner is not None and owner != req.power:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"{o.unit_id} belongs to {owner.value}, not {req.power.value}.",
                )
    for o in req.orders:
        if o.unit_id in unit_map:
            u = unit_map[o.unit_id]
            updated = o.model_copy()
            updated.power = u.power
            updated.unit_type = u.unit_type
            updated.origin = u.province
            updated.origin_coast = u.coast
            if u.unit_type == UnitType.ARMY:
                updated.target_coast = None
            game.orders[u.id] = updated
        elif o.unit_id.startswith("BUILD_"):
            updated_b = o.model_copy()
            slot_power = build_slot_power(o.unit_id)
            if slot_power is not None:
                updated_b.power = slot_power
            if updated_b.unit_type == UnitType.ARMY:
                updated_b.origin_coast = None
            game.orders[o.unit_id] = updated_b

    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)

    game.state_revision += 1
    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()
    return sanitize_game_state_for_viewer(game, req.power)


@router.post(
    "/api/orders/confirm-all",
    response_model=GameState,
    summary="Confirm All Orders",
    description="Mark all default orders for a given Great Power as explicitly confirmed.",
)
async def confirm_all_power_orders(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    verify_power_authorization(game.game_id, req.power, current_user)
    for ord_obj in game.orders.values():
        if ord_obj.power == req.power:
            ord_obj.is_explicit = True
    game.state_revision += 1
    refresh_diagnostics_and_simulation(game)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return sanitize_game_state_for_viewer(game, req.power)
