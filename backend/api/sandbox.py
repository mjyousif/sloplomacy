"""FastAPI router for sandbox (war room) mode, scenario loading, and AI tactical planning."""

import uuid

from api.turns import execute_adjudication
from domain.board import Power
from domain.game_state import GameState
from domain.orders import OrderType
from domain.requests import GenerateAIOrdersRequest, ScenarioRequest, SetPowerRequest
from engine.ai import generate_tactical_orders
from engine.order_utils import (
    refresh_diagnostics_and_simulation,
    reset_foreign_orders,
)
from fastapi import APIRouter, Depends, HTTPException, Query
from scenarios.presets import SCENARIO_IDS, build_scenario
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    caller_holds_seat,
    reject_on_multiplayer_match,
    require_own_seat,
    sanitize_game_state_for_viewer,
    verify_admin_access,
    viewer_power_for,
)
from storage.store import (
    GAME_HISTORY,
    GAME_SUMMARIES,
    GAMES,
    HISTORY_UNSAVED,
    PRIVATE_SANDBOX_TURNS,
    PRIVATE_SANDBOXES,
    SANDBOX_BRANCHES,
    SANDBOX_CHECKPOINTS,
    SANDBOX_HISTORY_CHECKPOINTS,
    check_game_capacity,
    clear_ephemeral_sandboxes_for,
    evict_game,
    is_multiplayer_match,
    persist_game,
    resolve_game,
    sync_summary,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

router = APIRouter(tags=["Sandbox & AI Planning"])


def open_private_sandbox(match: GameState, power: Power) -> GameState:
    """Give a multiplayer seat a private ephemeral sandbox branch for the current turn."""
    match_turn = (match.season, match.year, match.phase)
    for sandbox_id, owner in list(PRIVATE_SANDBOXES.items()):
        if owner == (match.game_id, power):
            existing = GAMES.get(sandbox_id)
            if existing and PRIVATE_SANDBOX_TURNS.get(sandbox_id) == match_turn:
                refresh_diagnostics_and_simulation(existing)
                return existing
            evict_game(sandbox_id)

    sandbox_id = f"sbx_{uuid.uuid4().hex[:8]}"
    sandbox = match.model_copy(deep=True)
    sandbox.game_id = sandbox_id
    sandbox.active_power = power
    sandbox.timer = None  # The match keeps the real clock, and a copy must never run out
    reset_foreign_orders(sandbox, power)
    GAMES[sandbox_id] = sandbox
    GAME_HISTORY[sandbox_id] = []
    SANDBOX_CHECKPOINTS[sandbox_id] = None
    PRIVATE_SANDBOXES[sandbox_id] = (match.game_id, power)
    PRIVATE_SANDBOX_TURNS[sandbox_id] = match_turn
    refresh_diagnostics_and_simulation(sandbox)
    return sandbox


async def close_private_sandbox(sandbox: GameState) -> GameState:
    """Return the real match without mutating it; keep same-turn branch for resume."""
    match_id, _power = PRIVATE_SANDBOXES[sandbox.game_id]
    match = await resolve_game(match_id)
    if PRIVATE_SANDBOX_TURNS.get(sandbox.game_id) != (
        match.season,
        match.year,
        match.phase,
    ):
        evict_game(sandbox.game_id)
    return match


@router.post(
    "/api/sandbox/enter",
    response_model=GameState,
    summary="Enter Sandbox Mode",
    description="Activate Sandbox Mode: creates or resumes an isolated private hypothetical branch for multiplayer matches, or checkpoints a solo game.",
)
async def enter_sandbox_mode(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    check_game_capacity()
    game = await resolve_game(game_id)
    gid = game.game_id
    if is_multiplayer_match(gid):
        require_own_seat(gid, req.power, current_user)
        return open_private_sandbox(game, req.power)

    origin_turn = (game.season, game.year, game.phase)
    SANDBOX_CHECKPOINTS[gid] = game.model_copy(deep=True)
    SANDBOX_HISTORY_CHECKPOINTS[gid] = [
        snap.model_copy(deep=True) for snap in GAME_HISTORY.get(gid, [])
    ]
    branch = SANDBOX_BRANCHES.get(gid)
    if branch is not None and branch[0] == origin_turn:
        branch_state = branch[1].model_copy(deep=True)
        branch_state.active_power = req.power
        branch_state.state_revision = max(branch_state.state_revision, game.state_revision) + 1
        GAMES[gid] = branch_state
        GAME_HISTORY[gid] = [snap.model_copy(deep=True) for snap in branch[2]]
        game = branch_state
    else:
        SANDBOX_BRANCHES.pop(gid, None)
        game.active_power = req.power
    refresh_diagnostics_and_simulation(game)
    await broadcast_game_update(gid, game)
    return game


@router.post(
    "/api/sandbox/exit",
    response_model=GameState,
    summary="Exit Sandbox Mode",
    description="Exit Hypothetical Mode and restore the real board state and moves (hypothetical changes stay only in the ephemeral branch for this turn).",
)
async def exit_sandbox_mode(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    gid = game.game_id
    if gid in PRIVATE_SANDBOXES:
        match_id, power = PRIVATE_SANDBOXES[gid]
        summary = GAME_SUMMARIES.get(match_id)
        if caller_holds_seat(summary, power, current_user):
            match = await close_private_sandbox(game)
            return sanitize_game_state_for_viewer(match, power)
        if not summary or power.value not in summary.participants:
            evict_game(gid)
        match = await resolve_game(match_id)
        return sanitize_game_state_for_viewer(match, viewer_power_for(match_id, current_user))
    reject_on_multiplayer_match(gid)

    checkpoint = SANDBOX_CHECKPOINTS.get(gid)
    if checkpoint is not None:
        origin_turn = (checkpoint.season, checkpoint.year, checkpoint.phase)
        SANDBOX_BRANCHES[gid] = (
            origin_turn,
            game.model_copy(deep=True),
            [snap.model_copy(deep=True) for snap in GAME_HISTORY.get(gid, [])],
        )
        restored = checkpoint.model_copy(deep=True)
        restored.active_power = req.power
        restored.state_revision = max(restored.state_revision, game.state_revision) + 1
        GAMES[gid] = restored
        game = restored
        SANDBOX_CHECKPOINTS[gid] = None
        # Turns stepped in the sandbox were hypothetical, so they leave the history with it.
        GAME_HISTORY[gid] = SANDBOX_HISTORY_CHECKPOINTS.pop(gid, GAME_HISTORY.get(gid, []))
        HISTORY_UNSAVED.add(gid)
    else:
        reset_foreign_orders(game, req.power)

    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@router.post(
    "/api/sandbox/clear-foreign",
    response_model=GameState,
    summary="Clear Foreign Pre-Moves",
    description="Reset all hypothetical orders in sandbox mode for powers other than req.power back to default HOLD.",
)
async def clear_foreign_pre_moves(req: SetPowerRequest, game_id: str | None = Query(default=None)):
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    reset_foreign_orders(game, req.power)
    refresh_diagnostics_and_simulation(game)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


@router.post(
    "/api/sandbox/ai-orders",
    response_model=GameState,
    summary="Generate AI Orders",
    description="Generate DATC-compliant heuristic tactical orders for specified Great Powers or foreign powers in sandbox mode.",
)
async def generate_sandbox_ai_orders(
    req: GenerateAIOrdersRequest | None = None,
    game_id: str | None = Query(default=None),
):
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    if req and req.powers:
        target_powers = req.powers
    elif req and req.include_active:
        target_powers = list(Power)
    else:
        target_powers = [p for p in Power if p != game.active_power]

    ai_orders = generate_tactical_orders(
        units=game.units,
        ownership=game.ownership,
        season=game.season,
        year=game.year,
        phase=game.phase,
        target_powers=target_powers,
        retreats=game.retreats,
        builds=game.builds,
    )
    for ord_id, ord_obj in ai_orders.items():
        game.orders[ord_id] = ord_obj

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


@router.post(
    "/api/sandbox/ai-step",
    response_model=GameState,
    summary="Step Turn With AI",
    description="Auto-plan unassigned foreign powers with tactical AI and advance to next phase in sandbox mode.",
)
async def step_turn_with_ai(game_id: str | None = Query(default=None)):
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    powers_needing_orders = [
        p
        for p in Power
        if p != game.active_power
        or not any(
            o.power == p
            and o.is_explicit
            and (game.phase == "Movement" or o.order_type != OrderType.HOLD)
            for o in game.orders.values()
        )
    ]
    ai_orders = generate_tactical_orders(
        units=game.units,
        ownership=game.ownership,
        season=game.season,
        year=game.year,
        phase=game.phase,
        target_powers=powers_needing_orders,
        retreats=game.retreats,
        builds=game.builds,
    )
    for ord_id, ord_obj in ai_orders.items():
        game.orders[ord_id] = ord_obj

    return await execute_adjudication(game)


@router.post(
    "/api/scenario",
    response_model=GameState,
    tags=["Match & Tactical Operations"],
    summary="Load Tactical Scenario",
    description="Reset board state and load a predefined tactical scenario (creator only on live matches).",
)
async def load_scenario(
    req: ScenarioRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    if req.scenario_id not in SCENARIO_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{req.scenario_id}'.")
    current = await resolve_game(game_id)
    gid = current.game_id
    verify_admin_access(gid, current_user)
    clear_ephemeral_sandboxes_for(gid)
    GAME_HISTORY[gid] = []
    HISTORY_UNSAVED.add(gid)
    power = req.active_power or current.active_power
    new_game = build_scenario(req.scenario_id, power, gid)
    new_game.state_revision = current.state_revision + 1
    GAMES[gid] = new_game
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, GAMES[gid])
    await broadcast_lobby_update()
    return GAMES[gid]
