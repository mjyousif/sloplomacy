import logging
import time
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import GameState, TimerStage
from domain.issues import IssueSeverity
from domain.orders import SimulationResult
from domain.requests import (
    FinalizeRequest,
    FinalizeResponse,
    SetPowerRequest,
    TimerToggleRequest,
    TimerVoteRequest,
)
from engine.adjudicator.resolver import adjudicate_turn
from engine.order_utils import (
    create_default_orders,
    everyone_is_ready,
    refresh_diagnostics_and_simulation,
)
from engine.phase_timer import (
    close_vote,
    has_expired,
    settle_timer,
    start_phase_clock,
)
from engine.validator.orchestrator import validate_orders
from fastapi import APIRouter, Depends, HTTPException, Query
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    sanitize_game_state_for_viewer,
    verify_admin_access,
    verify_power_authorization,
    viewer_power_for,
)
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_HISTORY,
    GAME_SUMMARIES,
    HISTORY_UNSAVED,
    persist_game,
    resolve_game,
    sync_summary,
)
from storage.supabase import is_valid_uuid
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

logger = logging.getLogger("diplomacy.server")

router = APIRouter()


def timer_players(game: GameState) -> list[Power]:
    """The powers that vote on and share the clock: everyone seated and still in the game."""
    summary = GAME_SUMMARIES.get(game.game_id)
    if not summary or summary.is_sandbox or summary.status != "active":
        return []
    in_game = {u.power for u in game.units} | set(game.ownership.values())
    return [
        part.power
        for part in summary.participants.values()
        if not part.surrendered
        and part.power not in game.surrendered_powers
        and part.power in in_game
    ]


def refresh_timer(game: GameState) -> None:
    """Bring the clock up to date after players join or go."""
    if game.timer is None:
        return
    players = timer_players(game)
    if players:
        settle_timer(game, players, time.time())
    else:
        game.timer = None


async def publish_timer(game: GameState) -> GameState:
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    return game


def reject_stale_turn(game: GameState, turn: str | None) -> None:
    """Refuse a request made for a turn that has since resolved."""
    current = f"{game.season} {game.year} {game.phase}"
    if turn and turn != current:
        raise HTTPException(
            status_code=409, detail=f"Too late: the game has moved on to {current}."
        )


async def _execute_adjudication(game: GameState) -> GameState:
    gid = game.game_id

    if game.winner:
        raise HTTPException(
            status_code=409, detail=f"Game over: {game.winner.value} has already won."
        )

    if gid not in GAME_HISTORY:
        GAME_HISTORY[gid] = []
    GAME_HISTORY[gid].append(
        game.model_copy(deep=True, update={"last_resolution": None, "issues": [], "timer": None})
    )
    if len(GAME_HISTORY[gid]) > 30:
        GAME_HISTORY[gid].pop(0)
    HISTORY_UNSAVED.add(gid)

    result = adjudicate_turn(
        game.units,
        game.orders,
        game.ownership,
        game.season,
        game.year,
        game.phase,
        retreats=game.retreats,
    )
    prev_label = f"{game.season} {game.year} {game.phase}"
    next_season = result.next_season or ("Fall" if game.season == "Spring" else "Spring")
    next_year = result.next_year or (game.year if game.season == "Spring" else game.year + 1)
    next_phase = result.next_phase or "Movement"

    new_orders = create_default_orders(result.new_units, next_phase, result.builds)
    history_entry = f"Resolved {prev_label}: {len(result.summary)} tactical actions processed."
    game.season = next_season
    game.year = next_year
    game.phase = next_phase
    game.units = result.new_units
    game.orders = new_orders
    game.ownership = result.new_ownership
    game.builds = result.builds
    game.retreats = result.retreats
    game.finalized_powers = []
    game.state_revision += 1
    game.turn_history.insert(0, history_entry)
    if result.winner:
        game.winner = result.winner
        game.last_resolution = result
        game.turn_history.insert(0, f"{result.winner.value} has won the game in {prev_label}.")
    if game.timer:
        start_phase_clock(game, timer_players(game), time.time())
    refresh_diagnostics_and_simulation(game)
    if summary := GAME_SUMMARIES.get(gid):
        summary.last_moved_at = datetime.now(timezone.utc).isoformat()
    sync_summary(game.game_id)
    await persist_game(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()
    if everyone_is_ready(game):
        return await _execute_adjudication(game)
    return game


async def tick_timer(game: GameState) -> None:
    """Act on a deadline that has passed."""
    timer = game.timer
    if not has_expired(timer, time.time()):
        return
    if timer.stage == TimerStage.RUNNING:
        try:
            await _execute_adjudication(game)
        except Exception:
            logger.exception("Could not resolve %s when its clock ran out.", game.game_id)
            timer.stage = TimerStage.PAUSED
            timer.deadline = None
            await publish_timer(game)
        return
    close_vote(timer, time.time())
    await publish_timer(game)


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
        part = summary.participants.get(power.value)
        if part:
            if current_user:
                if part.user_id != current_user.user_id and (
                    not current_user.email
                    or current_user.email.lower() != (part.email or "").lower()
                ):
                    raise HTTPException(
                        status_code=403, detail=f"You do not command {power.value} in this match."
                    )
            elif is_valid_uuid(part.user_id):
                raise HTTPException(
                    status_code=401, detail=f"Authentication required to act for {power.value}."
                )

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
    reject_stale_turn(game, req.turn)
    verify_power_authorization(game.game_id, req.power, current_user)
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
    game.state_revision += 1

    refresh_diagnostics_and_simulation(game)
    sync_summary(game.game_id)
    await broadcast_game_update(game.game_id, game)
    await broadcast_lobby_update()

    if everyone_is_ready(game):
        await _execute_adjudication(game)
    else:
        await persist_game(game.game_id)
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
    verify_power_authorization(game.game_id, req.power, current_user)
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
    if visible.last_resolution is None:
        raise HTTPException(status_code=500, detail="Tactical preview could not be computed.")
    return visible.last_resolution


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

    if gid != DEFAULT_GAME_ID:
        summary = GAME_SUMMARIES.get(gid)
        if summary and not summary.is_sandbox:
            verify_admin_access(gid, current_user)

    reject_stale_turn(game, turn)
    return await _execute_adjudication(game)


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
    return await publish_timer(game)


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
    game.timer.votes[req.power] = req.choice
    settle_timer(game, timer_players(game), time.time())
    return sanitize_game_state_for_viewer(await publish_timer(game), req.power)


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
    return sanitize_game_state_for_viewer(await publish_timer(game), req.power)


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
    ready = game.timer.ready_powers
    if req.active and req.power not in ready:
        ready.append(req.power)
    elif not req.active and req.power in ready:
        ready.remove(req.power)
    settle_timer(game, timer_players(game), time.time())
    return sanitize_game_state_for_viewer(await publish_timer(game), req.power)
