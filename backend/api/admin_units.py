"""Admin overrides on the board itself: moving, spawning and removing units, setting ownership."""

from domain.models import (
    AdminDestroyUnitRequest,
    AdminMoveUnitRequest,
    AdminSetOwnershipRequest,
    AdminSpawnUnitRequest,
    GameState,
    Order,
    OrderType,
    ProvinceType,
    Unit,
    UnitType,
)
from engine.order_utils import (
    fleet_coast,
    refresh_diagnostics_and_simulation,
)
from engine.topology import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import verify_admin_access
from storage.store import (
    DEFAULT_GAME_ID,
    persist_game,
    resolve_game,
    sync_summary,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

router = APIRouter(tags=["Administrator & Creator Controls"])


@router.post(
    "/api/admin/unit/move",
    response_model=GameState,
    summary="Teleport Unit",
    description="Arbitrarily teleport or move any military unit to any valid province on the map (creator only).",
)
async def admin_move_unit(
    req: AdminMoveUnitRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Arbitrarily teleport/move any unit to any valid province on the map (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    target_unit = next((u for u in game.units if u.id == req.unit_id), None)
    if not target_unit:
        raise HTTPException(status_code=404, detail=f"Unit '{req.unit_id}' not found.")

    prov_id = req.new_province.upper()
    prov_info = PROVINCES.get(prov_id)
    if not prov_info:
        raise HTTPException(
            status_code=400, detail=f"Province '{req.new_province}' does not exist."
        )

    if prov_info.type == ProvinceType.IMPASSABLE:
        raise HTTPException(
            status_code=400, detail=f"Cannot place units in impassable province {prov_info.name}."
        )

    if target_unit.unit_type == UnitType.ARMY and prov_info.type == ProvinceType.SEA:
        raise HTTPException(
            status_code=400, detail=f"Armies cannot be placed in sea province {prov_info.name}."
        )

    if target_unit.unit_type == UnitType.FLEET and prov_info.type == ProvinceType.LAND:
        raise HTTPException(
            status_code=400, detail=f"Fleets cannot be placed in inland province {prov_info.name}."
        )

    coast = fleet_coast(target_unit.unit_type, prov_info, req.new_coast)

    old_prov = target_unit.province
    game.units = [u for u in game.units if u.id == target_unit.id or u.province != prov_id]

    target_unit.province = prov_id
    target_unit.coast = coast

    game.orders[target_unit.id] = Order(
        unit_id=target_unit.id,
        power=target_unit.power,
        unit_type=target_unit.unit_type,
        origin=prov_id,
        origin_coast=coast,
        order_type=OrderType.HOLD,
        is_explicit=False,
    )

    game.turn_history.insert(
        0,
        f"[ADMIN OVERRIDE] Relocated {target_unit.power.value} {target_unit.unit_type.value} from {old_prov} to {prov_id}.",
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@router.post(
    "/api/admin/unit/spawn",
    response_model=GameState,
    summary="Spawn Military Unit",
    description="Arbitrarily spawn an army or fleet anywhere on the board (creator only).",
)
async def admin_spawn_unit(
    req: AdminSpawnUnitRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Arbitrarily spawn a unit anywhere on the board (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    prov_id = req.province.upper()
    prov_info = PROVINCES.get(prov_id)
    if not prov_info:
        raise HTTPException(status_code=400, detail=f"Province '{req.province}' does not exist.")

    if prov_info.type == ProvinceType.IMPASSABLE:
        raise HTTPException(
            status_code=400, detail=f"Cannot place units in impassable province {prov_info.name}."
        )

    if req.unit_type == UnitType.ARMY and prov_info.type == ProvinceType.SEA:
        raise HTTPException(
            status_code=400, detail=f"Armies cannot be placed in sea province {prov_info.name}."
        )

    if req.unit_type == UnitType.FLEET and prov_info.type == ProvinceType.LAND:
        raise HTTPException(
            status_code=400, detail=f"Fleets cannot be placed in inland province {prov_info.name}."
        )

    coast = fleet_coast(req.unit_type, prov_info, req.coast)

    game.units = [u for u in game.units if u.province != prov_id]

    base_id = f"{req.power.value[:3]}_{req.unit_type.value}_{prov_id}"
    if coast:
        base_id += f"_{coast}"
    unit_id = base_id
    existing_ids = {u.id for u in game.units}
    counter = 1
    while unit_id in existing_ids:
        unit_id = f"{base_id}_{counter}"
        counter += 1

    new_unit = Unit(
        id=unit_id,
        power=req.power,
        unit_type=req.unit_type,
        province=prov_id,
        coast=coast,
    )
    game.units.append(new_unit)
    game.orders[unit_id] = Order(
        unit_id=unit_id,
        power=req.power,
        unit_type=req.unit_type,
        origin=prov_id,
        origin_coast=coast,
        order_type=OrderType.HOLD,
        is_explicit=False,
    )

    game.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Spawned {req.power.value} {req.unit_type.value} at {prov_id}."
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@router.post(
    "/api/admin/unit/destroy",
    response_model=GameState,
    summary="Destroy Military Unit",
    description="Arbitrarily destroy or disband any unit on the board (creator only).",
)
async def admin_destroy_unit(
    req: AdminDestroyUnitRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Arbitrarily destroy/disband any unit on the board (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    target_unit = next((u for u in game.units if u.id == req.unit_id), None)
    if not target_unit:
        raise HTTPException(status_code=404, detail=f"Unit '{req.unit_id}' not found.")

    game.units = [u for u in game.units if u.id != req.unit_id]
    game.orders.pop(req.unit_id, None)

    game.turn_history.insert(
        0,
        f"[ADMIN OVERRIDE] Destroyed {target_unit.power.value} {target_unit.unit_type.value} in {target_unit.province}.",
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@router.post(
    "/api/admin/ownership",
    response_model=GameState,
    summary="Set SC Ownership",
    description="Arbitrarily reassign province/supply center ownership to any Great Power or Neutrality (creator only).",
)
async def admin_set_ownership(
    req: AdminSetOwnershipRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Arbitrarily reassign province/supply center ownership (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    prov_id = req.province.upper()
    if prov_id not in PROVINCES:
        raise HTTPException(status_code=400, detail=f"Province '{req.province}' does not exist.")
    if not PROVINCES[prov_id].is_supply_center:
        raise HTTPException(
            status_code=400, detail=f"{PROVINCES[prov_id].name} is not a supply center."
        )

    if req.power is not None:
        game.ownership[prov_id] = req.power
        game.turn_history.insert(
            0, f"[ADMIN OVERRIDE] Set ownership of {prov_id} to {req.power.value}."
        )
    else:
        game.ownership.pop(prov_id, None)
        game.turn_history.insert(0, f"[ADMIN OVERRIDE] Reset ownership of {prov_id} to Neutral.")

    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game
