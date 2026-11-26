"""FastAPI router for turn finalization, simulation, adjudication, and phase clock actions."""

import time

from api.admin_utils import create_admin_log_entry, resolve_admin_actor
from domain.board import Power
from domain.game_state import AdminActionLogEntry, GameState, TimerStage
from domain.issues import IssueSeverity
from domain.orders import SimulationResult
from domain.requests import (
    FinalizeRequest,
    FinalizeResponse,
    SetPowerRequest,
    TimerToggleRequest,
    TimerVoteRequest,
)
from engine.order_utils import (
    everyone_is_ready,
    refresh_diagnostics_and_simulation,
    reject_if_game_over,
    reject_if_surrendered,
    reject_stale_turn,
    turn_label,
)
from engine.phase_timer import (
    settle_timer,
    start_phase_clock,
    vote_choices,
)
from engine.turn_service import (
    execute_adjudication,
    publish_game_state,
    timer_players,
)
from engine.validator.orchestrator import validate_orders
from fastapi import APIRouter, Depends, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    require_seat_holder,
    sanitize_game_state_for_viewer,
    verify_admin_access,
    verify_power_authorization,
    viewer_power_for,
    with_sanitized_admin_log,
)
from storage.profiles import ensure_profile_loaded
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_SUMMARIES,
    resolve_game,
)

router = APIRouter()


async def require_timer_player(
    game_id: str,
    power: Power,
    stage: TimerStage,
    current_user: AuthUser | None = None,
) -> GameState:
    game = await resolve_game(game_id)
    if game.timer is None:
        raise HTTPException(status_code=409, detail="This match has no clock running.")
    if power not in game.timer.players:
        raise HTTPException(status_code=403, detail=f"{power.value} is not playing in this match.")
    if game.timer.stage != stage:
        raise HTTPException(status_code=409, detail=f"The clock is not {stage.value} any more.")

    summary = GAME_SUMMARIES.get(game_id)
    if summary and not summary.is_sandbox:
        require_seat_holder(summary, power, current_user, action=f"act for {power.value}")

    return game


@router.post(
    "/api/finalize",
    response_model=FinalizeResponse,
    tags=["Match & Tactical Operations"],
    summary="Finalize Orders",
)
async def finalize_power_orders(
    req: FinalizeRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    reject_if_game_over(game)
    reject_stale_turn(game, req.turn)
    verify_power_authorization(game.game_id, req.power, current_user)
    reject_if_surrendered(game, req.power)
    power_issues = validate_orders(
        game.units,
        game.orders,
        include_unassigned_warnings=True,
        target_power=req.power,
        phase=game.phase,
        builds=game.builds,
        retreats=game.retreats,
    )

    blocking_issues = [i for i in power_issues if i.severity != IssueSeverity.INFO]
    if blocking_issues and not req.force:
        refresh_diagnostics_and_simulation(game)
        return FinalizeResponse(
            finalized=False,
            requires_confirmation=True,
            issues=power_issues,
            state=sanitize_game_state_for_viewer(game, req.power),
        )

    for ord_obj in game.orders.values():
        if ord_obj.power == req.power:
            ord_obj.is_explicit = True

    if req.power not in game.finalized_powers:
        game.finalized_powers.append(req.power)

    refresh_diagnostics_and_simulation(game)
    ready = everyone_is_ready(game)
    await publish_game_state(game, refresh=False, lobby=True, persist=not ready, bump_revision=True)

    if ready:
        await execute_adjudication(game)
    return FinalizeResponse(
        finalized=True,
        requires_confirmation=False,
        issues=power_issues,
        state=sanitize_game_state_for_viewer(game, req.power),
    )


@router.post(
    "/api/unfinalize",
    response_model=GameState,
    tags=["Match & Tactical Operations"],
    summary="Unfinalize Orders",
)
async def unfinalize_power_orders(
    req: SetPowerRequest,
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    reject_if_game_over(game)
    verify_power_authorization(game.game_id, req.power, current_user)
    reject_if_surrendered(game, req.power)
    if req.power in game.finalized_powers:
        game.finalized_powers.remove(req.power)
    await publish_game_state(game, lobby=True, bump_revision=True)
    return sanitize_game_state_for_viewer(game, req.power)


@router.post(
    "/api/simulate",
    response_model=SimulationResult,
    tags=["Match & Tactical Operations"],
    summary="Simulate Turn Resolution",
)
async def simulate_current_orders(
    game_id: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    refresh_diagnostics_and_simulation(game)
    visible = sanitize_game_state_for_viewer(game, viewer_power_for(game.game_id, current_user))
    if visible.preview is None:
        raise HTTPException(status_code=500, detail="Tactical preview could not be computed.")
    return visible.preview


@router.post(
    "/api/adjudicate",
    response_model=GameState,
    tags=["Match & Tactical Operations"],
    summary="Adjudicate Turn & Advance Phase",
)
async def adjudicate_and_advance(
    game_id: str | None = Query(default=None),
    # The turn the caller meant to resolve. A second click arrives after it resolved and is refused.
    turn: str | None = Query(default=None),
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await resolve_game(game_id)
    gid = game.game_id

    admin_entry: AdminActionLogEntry | None = None
    if gid != DEFAULT_GAME_ID:
        # Runs for every game but the default board, so one with no summary is refused too.
        verify_admin_access(gid, current_user)
        summary = GAME_SUMMARIES.get(gid)
        if summary and not summary.is_sandbox:
            actor_id = resolve_admin_actor(gid, current_user)
            await ensure_profile_loaded(actor_id)
            prev_label = turn_label(game)
            admin_entry = create_admin_log_entry(
                gid,
                season=game.season,
                year=game.year,
                phase=game.phase,
                summary_lines=[f"[ADMIN OVERRIDE] Force-resolved {prev_label} Phase."],
                actor_id=actor_id,
            )

    reject_stale_turn(game, turn)
    return with_sanitized_admin_log(
        await execute_adjudication(game, admin_entry=admin_entry), current_user
    )


@router.post(
    "/api/games/{game_id}/timer/start",
    response_model=GameState,
    tags=["Phase Clock & Timers"],
    summary="Start Phase Clock",
)
async def start_timer(game_id: str, current_user: AuthUser | None = Depends(get_current_user)):
    game = await resolve_game(game_id)
    verify_admin_access(game.game_id, current_user)
    if game.timer:
        raise HTTPException(status_code=409, detail="The clock is already running.")
    players = timer_players(game)
    if not players or game.winner:
        raise HTTPException(
            status_code=409, detail="The clock can only start in a match being played."
        )
    start_phase_clock(game, players, time.time())
    await publish_game_state(game, refresh=False)
    return sanitize_game_state_for_viewer(game, viewer_power_for(game.game_id, current_user))


@router.post(
    "/api/games/{game_id}/timer/vote",
    response_model=GameState,
    tags=["Phase Clock & Timers"],
    summary="Vote on Turn Duration",
)
async def vote_on_timer(
    game_id: str,
    req: TimerVoteRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await require_timer_player(game_id, req.power, TimerStage.VOTING, current_user)
    if req.choice not in vote_choices(game.timer):
        raise HTTPException(status_code=400, detail="This vote does not offer that length.")
    game.timer.votes[req.power] = req.choice
    settle_timer(game, timer_players(game), time.time())
    await publish_game_state(game, refresh=False)
    return sanitize_game_state_for_viewer(game, req.power)


@router.post(
    "/api/games/{game_id}/timer/extend",
    response_model=GameState,
    tags=["Phase Clock & Timers"],
    summary="Request Clock Extension",
)
async def request_timer_extension(
    game_id: str,
    req: TimerToggleRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await require_timer_player(game_id, req.power, TimerStage.RUNNING, current_user)
    requests = game.timer.extend_requests
    if req.active and req.power not in requests:
        requests.append(req.power)
    elif not req.active and req.power in requests:
        requests.remove(req.power)
    settle_timer(game, timer_players(game), time.time())
    await publish_game_state(game, refresh=False)
    return sanitize_game_state_for_viewer(game, req.power)


@router.post(
    "/api/games/{game_id}/timer/ready",
    response_model=GameState,
    tags=["Phase Clock & Timers"],
    summary="Ready Up / Resume Clock",
)
async def ready_up_timer(
    game_id: str,
    req: TimerToggleRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await require_timer_player(game_id, req.power, TimerStage.PAUSED, current_user)
    if game.timer.host_paused:
        raise HTTPException(
            status_code=409, detail="The host paused the clock. Only they can resume it."
        )
    ready = game.timer.ready_powers
    if req.active and req.power not in ready:
        ready.append(req.power)
    elif not req.active and req.power in ready:
        ready.remove(req.power)
    settle_timer(game, timer_players(game), time.time())
    await publish_game_state(game, refresh=False)
    return sanitize_game_state_for_viewer(game, req.power)
