import base64
import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from domain.game_state import GameState, MultiplayerGameSummary
from storage.supabase_rows import (
    APP_TO_DB_STATUS as APP_TO_DB_STATUS,
)
from storage.supabase_rows import (
    DB_TO_APP_STATUS as DB_TO_APP_STATUS,
)
from storage.supabase_rows import (
    DERIVED_STATE_FIELDS as DERIVED_STATE_FIELDS,
)
from storage.supabase_rows import (
    LOBBY_COLUMNS as LOBBY_COLUMNS,
)
from storage.supabase_rows import (
    ROOM_CODE_REGEX as ROOM_CODE_REGEX,
)
from storage.supabase_rows import (
    _serialize_summary_for_db,
    build_summary_from_row,
    is_valid_room_code,
    is_valid_uuid,
    logger,
)
from storage.supabase_rows import (
    to_app_status as to_app_status,
)
from storage.supabase_rows import (
    to_db_status as to_db_status,
)


class SupabaseUnavailable(Exception):
    """Supabase gave no usable answer, so nothing can be concluded about what it holds."""


def get_supabase_url() -> str:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").strip()
    return url.rstrip("/")


# The keys the backend has already complained about, so each problem is logged once per process
# instead of on every request.
_REJECTED_KEYS_LOGGED: set = set()


def _key_role(key: str) -> str | None:
    """
    The Postgres role a Supabase API key acts as, or None if it can't be told from the key.
    New keys say so in their prefix. Legacy keys are JWTs with a `role` claim.
    """
    if key.startswith("sb_publishable_"):
        return "anon"
    if key.startswith("sb_secret_"):
        return "service_role"
    parts = key.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, TypeError):
        return None
    role = claims.get("role") if isinstance(claims, dict) else None
    return role if isinstance(role, str) else None


def _log_rejected_key_once(reason: str, message: str) -> None:
    if reason in _REJECTED_KEYS_LOGGED:
        return
    _REJECTED_KEYS_LOGGED.add(reason)
    logger.error(message)


def get_supabase_key() -> str:
    """
    The service role key, or "" if there isn't one.

    Games are saved only with the service role key, never the anon key. RLS on multiplayer_games
    allows only service_role, so with the anon key every read succeeds with zero rows: the lobby
    sync would then take every saved game for deleted and drop it.
    """
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or ""
    ).strip()
    if not key:
        if get_supabase_url():
            _log_rejected_key_once(
                "missing",
                "SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is not. Game persistence is OFF: "
                "games live in memory only and are lost when the server restarts. The anon key is "
                "never used for persistence.",
            )
        return ""

    anon_keys = {
        (os.environ.get("VITE_SUPABASE_ANON_KEY") or "").strip(),
        (os.environ.get("SUPABASE_ANON_KEY") or "").strip(),
    } - {""}
    role = _key_role(key)
    if key in anon_keys or (role is not None and role != "service_role"):
        _log_rejected_key_once(
            "anon",
            "The Supabase key the backend was given is not a service role key "
            f"(role: {role or 'same as the anon key'}). Game persistence is OFF: RLS would give "
            "this key zero rows, and the lobby would drop every saved game. Set "
            "SUPABASE_SERVICE_ROLE_KEY to the service_role key.",
        )
        return ""
    return key


def is_persistence_enabled() -> bool:
    url = get_supabase_url()
    key = get_supabase_key()
    if not url or not key:
        return False
    if "your-project-ref" in url or "your-supabase" in url:
        return False
    return True


def get_headers() -> dict[str, str]:
    key = get_supabase_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


@asynccontextmanager
async def _http_client(client: httpx.AsyncClient | None) -> AsyncIterator[httpx.AsyncClient]:
    """Yield a caller-supplied client or open a short-lived AsyncClient."""
    if client is not None:
        yield client
        return
    async with httpx.AsyncClient() as owned_client:
        yield owned_client


async def load_game_from_db(
    game_id: str,
    client: httpx.AsyncClient | None = None,
) -> tuple[GameState, MultiplayerGameSummary | None, list[GameState], str | None] | None:
    """
    Load a game from Supabase PostgreSQL by room_code.
    Returns (state, summary, history, passcode), or None if Supabase has no such game.
    Raises SupabaseUnavailable if the read fails, which says nothing about whether the game exists.
    """
    if not is_persistence_enabled():
        return None
    if not is_valid_room_code(game_id):
        return None

    safe_gid = quote(game_id, safe="")
    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{safe_gid}&select=*"
    headers = get_headers()

    try:
        async with _http_client(client) as c:
            resp = await c.get(url, headers=headers, timeout=10.0)

        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")

        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        if not rows:
            return None

        row = rows[0]
        raw_game_state = row.get("game_state", {})

        if isinstance(raw_game_state, dict) and "state" in raw_game_state:
            state_data = raw_game_state["state"]
            summary_data = raw_game_state.get("summary") or row.get("summary")
            history_data = row.get("history") or raw_game_state.get("history") or []
            passcode = raw_game_state.get("passcode") or row.get("passcode")
        else:
            state_data = raw_game_state
            summary_data = row.get("summary")
            history_data = row.get("history") or []
            passcode = row.get("passcode")

        state = GameState.model_validate(state_data)
        if row.get("state_revision") is not None:
            state.state_revision = max(state.state_revision, int(row["state_revision"]))

        summary: MultiplayerGameSummary | None = None
        if summary_data and isinstance(summary_data, dict):
            try:
                summary = MultiplayerGameSummary.model_validate(summary_data)
            except Exception as ex:
                logger.warning("Failed to validate summary for %s: %s", game_id, ex)
        if not summary:
            summary = build_summary_from_row(row)

        history: list[GameState] = []
        if isinstance(history_data, list):
            for h in history_data:
                try:
                    history.append(GameState.model_validate(h))
                except Exception as ex:
                    logger.debug("Skipping unparseable history entry for %s: %s", game_id, ex)

        return (state, summary, history, passcode)

    except Exception as ex:
        logger.warning("Supabase exception loading game '%s': %s", game_id, ex)
        raise SupabaseUnavailable(str(ex)) from ex


async def load_all_summaries_from_db(
    client: httpx.AsyncClient | None = None,
) -> dict[str, MultiplayerGameSummary]:
    """
    Fetch all games from Supabase to warm up or synchronize lobby listings.
    Raises SupabaseUnavailable if the read fails: an empty result always means Supabase has no games.
    """
    if not is_persistence_enabled():
        return {}

    headers = get_headers()
    summaries: dict[str, MultiplayerGameSummary] = {}

    async def read_rows(c: httpx.AsyncClient, columns: str) -> httpx.Response:
        url = f"{get_supabase_url()}/rest/v1/multiplayer_games?select={columns}"
        return await c.get(url, headers=headers, timeout=10.0)

    try:
        async with _http_client(client) as c:
            resp = await read_rows(c, LOBBY_COLUMNS)
            if resp.status_code == 400:
                # A slow lobby is better than an empty one if Supabase refuses the narrower query.
                logger.warning(
                    "Supabase refused the lobby columns, reading whole rows: %s", resp.text
                )
                resp = await read_rows(c, "*")

        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")

        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        for row in rows:
            room_code = row.get("room_code")
            if room_code and room_code not in ("proto_1901", "default"):
                summaries[room_code] = build_summary_from_row(row)
        return summaries

    except Exception as ex:
        logger.warning("Supabase exception loading summaries: %s", ex)
        raise SupabaseUnavailable(str(ex)) from ex


async def save_game_to_db(
    game_id: str,
    state: GameState,
    summary: MultiplayerGameSummary | None = None,
    history: list[GameState] | None = None,
    passcode: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """
    Persist game state, metadata, and history into Supabase PostgreSQL.
    Uses PostgREST upsert on room_code, so with history=None the saved history stays as it is.
    """
    if not is_persistence_enabled():
        return False
    if game_id in ("proto_1901", "default"):
        return False
    if not is_valid_room_code(game_id):
        return False

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?on_conflict=room_code"
    headers = get_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    now_iso = datetime.now(timezone.utc).isoformat()
    app_status = summary.status if summary else "waiting"
    db_status = to_db_status(app_status)

    payload: dict[str, Any] = {
        "room_code": game_id,
        "name": (summary.name if summary and summary.name else f"Match {game_id}").strip(),
        "status": db_status,
        "winner": state.winner.value if state.winner else None,
        "completed_at": summary.completed_at if summary else None,
        "phase": state.phase,
        "season": state.season,
        "year": state.year,
        "summary": _serialize_summary_for_db(summary) if summary else None,
        "game_state": {
            "state": state.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS),
            "summary": _serialize_summary_for_db(summary) if summary else None,
            "passcode": passcode,
        },
        "updated_at": now_iso,
    }
    if history is not None:
        payload["history"] = [
            h.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS) for h in history
        ]

    if summary and is_valid_uuid(summary.creator_id):
        payload["host_user_id"] = summary.creator_id

    try:
        async with _http_client(client) as c:
            resp = await c.post(url, headers=headers, json=payload, timeout=10.0)

        if resp.status_code in (200, 201, 204):
            logger.debug("Successfully saved game '%s' to Supabase.", game_id)
            return True

        logger.warning(
            "Supabase save failed for '%s': HTTP %d %s",
            game_id,
            resp.status_code,
            resp.text,
        )
        return False

    except Exception as ex:
        logger.warning("Supabase exception saving game '%s': %s", game_id, ex)
        return False


async def delete_game_from_db(
    game_id: str,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Delete a game room from Supabase PostgreSQL."""
    if not is_persistence_enabled():
        return False
    if not is_valid_room_code(game_id):
        return False

    safe_gid = quote(game_id, safe="")
    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{safe_gid}"
    headers = get_headers()

    try:
        async with _http_client(client) as c:
            resp = await c.delete(url, headers=headers, timeout=10.0)

        if resp.status_code in (200, 204):
            logger.debug("Deleted game '%s' from Supabase.", game_id)
            return True

        logger.warning(
            "Supabase delete failed for '%s': HTTP %d %s", game_id, resp.status_code, resp.text
        )
        return False

    except Exception as ex:
        logger.warning("Supabase exception deleting game '%s': %s", game_id, ex)
        return False


async def load_profile_names_from_db(
    client: httpx.AsyncClient | None = None,
) -> dict[str, str]:
    """Load user_id -> display_name mappings from public.profiles."""
    if not is_persistence_enabled():
        return {}

    url = f"{get_supabase_url()}/rest/v1/profiles?select=id,display_name"
    headers = get_headers()

    try:
        async with _http_client(client) as c:
            resp = await c.get(url, headers=headers, timeout=10.0)

        if resp.status_code != 200:
            logger.warning("Supabase profiles read failed: HTTP %d %s", resp.status_code, resp.text)
            return {}

        rows = resp.json()
        if not isinstance(rows, list):
            return {}

        profiles: dict[str, str] = {}
        for row in rows:
            uid = row.get("id")
            name = (row.get("display_name") or "").strip()
            if uid and name:
                profiles[str(uid)] = name
        return profiles

    except Exception as ex:
        logger.warning("Supabase exception loading profiles: %s", ex)
        return {}


async def upsert_profile_display_name(
    user_id: str,
    display_name: str,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Persist a user's display_name into public.profiles."""
    if not is_persistence_enabled() or not is_valid_uuid(user_id):
        return False

    url = f"{get_supabase_url()}/rest/v1/profiles?on_conflict=id"
    headers = {
        **get_headers(),
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    payload = {
        "id": user_id,
        "display_name": display_name,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        async with _http_client(client) as c:
            resp = await c.post(url, headers=headers, json=payload, timeout=10.0)

        if resp.status_code in (200, 201, 204):
            return True

        logger.warning("Supabase profile upsert failed: HTTP %d %s", resp.status_code, resp.text)
        return False

    except Exception as ex:
        logger.warning("Supabase exception upserting profile: %s", ex)
        return False
