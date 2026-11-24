"""Turn-lifecycle orchestration: state publishing, phase adjudication, and timer ticks."""

import logging
import time
from datetime import datetime, timezone

from domain.board import Power
from domain.game_state import AdminActionLogEntry, GameState, TimerStage
from engine.adjudicator.resolver import adjudicate_turn
from engine.adjudicator.territory import supply_center_owners
from engine.order_utils import (
    create_default_orders,
    everyone_is_ready,
    refresh_diagnostics_and_simulation,
    reject_if_game_over,
    turn_label,
)
from engine.phase_timer import (
    close_vote,
    has_expired,
    settle_timer,
    start_phase_clock,
)
from fastapi import BackgroundTasks
from storage import store
from storage.store import (
    GAME_HISTORY,
    GAME_SUMMARIES,
    HISTORY_UNSAVED,
    PRIVATE_SANDBOXES,
    SANDBOX_CHECKPOINTS,
    adjudication_lock,
    clear_ephemeral_sandboxes_for,
)
from ws.connection_manager import (
    broadcast_game_update,
    broadcast_lobby_update,
)

logger = logging.getLogger("diplomacy.server")


async def publish_game_state(
    game: GameState,
    *,
    refresh: bool = True,
    lobby: bool = False,
    persist: bool = True,
    background_tasks: BackgroundTasks | None = None,
    bump_revision: bool = False,
) -> GameState:
    """Refresh derived tactical fields, sync summary, persist, and broadcast game updates."""
    gid = game.game_id
    if bump_revision:
        game.state_revision += 1
    if refresh:
        refresh_diagnostics_and_simulation(game)
    if background_tasks is not None:
        store.sync_summary(gid)
        background_tasks.add_task(broadcast_game_update, gid, game)
        if lobby:
            background_tasks.add_task(broadcast_lobby_update)
        if persist:
            background_tasks.add_task(store.persist_game, gid)
        return game

    if persist:
        await store.persist_game(gid)
    await broadcast_game_update(gid, game)
    if lobby:
        await broadcast_lobby_update()
    return game


def timer_players(game: GameState) -> list[Power]:
    """The powers that vote on and share the clock: everyone seated and still in the game."""
    summary = GAME_SUMMARIES.get(game.game_id)
    if not summary or summary.is_sandbox or summary.status != "active":
        return []
    in_game = {u.power for u in game.units} | set(supply_center_owners(game.ownership).values())
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


async def execute_adjudication(
    game: GameState,
    admin_entry: AdminActionLogEntry | None = None,
    *,
    expected_turn: str | None = None,
) -> GameState:
    """Resolve the phase being played, then any phase nobody is left to wait for.

    Resolving a phase persists and broadcasts, so it awaits, and a second caller could arrive
    meanwhile. Two guards make sure a phase is resolved once and only once:

    - A per-game lock admits one resolver at a time. The loop below runs inside it, so a phase
      that follows by itself never needs to take the lock again.
    - `expected_turn` is the turn label the caller decided to resolve (default: the one on the
      board when it called). A caller that waited for the lock while another resolved that turn
      finds the board has moved on and does nothing, rather than resolving the next turn too.
      A caller that awaits anything between deciding and calling passes the label it decided on.
    """
    expected = expected_turn or turn_label(game)
    async with adjudication_lock(game.game_id):
        if turn_label(game) != expected:
            return game
        await _resolve_phase(game, admin_entry)
        while everyone_is_ready(game):
            await _resolve_phase(game)
    return game


async def _resolve_phase(game: GameState, admin_entry: AdminActionLogEntry | None = None) -> None:
    """Resolve the current phase. Only `execute_adjudication` calls it, holding the game's lock."""
    gid = game.game_id

    reject_if_game_over(game)

    if gid not in GAME_HISTORY:
        GAME_HISTORY[gid] = []
    GAME_HISTORY[gid].append(
        game.model_copy(deep=True, update={"preview": None, "issues": [], "timer": None})
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
    prev_label = turn_label(game)
    next_season = result.next_season or ("Fall" if game.season == "Spring" else "Spring")
    next_year = result.next_year or (game.year if game.season == "Spring" else game.year + 1)
    next_phase = result.next_phase or "Movement"

    new_orders = create_default_orders(result.new_units, next_phase, result.builds)
    history_entry = (
        f"[ADMIN OVERRIDE] Force-resolved {prev_label}: "
        f"{len(result.summary)} tactical actions processed."
        if admin_entry
        else f"Resolved {prev_label}: {len(result.summary)} tactical actions processed."
    )
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
    game.board_revision += 1
    game.turn_history.insert(0, history_entry)
    if admin_entry:
        game.admin_log.append(admin_entry)
    if result.winner:
        game.winner = result.winner
        game.timer = None
        game.turn_history.insert(0, f"{result.winner.value} has won the game in {prev_label}.")
        if summary := GAME_SUMMARIES.get(gid):
            summary.winner = result.winner
            summary.status = "completed"
            if not summary.completed_at:
                summary.completed_at = datetime.now(timezone.utc).isoformat()
    if game.timer:
        start_phase_clock(game, timer_players(game), time.time())
    if summary := GAME_SUMMARIES.get(gid):
        summary.last_moved_at = datetime.now(timezone.utc).isoformat()
    if gid not in PRIVATE_SANDBOXES and SANDBOX_CHECKPOINTS.get(gid) is None:
        clear_ephemeral_sandboxes_for(gid)
    await publish_game_state(game, lobby=True)


async def tick_timer(game: GameState) -> None:
    """Act on a deadline that has passed."""
    timer = game.timer
    if not has_expired(timer, time.time()):
        return
    if timer.stage == TimerStage.RUNNING:
        try:
            await execute_adjudication(game)
        except Exception:
            logger.exception("Could not resolve %s when its clock ran out.", game.game_id)
            timer.stage = TimerStage.PAUSED
            timer.deadline = None
            await publish_game_state(game, refresh=False)
        return
    close_vote(timer, time.time())
    await publish_game_state(game, refresh=False)
