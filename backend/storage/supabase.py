import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary

logger = logging.getLogger("diplomacy.database")

ROOM_CODE_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# Rebuilt from the board whenever a game loads, so saving them would only bloat every row.
DERIVED_STATE_FIELDS = {"unit_options"}


def is_valid_room_code(code: str | None) -> bool:
    """Verify that a game_id / room_code conforms to safe alphanumeric syntax."""
    if not code:
        return False
    return bool(ROOM_CODE_REGEX.match(code))


class SupabaseUnavailable(Exception):
    """Supabase gave no usable answer, so nothing can be concluded about what it holds."""


# What the lobby reads for each game. Leaving out the state and history keeps a refresh small, and
# the packed summary arrives as the row's `summary`, which build_summary_from_row accepts.
LOBBY_COLUMNS = (
    "room_code,name,status,winner,completed_at,phase,season,year,created_at,"
    "host_user_id,is_sandbox,is_private,summary:game_state->summary"
)

# Status mapping between Application and Database check constraint
APP_TO_DB_STATUS = {
    "waiting": "lobby",
    "active": "in_progress",
    "completed": "completed",
    "lobby": "lobby",
    "in_progress": "in_progress",
}

DB_TO_APP_STATUS = {
    "lobby": "waiting",
    "in_progress": "active",
    "completed": "completed",
    "waiting": "waiting",
    "active": "active",
}


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


def is_valid_uuid(val: str | None) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False


def get_headers() -> dict[str, str]:
    key = get_supabase_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def to_db_status(app_status: str) -> str:
    return APP_TO_DB_STATUS.get(app_status, "lobby")


def to_app_status(db_status: str) -> str:
    return DB_TO_APP_STATUS.get(db_status, "waiting")


def build_summary_from_row(row: dict[str, Any]) -> MultiplayerGameSummary:
    room_code = row.get("room_code", "")
    raw_state_blob = row.get("game_state") or {}

    # 1. If full summary was packed in game_state, deserialize it
    if isinstance(raw_state_blob, dict) and raw_state_blob.get("summary"):
        try:
            return MultiplayerGameSummary.model_validate(raw_state_blob["summary"])
        except Exception as ex:
            logger.debug("Could not deserialize packed summary for %s: %s", room_code, ex)

    # 2. If row has dedicated summary column
    if row.get("summary") and isinstance(row["summary"], dict) and row["summary"]:
        try:
            return MultiplayerGameSummary.model_validate(row["summary"])
        except Exception as ex:
            logger.debug("Could not deserialize row.summary for %s: %s", room_code, ex)

    # 3. Fallback: construct summary from top-level columns
    raw_status = row.get("status", "lobby")
    app_status = to_app_status(raw_status)
    created_at = row.get("created_at") or datetime.now(timezone.utc).isoformat()
    raw_winner = row.get("winner")
    parsed_winner: Power | None = None
    if raw_winner:
        try:
            parsed_winner = Power(raw_winner)
        except ValueError:
            parsed_winner = None
    return MultiplayerGameSummary(
        game_id=room_code,
        name=row.get("name") or f"Match {room_code}",
        status=app_status,
        winner=parsed_winner,
        completed_at=row.get("completed_at"),
        season=row.get("season", "Spring"),
        year=int(row.get("year", 1901)),
        phase=row.get("phase", "Movement"),
        created_by="",
        creator_id=str(row.get("host_user_id")) if row.get("host_user_id") else None,
        created_at=created_at,
        participants={},
        finalized_powers=[],
        is_sandbox=bool(row.get("is_sandbox", False)),
        is_draft=bool(row.get("is_draft", False)),
        is_private=bool(row.get("is_private", False)),
        has_passcode=bool(row.get("passcode")),
    )


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
        if client:
            resp = await client.get(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
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

    async def read_rows(columns: str) -> httpx.Response:
        url = f"{get_supabase_url()}/rest/v1/multiplayer_games?select={columns}"
        if client:
            return await client.get(url, headers=headers, timeout=10.0)
        async with httpx.AsyncClient() as c:
            return await c.get(url, headers=headers, timeout=10.0)

    try:
        resp = await read_rows(LOBBY_COLUMNS)
        if resp.status_code == 400:
            # A slow lobby is better than an empty one if Supabase refuses the narrower query.
            logger.warning("Supabase refused the lobby columns, reading whole rows: %s", resp.text)
            resp = await read_rows("*")

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


def _serialize_summary_for_db(summary: MultiplayerGameSummary) -> dict[str, Any]:
    """Strip denormalized names from registered (UUID) users; public.profiles is authoritative."""
    data = summary.model_dump(mode="json")
    if is_valid_uuid(data.get("creator_id")):
        data.pop("created_by", None)
    participants = data.get("participants")
    if isinstance(participants, dict):
        for part in participants.values():
            if isinstance(part, dict) and is_valid_uuid(part.get("user_id")):
                part.pop("display_name", None)
    return data


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
        "summary": summary.model_dump(mode="json") if summary else None,
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
        if client:
            resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
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
        if client:
            resp = await client.delete(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
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
        if client:
            resp = await client.get(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
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
        if client:
            resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.post(url, headers=headers, json=payload, timeout=10.0)

        if resp.status_code in (200, 201, 204):
            return True

        logger.warning("Supabase profile upsert failed: HTTP %d %s", resp.status_code, resp.text)
        return False

    except Exception as ex:
        logger.warning("Supabase exception upserting profile: %s", ex)
        return False
