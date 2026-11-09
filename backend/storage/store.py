import logging
from typing import Any

from fastapi import HTTPException, status

try:
    from backend.domain.models import (
        GameState,
        MultiplayerGameSummary,
        Power,
    )
    from backend.storage.supabase import (
        SupabaseUnavailable,
        is_persistence_enabled,
        load_game_from_db,
        save_game_to_db,
    )
except ModuleNotFoundError:
    from domain.models import (
        GameState,
        MultiplayerGameSummary,
        Power,
    )
    from storage.supabase import (
        SupabaseUnavailable,
        is_persistence_enabled,
        load_game_from_db,
        save_game_to_db,
    )

logger = logging.getLogger("diplomacy.server")


def get_main_attr(name: str, fallback: Any) -> Any:
    """Return attribute from sys.modules['main'] if monkeypatched by tests, else fallback."""
    import sys

    main_mod = sys.modules.get("main")
    if main_mod is not None:
        return getattr(main_mod, name, fallback)
    return fallback


DEFAULT_GAME_ID = "proto_1901"
MAX_ACTIVE_GAMES = 250

GAMES: dict[str, GameState] = {}
SANDBOX_CHECKPOINTS: dict[str, GameState | None] = {DEFAULT_GAME_ID: None}
GAME_HISTORY: dict[str, list[GameState]] = {DEFAULT_GAME_ID: []}
GAME_SUMMARIES: dict[str, MultiplayerGameSummary] = {}
GAME_PASSCODES: dict[str, str] = {}
UNSAVED_GAMES: set[str] = set()
SAVES_RUNNING: dict[str, bool] = {}
HISTORY_UNSAVED: set[str] = set()
PRIVATE_SANDBOXES: dict[str, tuple[str, Power]] = {}


def init_default_game() -> None:
    if DEFAULT_GAME_ID not in GAMES:
        try:
            from backend.scenarios.presets import build_scenario
        except ModuleNotFoundError:
            from scenarios.presets import build_scenario
        GAMES[DEFAULT_GAME_ID] = build_scenario("standard_1901", Power.FRANCE, DEFAULT_GAME_ID)


init_default_game()


def is_multiplayer_match(game_id: str) -> bool:
    """True for a game shared by several players, as opposed to a solo or saved sandbox."""
    summaries = get_main_attr("GAME_SUMMARIES", GAME_SUMMARIES)
    summary = summaries.get(game_id)
    return bool(summary and not summary.is_sandbox)


def evict_game(game_id: str) -> None:
    """Forget everything held in memory for a game, including any private sandboxes of it."""
    if game_id == DEFAULT_GAME_ID:
        return
    games = get_main_attr("GAMES", GAMES)
    summaries = get_main_attr("GAME_SUMMARIES", GAME_SUMMARIES)
    games.pop(game_id, None)
    summaries.pop(game_id, None)
    GAME_HISTORY.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)
    SANDBOX_CHECKPOINTS.pop(game_id, None)
    UNSAVED_GAMES.discard(game_id)
    HISTORY_UNSAVED.discard(game_id)
    PRIVATE_SANDBOXES.pop(game_id, None)
    for sandbox_id, (match_id, _) in list(PRIVATE_SANDBOXES.items()):
        if match_id == game_id:
            evict_game(sandbox_id)


def sync_summary(game_id: str) -> None:
    summaries = get_main_attr("GAME_SUMMARIES", GAME_SUMMARIES)
    games = get_main_attr("GAMES", GAMES)
    if game_id in summaries and game_id in games:
        st = games[game_id]
        summary = summaries[game_id]
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
    is_persist_fn = get_main_attr("is_persistence_enabled", is_persistence_enabled)
    if not is_persist_fn():
        return
    if game_id in (DEFAULT_GAME_ID, "proto_1901") or game_id in PRIVATE_SANDBOXES:
        return
    games = get_main_attr("GAMES", GAMES)
    if game_id not in games:
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
            state = games.get(game_id)
            if not state:
                return
            sync_summary(game_id)
            send_history = game_id in HISTORY_UNSAVED
            HISTORY_UNSAVED.discard(game_id)
            save_fn = get_main_attr("save_game_to_db", save_game_to_db)
            summaries = get_main_attr("GAME_SUMMARIES", GAME_SUMMARIES)
            saved = await save_fn(
                game_id=game_id,
                state=state,
                summary=summaries.get(game_id),
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
    load_fn = get_main_attr("load_game_from_db", load_game_from_db)
    try:
        return await load_fn(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Saved games are unavailable right now. Please try again shortly.",
        ) from ex


def cache_loaded_game(game_id: str, loaded: tuple) -> GameState:
    """Hold a game read from Supabase in memory and return the copy every request must share."""
    games = get_main_attr("GAMES", GAMES)
    if game_id in games:
        return games[game_id]
    state, summary, history, passcode = loaded
    games[game_id] = state
    summaries = get_main_attr("GAME_SUMMARIES", GAME_SUMMARIES)
    if summary:
        summaries[game_id] = summary
    if history:
        GAME_HISTORY[game_id] = history
        HISTORY_UNSAVED.add(game_id)
    if passcode:
        GAME_PASSCODES[game_id] = passcode
    SANDBOX_CHECKPOINTS[game_id] = None
    return state


async def resolve_game(game_id: str | None = None) -> GameState:
    gid = game_id or DEFAULT_GAME_ID
    games = get_main_attr("GAMES", GAMES)
    if gid in games:
        return games[gid]

    is_persist_fn = get_main_attr("is_persistence_enabled", is_persistence_enabled)
    if is_persist_fn():
        load_saved_fn = get_main_attr("load_saved_game", load_saved_game)
        loaded = await load_saved_fn(gid)
        if loaded is not None:
            return cache_loaded_game(gid, loaded)

    raise HTTPException(status_code=404, detail=f"Game '{gid}' not found.")


def check_game_capacity() -> None:
    """Protect against resource exhaustion and unbounded room creation."""
    games = get_main_attr("GAMES", GAMES)
    if len(games) >= MAX_ACTIVE_GAMES:
        for sbx_id in list(PRIVATE_SANDBOXES.keys()):
            evict_game(sbx_id)
        games = get_main_attr("GAMES", GAMES)
        if len(games) >= MAX_ACTIVE_GAMES:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Server game capacity reached. Please try again later.",
            )
