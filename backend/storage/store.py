"""Authoritative in-memory L1 store and Supabase persistence coordinator."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from domain.board import Power
from domain.game_state import (
    BoardPreview,
    GameState,
    MultiplayerGameSummary,
    PreviewUnit,
    TimerStage,
)
from domain.ids import DEFAULT_GAME_ID
from engine.adjudicator.territory import displayed_owners
from engine.reachability import compute_unit_options
from fastapi import HTTPException, status
from storage import phases as phases_storage
from storage import supabase
from storage.phases import (
    GAME_HISTORY as GAME_HISTORY,
)
from storage.phases import (
    HISTORY_UNSAVED as HISTORY_UNSAVED,
)
from storage.phases import (
    clear_phase_tracking,
    current_phase_count,
    flush_phase_mutations,
    has_unsaved_phases,
    set_loaded_phase_state,
)
from storage.press import (
    GAME_PRESS as GAME_PRESS,
)
from storage.press import (
    PRESS_UNSAVED as PRESS_UNSAVED,
)
from storage.press import (
    clear_press_tracking,
)
from storage.profiles import PROFILE_NAMES as PROFILE_NAMES
from storage.profiles import resolve_participant_name
from storage.supabase import GAME_DB_IDS as GAME_DB_IDS
from storage.supabase import LoadedGame, SupabaseUnavailable

logger = logging.getLogger("diplomacy.server")

MAX_ACTIVE_GAMES = 250

GAMES: dict[str, GameState] = {}
SANDBOX_CHECKPOINTS: dict[str, GameState | None] = {DEFAULT_GAME_ID: None}
# The history a solo sandbox started from. Leaving the sandbox puts it back, so turns played
# hypothetically never show up as real ones or become a rollback target.
SANDBOX_HISTORY_CHECKPOINTS: dict[str, list[GameState]] = {}
GAME_SUMMARIES: dict[str, MultiplayerGameSummary] = {}
GAME_PASSCODES: dict[str, str] = {}
UNSAVED_GAMES: set[str] = set()
SAVES_RUNNING: dict[str, bool] = {}
PRIVATE_SANDBOXES: dict[str, tuple[str, Power]] = {}
PRIVATE_SANDBOX_TURNS: dict[str, tuple[str, int, str]] = {}
# Preserves a solo/saved sandbox's hypothetical branch for the current real turn across exit/re-enter.
SANDBOX_BRANCHES: dict[str, tuple[tuple[str, int, str], GameState, list[GameState]]] = {}
# One resolver per game at a time (see `adjudication_lock`), with the loop each lock was made on.
ADJUDICATION_LOCKS: dict[str, tuple[asyncio.AbstractEventLoop, asyncio.Lock]] = {}
# Tracks last persisted seat/finalization snapshot so order-only clicks skip seat RPC round-trips.
_LAST_PARTICIPANTS_SIG: dict[str, tuple[Any, ...]] = {}


def _participants_signature(
    summary: MultiplayerGameSummary | None, state: GameState
) -> tuple[Any, ...]:
    if summary is None:
        return ()
    finalized = frozenset(p.value for p in state.finalized_powers)
    surrendered = tuple(sorted(p.value for p in state.surrendered_powers))
    seats = tuple(
        (
            pwr,
            part.user_id,
            part.display_name if not supabase.is_valid_uuid(part.user_id) else None,
            part.joined_at,
            bool(part.surrendered),
            part.surrendered_at,
            part.game_over_seen_at,
            pwr in finalized,
        )
        for pwr, part in sorted(summary.participants.items())
    )
    return (seats, surrendered)


def hydrate_summary_profiles(summary: MultiplayerGameSummary) -> MultiplayerGameSummary:
    """Resolve participants' display_name from PROFILE_NAMES (UUID-authoritative)."""
    for part in summary.participants.values():
        part.display_name = resolve_participant_name(part)
    return summary


def init_default_game() -> None:
    if DEFAULT_GAME_ID not in GAMES:
        from scenarios.presets import build_scenario

        GAMES[DEFAULT_GAME_ID] = build_scenario("standard_1901", Power.FRANCE, DEFAULT_GAME_ID)


init_default_game()


def lacks_summary(game_id: str) -> bool:
    """True for a game held in memory with no summary, which nothing is supposed to produce.

    The shared default board and a member's private sandbox copy have none by design. Any other
    game without one has no seats, owner or passcode on record, so every check treats it as a
    live match nobody may enter or administer, never as an open one.
    """
    return (
        game_id in GAMES
        and game_id not in GAME_SUMMARIES
        and game_id != DEFAULT_GAME_ID
        and game_id not in PRIVATE_SANDBOXES
    )


def is_private_sandbox(game_id: str | None) -> bool:
    """True when `game_id` names an ephemeral multiplayer hypothetical sandbox."""
    return bool(game_id and (game_id.startswith("sbx_") or game_id in PRIVATE_SANDBOXES))


def is_multiplayer_match(game_id: str) -> bool:
    """True for a game shared by several players, as opposed to a solo or saved sandbox.

    A game that lacks its summary counts as one, so its orders stay masked.
    """
    summary = GAME_SUMMARIES.get(game_id)
    if summary:
        return not summary.is_sandbox
    return lacks_summary(game_id)


def adjudication_lock(game_id: str) -> asyncio.Lock:
    """The lock a phase resolution holds, so a game never has two resolving at once.

    A lock binds to the event loop it first waits on, and the server has one, so the loop is only
    recorded to let a test that starts a fresh loop get a fresh lock.
    """
    loop = asyncio.get_running_loop()
    held = ADJUDICATION_LOCKS.get(game_id)
    if held is None or held[0] is not loop:
        held = (loop, asyncio.Lock())
        ADJUDICATION_LOCKS[game_id] = held
    return held[1]


def has_unsaved_work(game_id: str) -> bool:
    """True while memory holds a change to the game, phases, or press that Supabase has not stored yet."""
    return game_id in UNSAVED_GAMES or game_id in PRESS_UNSAVED or has_unsaved_phases(game_id)


def evict_game(game_id: str) -> None:
    """Forget everything held in memory for a game, including any private sandboxes of it."""
    if game_id == DEFAULT_GAME_ID:
        return
    GAMES.pop(game_id, None)
    GAME_SUMMARIES.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)
    GAME_DB_IDS.pop(game_id, None)
    _LAST_PARTICIPANTS_SIG.pop(game_id, None)
    SANDBOX_CHECKPOINTS.pop(game_id, None)
    SANDBOX_HISTORY_CHECKPOINTS.pop(game_id, None)
    SANDBOX_BRANCHES.pop(game_id, None)
    UNSAVED_GAMES.discard(game_id)
    PRIVATE_SANDBOXES.pop(game_id, None)
    PRIVATE_SANDBOX_TURNS.pop(game_id, None)
    ADJUDICATION_LOCKS.pop(game_id, None)
    clear_phase_tracking(game_id)
    clear_press_tracking(game_id)
    for sandbox_id, (match_id, _) in list(PRIVATE_SANDBOXES.items()):
        if match_id == game_id:
            evict_game(sandbox_id)


def clear_ephemeral_sandboxes_for(game_id: str) -> None:
    """Erase all ephemeral hypothetical branches attached to `game_id`."""
    for sandbox_id, (match_id, _) in list(PRIVATE_SANDBOXES.items()):
        if match_id == game_id:
            evict_game(sandbox_id)
    SANDBOX_CHECKPOINTS[game_id] = None
    SANDBOX_HISTORY_CHECKPOINTS.pop(game_id, None)
    SANDBOX_BRANCHES.pop(game_id, None)


def sync_summary(game_id: str) -> None:
    if game_id in GAME_SUMMARIES and game_id in GAMES:
        st = GAMES[game_id]
        summary = GAME_SUMMARIES[game_id]
        summary.season = st.season
        summary.year = st.year
        summary.phase = st.phase
        summary.finalized_powers = list(st.finalized_powers)
        summary.surrendered_powers = list(st.surrendered_powers)
        summary.board = BoardPreview(
            ownership=displayed_owners(st.ownership),
            units=[
                PreviewUnit(
                    power=u.power, unit_type=u.unit_type, province=u.province, coast=u.coast
                )
                for u in st.units
                if not u.is_dislodged
            ],
        )
        clock = st.timer
        running = clock is not None and clock.stage == TimerStage.RUNNING
        summary.deadline = clock.deadline if running else None
        if st.winner:
            summary.status = "completed"
            summary.winner = st.winner
            if not summary.completed_at:
                summary.completed_at = datetime.now(timezone.utc).isoformat()
        elif summary.status == "completed":
            summary.status = "active" if len(summary.participants) >= 2 else "waiting"
            summary.winner = None
            summary.completed_at = None


async def persist_game(game_id: str) -> None:
    """Persist the game row, seat changes, and any incremental phase mutations to Supabase."""
    if not supabase.is_persistence_enabled():
        return
    if game_id == DEFAULT_GAME_ID or game_id in PRIVATE_SANDBOXES:
        return
    if game_id not in GAMES:
        return

    UNSAVED_GAMES.add(game_id)
    if game_id in SAVES_RUNNING:
        SAVES_RUNNING[game_id] = True
        return

    saved = False
    try:
        repeat = True
        while repeat:
            SAVES_RUNNING[game_id] = False
            state = GAMES.get(game_id)
            if not state:
                return
            sync_summary(game_id)
            summary = GAME_SUMMARIES.get(game_id)
            sig = _participants_signature(summary, state)
            sync_seats = summary is not None and sig != _LAST_PARTICIPANTS_SIG.get(game_id)
            phase_count = current_phase_count(game_id)

            saved = await supabase.save_game_to_db(
                game_id=game_id,
                state=state,
                summary=summary,
                passcode=GAME_PASSCODES.get(game_id),
                current_phase_index=phase_count,
                sync_participants=sync_seats,
            )
            if saved and sync_seats:
                _LAST_PARTICIPANTS_SIG[game_id] = sig
            if saved and has_unsaved_phases(game_id):
                phases_ok = await flush_phase_mutations(game_id)
                saved = saved and phases_ok
            repeat = SAVES_RUNNING[game_id]
    finally:
        SAVES_RUNNING.pop(game_id, None)
    if saved and not has_unsaved_phases(game_id):
        UNSAVED_GAMES.discard(game_id)


async def load_saved_game(game_id: str) -> LoadedGame | tuple | None:
    """Read a game from Supabase, answering 503 rather than treating a failed read as no game."""
    try:
        return await supabase.load_game_from_db(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Saved games are unavailable right now. Please try again shortly.",
        ) from ex


def cache_loaded_game(game_id: str, loaded: LoadedGame | tuple) -> GameState:
    """Hold a game read from Supabase in memory and return the copy every request must share."""
    if game_id in GAMES:
        return GAMES[game_id]
    if isinstance(loaded, LoadedGame):
        state = loaded.state
        summary = loaded.summary
        history = loaded.history
        passcode = loaded.passcode
        phase_count = loaded.phase_count
        if loaded.db_id:
            GAME_DB_IDS[game_id] = loaded.db_id
    else:
        state, summary, history, passcode = loaded
        phase_count = len(history) if history else 0

    # Options are never saved (see DERIVED_STATE_FIELDS), so rebuild them from the board.
    state.unit_options = compute_unit_options(
        state.units, state.orders, state.phase, retreats=state.retreats, winner=state.winner
    )
    GAMES[game_id] = state
    if summary:
        hydrate_summary_profiles(summary)
        GAME_SUMMARIES[game_id] = summary
        _LAST_PARTICIPANTS_SIG[game_id] = _participants_signature(summary, state)
    set_loaded_phase_state(game_id, phase_count=phase_count, history=history)
    if history:
        # Legacy packed rows loaded with inline history will migrate into game_phases on next save.
        phases_storage.PENDING_PHASE_UPSERTS[game_id] = {i: s for i, s in enumerate(history)}
        HISTORY_UNSAVED.add(game_id)
    if passcode:
        GAME_PASSCODES[game_id] = passcode
    SANDBOX_CHECKPOINTS[game_id] = None
    return state


async def resolve_game(game_id: str | None = None) -> GameState:
    gid = game_id or DEFAULT_GAME_ID
    if gid in GAMES:
        return GAMES[gid]

    if supabase.is_persistence_enabled():
        loaded = await load_saved_game(gid)
        if loaded is not None:
            return cache_loaded_game(gid, loaded)

    raise HTTPException(status_code=404, detail=f"Game '{gid}' not found.")


async def resolve_game_with_summary(
    game_id: str | None = None,
) -> tuple[GameState, MultiplayerGameSummary]:
    """Resolve a game and its lobby summary, raising 404 if either is missing."""
    game = await resolve_game(game_id)
    summary = GAME_SUMMARIES.get(game.game_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"Game lobby '{game.game_id}' not found.")
    return game, summary


async def delete_game_everywhere(game_id: str) -> None:
    """Evict a game from memory and remove its persisted row from Supabase if enabled."""
    evict_game(game_id)
    if supabase.is_persistence_enabled():
        await supabase.delete_game_from_db(game_id)


def check_game_capacity() -> None:
    """Protect against resource exhaustion and unbounded room creation."""
    if len(GAMES) >= MAX_ACTIVE_GAMES:
        for sbx_id in list(PRIVATE_SANDBOXES.keys()):
            evict_game(sbx_id)
        if len(GAMES) >= MAX_ACTIVE_GAMES:
            for gid, s in list(GAME_SUMMARIES.items()):
                if s.is_draft:
                    evict_game(gid)
        if len(GAMES) >= MAX_ACTIVE_GAMES:
            for gid, s in list(GAME_SUMMARIES.items()):
                if s.status == "completed" and not has_unsaved_work(gid):
                    evict_game(gid)
        if len(GAMES) >= MAX_ACTIVE_GAMES:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Server game capacity reached. Please try again later.",
            )
