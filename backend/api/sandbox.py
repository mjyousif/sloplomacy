"""FastAPI router for sandbox (war room) mode and scenario loading."""

import uuid

from domain.board import Power
from domain.game_state import GameState
from domain.requests import ScenarioRequest, SetPowerRequest
from engine.order_utils import (
    refresh_diagnostics_and_simulation,
    reset_foreign_orders,
)
from engine.turn_service import publish_game_state
from fastapi import APIRouter, Depends, HTTPException, Query
from scenarios.presets import SCENARIO_IDS, build_scenario
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    caller_holds_seat,
    reject_on_multiplayer_match,
    require_own_seat,
    sanitize_admin_log,
    sanitize_game_state_for_viewer,
    verify_admin_access,
    viewer_ack_ids,
    viewer_power_for,
    with_sanitized_admin_log,
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
    resolve_game,
)

router = APIRouter(tags=["Sandbox"])


def open_private_sandbox(
    match: GameState,
    power: Power,
    current_user: AuthUser | None = None,
) -> GameState:
    """Give a multiplayer seat a private ephemeral sandbox branch for the current turn."""
    match_turn = (match.season, match.year, match.phase)
    for sandbox_id, owner in list(PRIVATE_SANDBOXES.items()):
        if owner == (match.game_id, power):
            existing = GAMES.get(sandbox_id)
            if existing and PRIVATE_SANDBOX_TURNS.get(sandbox_id) == match_turn:
                refresh_diagnostics_and_simulation(existing)
                return with_sanitized_admin_log(existing, current_user)
            evict_game(sandbox_id)

    sandbox_id = f"sbx_{uuid.uuid4().hex[:8]}"
    sandbox = match.model_copy(deep=True)
    sandbox.admin_log = sanitize_admin_log(match, viewer_ack_ids(current_user))
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
        return open_private_sandbox(game, req.power, current_user)

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
        branch_state.board_revision = max(branch_state.board_revision, game.board_revision) + 1
        GAMES[gid] = branch_state
        GAME_HISTORY[gid] = [snap.model_copy(deep=True) for snap in branch[2]]
        game = branch_state
    else:
        SANDBOX_BRANCHES.pop(gid, None)
        game.active_power = req.power
    await publish_game_state(game, persist=False)
    return with_sanitized_admin_log(game, current_user)


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
        restored.board_revision = max(restored.board_revision, game.board_revision) + 1
        GAMES[gid] = restored
        game = restored
        SANDBOX_CHECKPOINTS[gid] = None
        # Turns stepped in the sandbox were hypothetical, so they leave the history with it.
        GAME_HISTORY[gid] = SANDBOX_HISTORY_CHECKPOINTS.pop(gid, GAME_HISTORY.get(gid, []))
        HISTORY_UNSAVED.add(gid)
    else:
        reset_foreign_orders(game, req.power)

    await publish_game_state(game, lobby=True)
    return with_sanitized_admin_log(game, current_user)


@router.post(
    "/api/sandbox/clear-foreign",
    response_model=GameState,
    summary="Clear Foreign Pre-Moves",
    description="Reset all hypothetical orders in sandbox mode for powers other than req.power back to default HOLD.",
)
async def clear_foreign_pre_moves(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    reject_on_multiplayer_match(game.game_id)
    reset_foreign_orders(game, req.power)
    await publish_game_state(game)
    return with_sanitized_admin_log(game, current_user)


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
    new_game.board_revision = current.board_revision + 1
    GAMES[gid] = new_game
    await publish_game_state(GAMES[gid], refresh=False, lobby=True)
    return GAMES[gid]
