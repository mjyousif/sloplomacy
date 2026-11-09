"""FastAPI router for creator and administrator game manipulation endpoints."""

import os
import time

from api.turns import timer_players
from domain.game_state import FIRST_YEAR, PHASES_BY_SEASON, GameState
from domain.requests import (
    AdminRollbackRequest,
    AdminSetTurnRequest,
    AdminStatusResponse,
    SeedScenarioRequest,
)
from engine.order_utils import (
    refresh_diagnostics_and_simulation,
)
from engine.phase_timer import start_phase_clock
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from scenarios.presets import SCENARIO_IDS, build_scenario
from security.auth import AuthUser, get_current_user, is_insecure_dev_auth_allowed
from security.secrecy import verify_admin_access
from storage import supabase
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_HISTORY,
    GAME_SUMMARIES,
    GAMES,
    HISTORY_UNSAVED,
    SANDBOX_CHECKPOINTS,
    cache_loaded_game,
    check_game_capacity,
    is_multiplayer_match,
    load_saved_game,
    persist_game,
    resolve_game,
    sync_summary,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

router = APIRouter(tags=["Administrator & Creator Controls"])


def is_test_seed_enabled() -> bool:
    """Permit the test seed endpoint only in local development or automated test runs."""
    return is_insecure_dev_auth_allowed() or os.getenv("ENABLE_TEST_SEED_ENDPOINT", "").lower() in (
        "1",
        "true",
    )


@router.post(
    "/api/test/seed",
    response_model=GameState,
    tags=["Developer & Testing Utilities"],
    summary="Seed Test Scenario",
    description="Seed game state deterministically for LLM-driven E2E tests and local developer verification (development only).",
)
async def seed_test_scenario(req: SeedScenarioRequest):
    """Seed game state for LLM-driven E2E tests and local developer verification."""
    if not is_test_seed_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Test seed endpoint is disabled in production. Set ENVIRONMENT=development or ENABLE_TEST_SEED_ENDPOINT=1 for local testing.",
        )
    if req.scenario_id not in SCENARIO_IDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown scenario '{req.scenario_id}'. Available: {sorted(SCENARIO_IDS)}",
        )
    gid = req.game_id or DEFAULT_GAME_ID
    if gid not in GAMES and supabase.is_persistence_enabled():
        loaded = await load_saved_game(gid)
        if loaded is not None:
            cache_loaded_game(gid, loaded)
    if is_multiplayer_match(gid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot seed over a multiplayer match.",
        )
    if gid not in GAMES:
        check_game_capacity()
    SANDBOX_CHECKPOINTS[gid] = None
    GAME_HISTORY[gid] = []
    HISTORY_UNSAVED.add(gid)
    GAMES[gid] = build_scenario(req.scenario_id, req.active_power, gid)
    sync_summary(gid)
    if gid in GAME_SUMMARIES:
        await persist_game(gid)
    await broadcast_game_update(gid, GAMES[gid])
    await broadcast_lobby_update()
    return GAMES[gid]


@router.get(
    "/api/admin/status",
    response_model=AdminStatusResponse,
    summary="Get Admin Status",
    description="Check creator/admin privileges and rollback history depth for the given game.",
)
def get_admin_status(
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Check creator/admin privileges and rollback history depth for the given game."""
    gid = game_id or DEFAULT_GAME_ID
    summary = GAME_SUMMARIES.get(gid)
    history_stack = GAME_HISTORY.get(gid, [])

    if gid == DEFAULT_GAME_ID or not summary or summary.is_sandbox:
        return AdminStatusResponse(
            is_creator=True,
            can_rollback=len(history_stack) > 0,
            history_count=len(history_stack),
            creator_email=summary.created_by if summary else "commander@diplomacy.local",
            creator_id=summary.creator_id if summary else "guest",
        )

    user_id = current_user.user_id if current_user else x_user_id
    email = current_user.email if current_user else x_user_email

    is_creator = False
    if user_id and summary.creator_id and summary.creator_id == user_id:
        is_creator = True
    elif email and summary.created_by and summary.created_by.lower() == email.lower():
        is_creator = True

    return AdminStatusResponse(
        is_creator=is_creator,
        can_rollback=len(history_stack) > 0,
        history_count=len(history_stack),
        creator_email=summary.created_by,
        creator_id=summary.creator_id,
    )


@router.post(
    "/api/admin/rollback",
    response_model=GameState,
    summary="Rollback Turn Snapshot",
    description="Roll back to the previous turn snapshot in history (creator only).",
)
async def admin_rollback_turn(
    req: AdminRollbackRequest | None = None,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Roll back to the previous turn snapshot in history (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    await resolve_game(gid)
    verify_admin_access(gid, current_user)

    history_stack = GAME_HISTORY.get(gid, [])
    if not history_stack:
        raise HTTPException(
            status_code=400, detail="No previous turn snapshots in history to roll back to."
        )

    prev_state = history_stack.pop()
    HISTORY_UNSAVED.add(gid)
    prev_state.finalized_powers = []
    current = GAMES.get(gid)
    if current and current.timer:
        prev_state.timer = current.timer
        start_phase_clock(prev_state, timer_players(prev_state), time.time())
    prev_state.turn_history.insert(
        0,
        f"[ADMIN OVERRIDE] Rolled back turn to {prev_state.season} {prev_state.year} {prev_state.phase} Phase.",
    )
    GAMES[gid] = prev_state
    refresh_diagnostics_and_simulation(prev_state)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, prev_state)
    await broadcast_lobby_update()
    return prev_state


@router.post(
    "/api/admin/set-turn",
    response_model=GameState,
    summary="Set Season & Phase",
    description="Arbitrarily adjust season, year, or phase (creator only).",
)
async def admin_set_turn(
    req: AdminSetTurnRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Arbitrarily adjust season, year, or phase (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)

    valid_seasons = ["Spring", "Fall", "Winter"]
    valid_phases = ["Movement", "Retreats", "Adjustments"]
    if req.season not in valid_seasons:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid season '{req.season}'. Must be one of {valid_seasons}.",
        )
    if req.phase not in valid_phases:
        raise HTTPException(
            status_code=400, detail=f"Invalid phase '{req.phase}'. Must be one of {valid_phases}."
        )
    if req.phase not in PHASES_BY_SEASON[req.season]:
        raise HTTPException(status_code=400, detail=f"{req.season} has no {req.phase} phase.")
    if req.year < FIRST_YEAR:
        raise HTTPException(status_code=400, detail=f"Year must be {FIRST_YEAR} or later.")

    game.season = req.season
    game.year = req.year
    game.phase = req.phase
    if game.timer:
        start_phase_clock(game, timer_players(game), time.time())
    game.turn_history.insert(
        0, f"[ADMIN OVERRIDE] Adjusted game clock to {req.season} {req.year} {req.phase} Phase."
    )
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game


@router.post(
    "/api/admin/unfinalize-all",
    response_model=GameState,
    summary="Unfinalize All Powers",
    description="Unlock and unfinalize orders for all Great Powers simultaneously (creator only).",
)
async def admin_unfinalize_all(
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Unlock and unfinalize orders for all Great Powers (Creator Only)."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)
    verify_admin_access(gid, current_user)
    game.finalized_powers = []
    game.turn_history.insert(0, "[ADMIN OVERRIDE] Unlocked orders for all Great Powers.")
    refresh_diagnostics_and_simulation(game)
    sync_summary(gid)
    await persist_game(gid)
    await broadcast_game_update(gid, game)
    await broadcast_lobby_update()
    return game
