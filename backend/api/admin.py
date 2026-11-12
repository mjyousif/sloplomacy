"""FastAPI router for creator and administrator game manipulation endpoints."""

import os
import time
import uuid
from datetime import datetime, timezone

from api.admin_utils import record_admin_history_and_log, resolve_admin_actor
from api.turns import timer_players
from domain.game_state import (
    FIRST_YEAR,
    PHASES_BY_SEASON,
    AdminActionLogEntry,
    GameState,
    TurnHistoryEntry,
)
from domain.requests import (
    AdminAcknowledgeRequest,
    AdminRollbackRequest,
    AdminSetTurnRequest,
    AdminStatusResponse,
    SeedScenarioRequest,
)
from engine.order_utils import (
    create_default_orders,
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

    def _build_entries() -> list[TurnHistoryEntry]:
        return [
            TurnHistoryEntry(index=i, season=s.season, year=s.year, phase=s.phase)
            for i, s in enumerate(history_stack)
        ]

    if gid == DEFAULT_GAME_ID or not summary or summary.is_sandbox:
        return AdminStatusResponse(
            is_creator=True,
            can_rollback=len(history_stack) > 0,
            history_count=len(history_stack),
            history_entries=_build_entries(),
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
        history_entries=_build_entries() if is_creator else [],
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

    idx = req.snapshot_index if req and req.snapshot_index is not None else len(history_stack) - 1
    if idx < 0 or idx >= len(history_stack):
        raise HTTPException(status_code=400, detail=f"Invalid rollback snapshot index {idx}.")

    prev_state = history_stack[idx].model_copy(deep=True)
    del history_stack[idx:]
    HISTORY_UNSAVED.add(gid)
    current = GAMES.get(gid)

    if prev_state.phase == "Admin":
        valid_phases = PHASES_BY_SEASON.get(prev_state.season, ["Movement"])
        next_p = (
            prev_state.last_resolution.next_phase
            if prev_state.last_resolution and prev_state.last_resolution.next_phase in valid_phases
            else valid_phases[0]
        )
        prev_state.phase = next_p
        prev_state.orders = create_default_orders(
            prev_state.units, prev_state.phase, prev_state.builds
        )
        prev_state.last_resolution = None

    prev_state.finalized_powers = []
    if current and current.timer:
        prev_state.timer = current.timer
        start_phase_clock(prev_state, timer_players(prev_state), time.time())

    summary_line = (
        f"[ADMIN OVERRIDE] Rolled back turn to {prev_state.season} {prev_state.year} "
        f"{prev_state.phase} Phase."
    )
    prev_state.turn_history.insert(0, summary_line)

    actor_email, actor_id = resolve_admin_actor(
        gid,
        current_user,
        req.user_id if req else None,
        req.email if req else None,
        x_user_id,
        x_user_email,
    )
    ack_list = [x for x in (actor_id, actor_email) if x]
    summary = GAME_SUMMARIES.get(gid)
    if summary:
        for p_key, part in summary.participants.items():
            if (actor_id and part.user_id == actor_id) or (
                actor_email and part.email and part.email.lower() == actor_email.lower()
            ):
                if p_key not in ack_list:
                    ack_list.append(p_key)

    if current and current.admin_log:
        prev_state.admin_log = list(current.admin_log)
    prev_state.admin_log.append(
        AdminActionLogEntry(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            actor=actor_email,
            season=prev_state.season,
            year=prev_state.year,
            phase=prev_state.phase,
            summary_lines=[summary_line],
            acknowledged_by=ack_list,
        )
    )
    prev_state.state_revision = (
        max(prev_state.state_revision, current.state_revision if current else 1) + 1
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

    before_state = game.model_copy(deep=True)
    game.season = req.season
    game.year = req.year
    game.phase = req.phase
    if game.timer:
        start_phase_clock(game, timer_players(game), time.time())
    summary_line = (
        f"[ADMIN OVERRIDE] Adjusted game clock to {req.season} {req.year} {req.phase} Phase."
    )
    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, req.user_id, req.email, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid,
        before_state,
        game,
        [summary_line],
        actor=actor_email,
        actor_id=actor_id,
    )
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

    before_state = game.model_copy(deep=True)
    game.finalized_powers = []
    summary_line = "[ADMIN OVERRIDE] Unlocked orders for all Great Powers."
    game.turn_history.insert(0, summary_line)
    refresh_diagnostics_and_simulation(game)

    actor_email, actor_id = resolve_admin_actor(
        gid, current_user, None, None, x_user_id, x_user_email
    )
    await record_admin_history_and_log(
        gid,
        before_state,
        game,
        [summary_line],
        actor=actor_email,
        actor_id=actor_id,
    )
    return game


@router.post(
    "/api/admin/acknowledge",
    summary="Acknowledge Admin Actions",
    description="Mark admin action log entries as acknowledged for the current player.",
)
async def acknowledge_admin_actions(
    req: AdminAcknowledgeRequest | None = None,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
):
    """Persist per-player dismissal of admin action warning modals."""
    gid = game_id or DEFAULT_GAME_ID
    game = await resolve_game(gid)

    ack_id = (
        (current_user.user_id if current_user else None)
        or (req.user_id if req else None)
        or x_user_id
        or (req.power.value if req and req.power else None)
        or "guest"
    )
    extra_ids: list[str] = [ack_id]
    if current_user and current_user.email and current_user.email not in extra_ids:
        extra_ids.append(current_user.email)
    if req and req.email and req.email not in extra_ids:
        extra_ids.append(req.email)
    if req and req.power and req.power.value not in extra_ids:
        extra_ids.append(req.power.value)

    summary = GAME_SUMMARIES.get(gid)
    if summary and current_user:
        for p_key, part in summary.participants.items():
            if part.user_id == current_user.user_id and p_key not in extra_ids:
                extra_ids.append(p_key)

    target_ids = set(req.entry_ids) if (req and req.entry_ids is not None) else None
    changed = False
    for entry in game.admin_log:
        if target_ids is None or entry.id in target_ids:
            for ident in extra_ids:
                if ident and ident not in entry.acknowledged_by:
                    entry.acknowledged_by.append(ident)
                    changed = True

    if changed:
        await persist_game(gid)

    return {"ok": True, "acknowledged_by": ack_id}
