"""
FastAPI router for the host's overrides of the phase clock (GitHub issue #393).

The host may pause the clock (a pause only they can lift), resume it, set when it runs out
(time left, a nudge to the running deadline, or a wall-clock time, which also ends a vote),
turn it off, and change the match's clock lengths. Every override is recorded in the admin
action log, which the players acknowledge. Starting the clock stays in `turns.py`.
"""

import time
from datetime import datetime

from api.admin_utils import create_admin_log_entry, resolve_admin_actor
from domain.game_state import MAX_CLOCK_MINUTES, GameState, TimerSettings, TimerStage
from domain.ids import DEFAULT_GAME_ID
from domain.requests import TimerDeadlineRequest
from engine.order_utils import reject_if_game_over
from engine.phase_timer import host_pause, host_resume, host_set_deadline
from engine.turn_service import publish_game_state, timer_players
from fastapi import APIRouter, Depends, HTTPException
from security.auth import AuthUser, get_current_user
from security.secrecy import (
    sanitize_game_state_for_viewer,
    verify_admin_access,
    viewer_ack_ids,
    viewer_power_for,
)
from storage.profiles import ensure_profile_loaded
from storage.store import GAME_SUMMARIES, resolve_game

router = APIRouter(tags=["Phase Clock & Timers"])

# A deadline must leave the players some time, and no clock may be set further out than this.
MIN_SECONDS_LEFT = 10
MAX_SECONDS_LEFT = MAX_CLOCK_MINUTES * 60


async def _host_match(game_id: str, current_user: AuthUser | None) -> GameState:
    """The match, once the caller is shown to be its host. Only a multiplayer match has a clock."""
    game = await resolve_game(game_id)
    verify_admin_access(game.game_id, current_user)
    summary = GAME_SUMMARIES.get(game.game_id)
    if game.game_id == DEFAULT_GAME_ID or not summary or summary.is_sandbox:
        raise HTTPException(status_code=409, detail="Only a multiplayer match has a turn clock.")
    reject_if_game_over(game)
    return game


def _require_clock(game: GameState) -> None:
    if game.timer is None:
        raise HTTPException(status_code=409, detail="This match has no clock running.")


async def _log_and_publish(game: GameState, line: str, current_user: AuthUser | None) -> GameState:
    """Record the override for the players to acknowledge, then save and broadcast."""
    actor_id = resolve_admin_actor(game.game_id, current_user)
    await ensure_profile_loaded(actor_id)
    summary_line = f"[ADMIN OVERRIDE] {line}"
    game.admin_log.append(
        create_admin_log_entry(
            game.game_id,
            season=game.season,
            year=game.year,
            phase=game.phase,
            summary_lines=[summary_line],
            actor_id=actor_id,
        )
    )
    game.turn_history.insert(0, summary_line)
    await publish_game_state(game, refresh=False, bump_revision=True)
    return sanitize_game_state_for_viewer(
        game, viewer_power_for(game.game_id, current_user), viewer_ack_ids(current_user)
    )


def _describe_length(seconds: float) -> str:
    """A length in its two biggest units, as the client writes it: "45 min", "1 h 30 min", "2 d 3 h"."""
    minutes = max(1, round(seconds / 60))
    if minutes < 60:
        return f"{minutes} min"
    if minutes < 24 * 60:
        hours, rest = divmod(minutes, 60)
        return f"{hours} h {rest} min" if rest else f"{hours} h"
    days, rest = divmod(minutes, 24 * 60)
    hours = rest // 60
    return f"{days} d {hours} h" if hours else f"{days} d"


@router.post(
    "/api/games/{game_id}/timer/pause",
    response_model=GameState,
    summary="Host: Pause Clock",
)
async def host_pause_timer(game_id: str, current_user: AuthUser | None = Depends(get_current_user)):
    game = await _host_match(game_id, current_user)
    _require_clock(game)
    if game.timer.stage == TimerStage.PAUSED and game.timer.host_paused:
        raise HTTPException(status_code=409, detail="The clock is already paused.")
    host_pause(game.timer)
    return await _log_and_publish(game, "Paused the turn clock.", current_user)


@router.post(
    "/api/games/{game_id}/timer/resume",
    response_model=GameState,
    summary="Host: Resume Clock",
)
async def host_resume_timer(
    game_id: str, current_user: AuthUser | None = Depends(get_current_user)
):
    game = await _host_match(game_id, current_user)
    _require_clock(game)
    if game.timer.stage != TimerStage.PAUSED:
        raise HTTPException(status_code=409, detail="The clock is not paused.")
    players = timer_players(game)
    if not players:
        raise HTTPException(status_code=409, detail="Nobody is left playing in this match.")
    host_resume(game, players, time.time())
    what = "opened a new vote" if game.timer.stage == TimerStage.VOTING else "restarted the clock"
    return await _log_and_publish(game, f"Resumed the turn clock and {what}.", current_user)


@router.post(
    "/api/games/{game_id}/timer/deadline",
    response_model=GameState,
    summary="Host: Set Clock Deadline",
)
async def host_set_timer_deadline(
    game_id: str,
    req: TimerDeadlineRequest,
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _host_match(game_id, current_user)
    _require_clock(game)
    timer = game.timer
    now = time.time()
    if req.adjust_seconds is not None:
        if timer.stage != TimerStage.RUNNING or timer.deadline is None:
            raise HTTPException(
                status_code=409, detail="Only a running clock can be moved forward or back."
            )
        deadline = timer.deadline + req.adjust_seconds
    elif req.seconds_left is not None:
        deadline = now + req.seconds_left
    else:
        deadline = req.deadline
    left = deadline - now
    if left < MIN_SECONDS_LEFT:
        raise HTTPException(
            status_code=400, detail=f"The clock must have at least {MIN_SECONDS_LEFT} seconds left."
        )
    if left > MAX_SECONDS_LEFT:
        raise HTTPException(
            status_code=400, detail="The clock cannot be set more than 30 days out."
        )

    was = timer.stage
    host_set_deadline(timer, deadline, now)
    if req.adjust_seconds is not None:
        sign = "Added" if req.adjust_seconds >= 0 else "Took"
        word = "to" if req.adjust_seconds >= 0 else "off"
        line = f"{sign} {_describe_length(abs(req.adjust_seconds))} {word} the turn clock."
    elif req.deadline is not None:
        stamp = datetime.fromtimestamp(deadline).astimezone().strftime("%Y-%m-%d %H:%M %Z")
        line = f"Set the turn clock to run out at {stamp}."
    else:
        line = f"Set the turn clock to {_describe_length(left)} left."
    if was == TimerStage.VOTING:
        line = f"Ended the vote. {line}"
    elif was == TimerStage.PAUSED:
        line = f"Lifted the pause. {line}"
    return await _log_and_publish(game, line, current_user)


@router.post(
    "/api/games/{game_id}/timer/stop",
    response_model=GameState,
    summary="Host: Turn Clock Off",
)
async def host_stop_timer(game_id: str, current_user: AuthUser | None = Depends(get_current_user)):
    game = await _host_match(game_id, current_user)
    _require_clock(game)
    game.timer = None
    return await _log_and_publish(
        game, "Turned the turn clock off. The match is untimed.", current_user
    )


@router.put(
    "/api/games/{game_id}/timer/settings",
    response_model=GameState,
    summary="Host: Set Clock Lengths",
)
async def host_set_timer_settings(
    game_id: str,
    req: TimerSettings,
    current_user: AuthUser | None = Depends(get_current_user),
):
    game = await _host_match(game_id, current_user)
    if req == game.timer_settings:
        raise HTTPException(status_code=409, detail="Those are already the clock lengths.")
    game.timer_settings = req
    options = ", ".join(_describe_length(m * 60) for m in req.vote_minutes)
    line = (
        f"Set the clock lengths: votes offer {options} or pause, a vote lasts "
        f"{req.vote_window_seconds} s, Retreats and Adjustments run "
        f"{_describe_length(req.fixed_phase_minutes * 60)}. They apply from the next vote or phase."
    )
    return await _log_and_publish(game, line, current_user)
