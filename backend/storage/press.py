"""Where a match's press (chat) is kept: in memory per game, and in its own Supabase column.

Press lives in `GAME_PRESS`, not in `GameState`, and is saved to the `press` column of the game's
`multiplayer_games` row by its own write. A game save never touches that column and a press save
never touches the board, so neither can overwrite the other with an older copy.
"""

import logging
from typing import Any
from urllib.parse import quote

import httpx
from domain.press import PressMessage
from storage import supabase
from storage.store import (
    DEFAULT_GAME_ID,
    GAME_PRESS,
    GAMES,
    PRESS_UNSAVED,
    PRIVATE_SANDBOXES,
    UNSAVED_GAMES,
    persist_game,
)
from storage.supabase import SupabaseUnavailable

logger = logging.getLogger("diplomacy.server")

# The oldest messages are dropped past this, so a game's row cannot grow without limit.
MAX_PRESS_MESSAGES = 2000

_PRESS_SAVES_RUNNING: dict[str, bool] = {}
_missing_column_logged = False


def _is_saved_game(game_id: str) -> bool:
    return (
        supabase.is_persistence_enabled()
        and game_id != DEFAULT_GAME_ID
        and game_id not in PRIVATE_SANDBOXES
        and supabase.is_valid_room_code(game_id)
    )


def _press_url(game_id: str) -> str:
    return (
        f"{supabase.get_supabase_url()}/rest/v1/multiplayer_games"
        f"?room_code=eq.{quote(game_id, safe='')}"
    )


def _log_missing_column(detail: str) -> None:
    global _missing_column_logged
    if not _missing_column_logged:
        _missing_column_logged = True
        logger.warning(
            "multiplayer_games has no usable 'press' column, so press is kept in memory only. "
            "Apply the press migration. Supabase said: %s",
            detail,
        )


async def load_press_from_db(
    game_id: str, client: httpx.AsyncClient | None = None
) -> list[PressMessage]:
    """
    The saved press of a game, oldest first. Empty if the game has no row or no press yet.
    Raises SupabaseUnavailable if the read fails, which says nothing about what is saved.
    """
    url = f"{_press_url(game_id)}&select=press"
    headers = supabase.get_headers()
    try:
        if client:
            resp = await client.get(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(url, headers=headers, timeout=10.0)
    except Exception as ex:
        raise SupabaseUnavailable(str(ex)) from ex

    if resp.status_code == 400:
        # The column does not exist (the migration has not run), so nothing is saved to lose.
        _log_missing_column(resp.text)
        return []
    if resp.status_code != 200:
        raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
    rows = resp.json()
    if not isinstance(rows, list):
        raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
    if not rows or not isinstance(rows[0].get("press"), list):
        return []

    messages: list[PressMessage] = []
    for raw in rows[0]["press"]:
        try:
            messages.append(PressMessage.model_validate(raw))
        except Exception as ex:
            logger.debug("Skipping unparseable press message for %s: %s", game_id, ex)
    return messages


async def save_press_to_db(
    game_id: str, messages: list[PressMessage], client: httpx.AsyncClient | None = None
) -> bool:
    """Write a game's whole press to its row. False if it was not saved (no row, or a failure)."""
    payload: dict[str, Any] = {"press": [m.model_dump(mode="json") for m in messages]}
    headers = supabase.get_headers()
    # Ask for the row back: an update that matches no row also answers 2xx.
    headers["Prefer"] = "return=representation"
    url = f"{_press_url(game_id)}&select=room_code"
    try:
        if client:
            resp = await client.patch(url, headers=headers, json=payload, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.patch(url, headers=headers, json=payload, timeout=10.0)
    except Exception as ex:
        logger.warning("Supabase exception saving press for '%s': %s", game_id, ex)
        return False

    if resp.status_code == 400:
        _log_missing_column(resp.text)
        return False
    if resp.status_code not in (200, 201):
        logger.warning(
            "Supabase press save failed for '%s': HTTP %d %s", game_id, resp.status_code, resp.text
        )
        return False
    try:
        return bool(resp.json())
    except ValueError:
        return False


async def press_of(game_id: str) -> list[PressMessage]:
    """
    The live list of a loaded game's press, read from Supabase the first time it is asked for.
    Raises SupabaseUnavailable rather than answering with an empty list when that read fails:
    the next save would otherwise overwrite the saved press with the empty one.
    """
    if game_id not in GAME_PRESS:
        saved = await load_press_from_db(game_id) if _is_saved_game(game_id) else []
        # Another request may have loaded (and added to) the list while this one was reading.
        GAME_PRESS.setdefault(game_id, saved)
    return GAME_PRESS[game_id]


def add_press(game_id: str, message: PressMessage) -> None:
    """Append to a game's press. The caller has already read it with `press_of`."""
    messages = GAME_PRESS.setdefault(game_id, [])
    messages.append(message)
    if len(messages) > MAX_PRESS_MESSAGES:
        del messages[: len(messages) - MAX_PRESS_MESSAGES]


def next_press_seq(game_id: str) -> int:
    messages = GAME_PRESS.get(game_id) or []
    return messages[-1].seq + 1 if messages else 1


async def persist_press(game_id: str) -> None:
    """Save a game's press. A failed save is retried by the next one."""
    if not _is_saved_game(game_id) or game_id not in GAMES:
        return
    PRESS_UNSAVED.add(game_id)
    if game_id in _PRESS_SAVES_RUNNING:
        # A save is on its way with an older list: have it go round again.
        _PRESS_SAVES_RUNNING[game_id] = True
        return

    saved = False
    try:
        repeat = True
        while repeat:
            _PRESS_SAVES_RUNNING[game_id] = False
            if game_id in UNSAVED_GAMES:
                # The game may have no row yet, and a press write cannot create one.
                await persist_game(game_id)
            messages = GAME_PRESS.get(game_id)
            if messages is None:
                return
            saved = await save_press_to_db(game_id, list(messages))
            repeat = _PRESS_SAVES_RUNNING[game_id]
    finally:
        _PRESS_SAVES_RUNNING.pop(game_id, None)
    if saved:
        PRESS_UNSAVED.discard(game_id)
