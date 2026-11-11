import logging

from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from engine.reachability import compute_unit_options
from fastapi import HTTPException, status
from storage import supabase
from storage.supabase import SupabaseUnavailable

logger = logging.getLogger("diplomacy.server")


DEFAULT_GAME_ID = "proto_1901"
MAX_ACTIVE_GAMES = 250

GAMES: dict[str, GameState] = {}
SANDBOX_CHECKPOINTS: dict[str, GameState | None] = {DEFAULT_GAME_ID: None}
# The history a solo sandbox started from. Leaving the sandbox puts it back, so turns played
# hypothetically never show up as real ones or become a rollback target.
SANDBOX_HISTORY_CHECKPOINTS: dict[str, list[GameState]] = {}
GAME_HISTORY: dict[str, list[GameState]] = {DEFAULT_GAME_ID: []}
GAME_SUMMARIES: dict[str, MultiplayerGameSummary] = {}
GAME_PASSCODES: dict[str, str] = {}
UNSAVED_GAMES: set[str] = set()
SAVES_RUNNING: dict[str, bool] = {}
HISTORY_UNSAVED: set[str] = set()
PRIVATE_SANDBOXES: dict[str, tuple[str, Power]] = {}


def init_default_game() -> None:
    if DEFAULT_GAME_ID not in GAMES:
        from scenarios.presets import build_scenario

        GAMES[DEFAULT_GAME_ID] = build_scenario("standard_1901", Power.FRANCE, DEFAULT_GAME_ID)


init_default_game()


def is_multiplayer_match(game_id: str) -> bool:
    """True for a game shared by several players, as opposed to a solo or saved sandbox."""
    summary = GAME_SUMMARIES.get(game_id)
    return bool(summary and not summary.is_sandbox)


def evict_game(game_id: str) -> None:
    """Forget everything held in memory for a game, including any private sandboxes of it."""
    if game_id == DEFAULT_GAME_ID:
        return
    GAMES.pop(game_id, None)
    GAME_SUMMARIES.pop(game_id, None)
    GAME_HISTORY.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)
    SANDBOX_CHECKPOINTS.pop(game_id, None)
    SANDBOX_HISTORY_CHECKPOINTS.pop(game_id, None)
    UNSAVED_GAMES.discard(game_id)
    HISTORY_UNSAVED.discard(game_id)
    PRIVATE_SANDBOXES.pop(game_id, None)
    for sandbox_id, (match_id, _) in list(PRIVATE_SANDBOXES.items()):
        if match_id == game_id:
            evict_game(sandbox_id)


def sync_summary(game_id: str) -> None:
    if game_id in GAME_SUMMARIES and game_id in GAMES:
        st = GAMES[game_id]
        summary = GAME_SUMMARIES[game_id]
        summary.season = st.season
        summary.year = st.year
        summary.phase = st.phase
        summary.finalized_powers = list(st.finalized_powers)
        summary.surrendered_powers = list(st.surrendered_powers)
        if st.winner:
            summary.status = "completed"
        elif summary.status == "completed":
            summary.status = "active" if len(summary.participants) >= 2 else "waiting"


async def persist_game(game_id: str) -> None:
    """Persist the specified game to Supabase PostgreSQL if configured."""
    if not supabase.is_persistence_enabled():
        return
    if game_id in (DEFAULT_GAME_ID, "proto_1901") or game_id in PRIVATE_SANDBOXES:
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
            send_history = game_id in HISTORY_UNSAVED
            HISTORY_UNSAVED.discard(game_id)
            saved = await supabase.save_game_to_db(
                game_id=game_id,
                state=state,
                summary=GAME_SUMMARIES.get(game_id),
                history=GAME_HISTORY.get(game_id, []) if send_history else None,
                passcode=GAME_PASSCODES.get(game_id),
            )
            if send_history and not saved:
                HISTORY_UNSAVED.add(game_id)
            repeat = SAVES_RUNNING[game_id]
    finally:
        SAVES_RUNNING.pop(game_id, None)
    if saved:
        UNSAVED_GAMES.discard(game_id)


async def load_saved_game(game_id: str) -> tuple | None:
    """Read a game from Supabase, answering 503 rather than treating a failed read as no game."""
    try:
        return await supabase.load_game_from_db(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Saved games are unavailable right now. Please try again shortly.",
        ) from ex


def cache_loaded_game(game_id: str, loaded: tuple) -> GameState:
    """Hold a game read from Supabase in memory and return the copy every request must share."""
    if game_id in GAMES:
        return GAMES[game_id]
    state, summary, history, passcode = loaded
    # Options are never saved (see DERIVED_STATE_FIELDS), so rebuild them from the board.
    state.unit_options = compute_unit_options(
        state.units, state.orders, state.phase, retreats=state.retreats, winner=state.winner
    )
    GAMES[game_id] = state
    if summary:
        GAME_SUMMARIES[game_id] = summary
    if history:
        GAME_HISTORY[game_id] = history
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
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Server game capacity reached. Please try again later.",
            )
