"""Admin overrides on the board itself: moving, spawning and removing units, setting ownership."""

from api.admin_utils import (
    compute_board_edit_summary,
    record_admin_history_and_log,
    resolve_admin_actor,
)
from domain.board import Power, ProvinceType, Unit, UnitType
from domain.game_state import GameState
from domain.orders import Order, OrderType
from domain.requests import (
    AdminBatchBoardEditRequest,
    AdminDestroyUnitRequest,
    AdminMoveUnitRequest,
    AdminSetOwnershipRequest,
    AdminSpawnUnitRequest,
)
from engine.order_utils import (
    fleet_coast,
    refresh_diagnostics_and_simulation,
)
from engine.topology.provinces import PROVINCES
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import verify_admin_access
from storage.store import (
    DEFAULT_GAME_ID,
    resolve_game,
)

router = APIRouter(tags=["Administrator & Creator Controls"])


def _validate_and_normalize_unit(
    unit_type: UnitType, province: str, coast: str | None
) -> tuple[str, str | None]:
    """Validate unit placement against province terrain and return (prov_id, normalized_coast)."""
    prov_id = province.upper()
    prov_info = PROVINCES.get(prov_id)
    if not prov_info:
        raise HTTPException(status_code=400, detail=f"Province '{province}' does not exist.")
    if prov_info.type == ProvinceType.IMPASSABLE:
        raise HTTPException(
            status_code=400, detail=f"Cannot place units in impassable province {prov_info.name}."
        )
    if unit_type == UnitType.ARMY and prov_info.type == ProvinceType.SEA:
        raise HTTPException(
            status_code=400, detail=f"Armies cannot be placed in sea province {prov_info.name}."
        )
    if unit_type == UnitType.FLEET and prov_info.type == ProvinceType.LAND:
        raise HTTPException(
            status_code=400, detail=f"Fleets cannot be placed in inland province {prov_info.name}."
        )
    return prov_id, fleet_coast(unit_type, prov_info, coast)


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

    prov_id, coast = _validate_and_normalize_unit(
        target_unit.unit_type, req.new_province, req.new_coast
    )

    before_state = game.model_copy(deep=True)
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

    summary_line = (
        f"[ADMIN OVERRIDE] Relocated {target_unit.power.value} {target_unit.unit_type.value} "
        f"from {old_prov} to {prov_id}."
    )
    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid, before_state, game, [summary_line], actor=actor_email, actor_id=actor_id
    )
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

    prov_id, coast = _validate_and_normalize_unit(req.unit_type, req.province, req.coast)

    before_state = game.model_copy(deep=True)
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

    summary_line = f"[ADMIN OVERRIDE] Spawned {req.power.value} {req.unit_type.value} at {prov_id}."
    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid, before_state, game, [summary_line], actor=actor_email, actor_id=actor_id
    )
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

    before_state = game.model_copy(deep=True)
    game.units = [u for u in game.units if u.id != req.unit_id]
    game.orders.pop(req.unit_id, None)

    summary_line = (
        f"[ADMIN OVERRIDE] Destroyed {target_unit.power.value} {target_unit.unit_type.value} "
        f"in {target_unit.province}."
    )
    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid, before_state, game, [summary_line], actor=actor_email, actor_id=actor_id
    )
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
    if PROVINCES[prov_id].type in (ProvinceType.SEA, ProvinceType.IMPASSABLE):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot set ownership for {PROVINCES[prov_id].name}.",
        )

    before_state = game.model_copy(deep=True)
    if req.power is not None:
        game.ownership[prov_id] = req.power
        summary_line = f"[ADMIN OVERRIDE] Set ownership of {prov_id} to {req.power.value}."
    else:
        game.ownership.pop(prov_id, None)
        summary_line = f"[ADMIN OVERRIDE] Reset ownership of {prov_id} to Neutral."

    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid, before_state, game, [summary_line], actor=actor_email, actor_id=actor_id
    )
    return game


@router.post(
    "/api/admin/board-edit",
    response_model=GameState,
    summary="Batch Direct-Edit Commit",
    description="Atomically commit staged Direct-Edit board changes (units, ownership, orders) with optimistic concurrency check.",
)
async def admin_batch_board_edit(
    req: AdminBatchBoardEditRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Atomically apply staged Direct-Edit mutations with optimistic concurrency checking."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    if (
        req.expected_revision != game.state_revision
        or req.expected_season != game.season
        or req.expected_year != game.year
        or req.expected_phase != game.phase
    ):
        raise HTTPException(
            status_code=409,
            detail="Board state changed while editing. Please review the latest board state before applying changes.",
        )

    # Validate ownership entries
    validated_ownership: dict[str, Power] = {}
    for raw_prov, pwr in req.ownership.items():
        prov_id = raw_prov.upper()
        if prov_id not in PROVINCES:
            raise HTTPException(status_code=400, detail=f"Province '{raw_prov}' does not exist.")
        if PROVINCES[prov_id].type in (ProvinceType.SEA, ProvinceType.IMPASSABLE):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot set ownership for {PROVINCES[prov_id].name}.",
            )
        validated_ownership[prov_id] = pwr

    # Validate and normalize units (deduplicate by province for non-dislodged units, last wins)
    units_by_prov: dict[str, Unit] = {}
    dislodged_units: list[Unit] = []
    for u in req.units:
        prov_id, coast = _validate_and_normalize_unit(u.unit_type, u.province, u.coast)
        normalized = Unit(
            id=u.id,
            power=u.power,
            unit_type=u.unit_type,
            province=prov_id,
            coast=coast,
            is_dislodged=u.is_dislodged,
        )
        if normalized.is_dislodged:
            dislodged_units.append(normalized)
        else:
            units_by_prov[prov_id] = normalized

    validated_units = list(units_by_prov.values()) + dislodged_units

    before_state = game.model_copy(deep=True)
    before_by_id = {u.id: u for u in before_state.units}

    # Reconcile orders for the updated unit roster
    new_orders: dict[str, Order] = {}
    for u in validated_units:
        req_order = req.orders.get(u.id) if req.orders else None
        if req_order and req_order.origin.upper() == u.province:
            new_orders[u.id] = req_order.model_copy(
                update={
                    "unit_id": u.id,
                    "power": u.power,
                    "unit_type": u.unit_type,
                    "origin": u.province,
                    "origin_coast": u.coast,
                }
            )
            continue

        prev_unit = before_by_id.get(u.id)
        prev_order = before_state.orders.get(u.id)
        if (
            prev_unit
            and prev_order
            and prev_unit.province == u.province
            and prev_unit.coast == u.coast
            and prev_unit.power == u.power
            and prev_unit.unit_type == u.unit_type
        ):
            new_orders[u.id] = prev_order
        else:
            new_orders[u.id] = Order(
                unit_id=u.id,
                power=u.power,
                unit_type=u.unit_type,
                origin=u.province,
                origin_coast=u.coast,
                order_type=OrderType.DISBAND if u.is_dislodged else OrderType.HOLD,
                is_explicit=False,
            )

    if req.orders:
        for k, o in req.orders.items():
            if k.startswith("BUILD_") and k not in new_orders:
                new_orders[k] = o

    computed_lines = compute_board_edit_summary(
        before_state, validated_units, validated_ownership, new_orders
    )
    if req.summary_lines:
        summary_lines = [
            line if line.startswith("[ADMIN OVERRIDE]") else f"[ADMIN OVERRIDE] {line}"
            for line in req.summary_lines
            if line.strip()
        ]
    else:
        summary_lines = computed_lines

    game.units = validated_units
    game.ownership = validated_ownership
    game.orders = new_orders
    for line in reversed(summary_lines):
        game.turn_history.insert(0, line)

    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid, before_state, game, summary_lines, actor=actor_email, actor_id=actor_id
    )
    return game
