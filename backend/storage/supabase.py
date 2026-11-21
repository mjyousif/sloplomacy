import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from domain.ids import DEFAULT_GAME_ID
from telemetry import record_supabase_query

logger = logging.getLogger("diplomacy.database")

_HTTP_CLIENT: httpx.AsyncClient | None = None
_HTTP_CLIENT_LOOP: asyncio.AbstractEventLoop | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a shared pooled AsyncClient bound to the current running event loop."""
    global _HTTP_CLIENT, _HTTP_CLIENT_LOOP
    loop = asyncio.get_running_loop()
    if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed or _HTTP_CLIENT_LOOP is not loop:
        _HTTP_CLIENT = httpx.AsyncClient(
            timeout=10.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
        _HTTP_CLIENT_LOOP = loop
    return _HTTP_CLIENT


async def close_http_client() -> None:
    """Close the shared Supabase HTTP client (called on app shutdown)."""
    global _HTTP_CLIENT, _HTTP_CLIENT_LOOP
    client = _HTTP_CLIENT
    loop = _HTTP_CLIENT_LOOP
    _HTTP_CLIENT = None
    _HTTP_CLIENT_LOOP = None
    if client is not None and not client.is_closed:
        try:
            if loop is asyncio.get_running_loop():
                await client.aclose()
        except RuntimeError:
            pass


ROOM_CODE_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# Rebuilt from the board whenever a game loads, so saving them would only bloat every row.
# Rebuilt from the board on refresh and for every viewer, never saved.
DERIVED_STATE_FIELDS = {"unit_options", "preview"}


def is_valid_room_code(code: str | None) -> bool:
    """Verify that a game_id / room_code conforms to safe alphanumeric syntax."""
    return bool(code and ROOM_CODE_REGEX.match(code))


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
    """Return the Postgres role for a Supabase API key (prefix or JWT `role` claim)."""
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
    """Return the service_role key or "" (never the anon key, which RLS gives zero rows)."""
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
    url, key = get_supabase_url(), get_supabase_key()
    return bool(url and key and "your-project-ref" not in url and "your-supabase" not in url)


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
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _elapsed_ms(start_time: float) -> float:
    return (time.perf_counter() - start_time) * 1000.0


async def _execute_http(
    method: str,
    url: str,
    headers: dict[str, str],
    client: httpx.AsyncClient | None = None,
    json_payload: Any = None,
) -> httpx.Response:
    kwargs: dict[str, Any] = {"headers": headers, "timeout": 10.0}
    if json_payload is not None:
        kwargs["json"] = json_payload
    c = client or get_http_client()
    return await getattr(c, method)(url, **kwargs)


async def _execute_write_op(
    operation: str,
    method: str,
    url: str,
    headers: dict[str, str],
    ok_codes: tuple[int, ...],
    label: str,
    client: httpx.AsyncClient | None = None,
    json_payload: Any = None,
) -> bool:
    """Execute a Supabase write/delete HTTP request and record telemetry."""
    start = time.perf_counter()
    try:
        resp = await _execute_http(method, url, headers, client=client, json_payload=json_payload)
        if resp.status_code in ok_codes:
            record_supabase_query(operation, "ok", resp.status_code, _elapsed_ms(start))
            logger.debug("Supabase %s succeeded.", label)
            return True
        record_supabase_query(operation, "error", resp.status_code, _elapsed_ms(start))
        logger.warning("Supabase %s failed: HTTP %d %s", label, resp.status_code, resp.text)
        return False
    except Exception as ex:
        record_supabase_query(operation, "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception during %s: %s", label, ex)
        return False


def to_db_status(app_status: str) -> str:
    return APP_TO_DB_STATUS.get(app_status, "lobby")


def to_app_status(db_status: str) -> str:
    return DB_TO_APP_STATUS.get(db_status, "waiting")


def build_summary_from_row(row: dict[str, Any]) -> MultiplayerGameSummary | None:
    """The summary a row stores, or one built from its plain columns for a row that has none.

    Returns None when the row stores a summary that cannot be read. The columns are no fallback
    for that case: a save never writes `is_private`, `passcode` or the seats to them, so a summary
    built from them would be a public, passcode-less game with nobody seated. An unreadable summary
    means the game is unavailable, never that it is open.
    """
    room_code = row.get("room_code", "")
    raw_blob = row.get("game_state") or {}
    packed = raw_blob.get("summary") if isinstance(raw_blob, dict) else None
    stored = False
    for candidate in (packed, row.get("summary")):
        if isinstance(candidate, dict) and candidate:
            stored = True
            try:
                return MultiplayerGameSummary.model_validate(candidate)
            except Exception as ex:
                logger.warning(
                    "Stored summary of '%s' is unreadable, so the game is withheld: %s",
                    room_code,
                    ex,
                )
    if stored:
        return None

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
        status=to_app_status(row.get("status", "lobby")),
        winner=parsed_winner,
        completed_at=row.get("completed_at"),
        season=row.get("season", "Spring"),
        year=int(row.get("year", 1901)),
        phase=row.get("phase", "Movement"),
        created_by="",
        creator_id=str(row.get("host_user_id")) if row.get("host_user_id") else None,
        created_at=row.get("created_at") or datetime.now(timezone.utc).isoformat(),
        participants={},
        finalized_powers=[],
        is_sandbox=bool(row.get("is_sandbox", False)),
        is_draft=bool(row.get("is_draft", False)),
        is_private=bool(row.get("is_private", False)),
        has_passcode=bool(row.get("passcode")),
    )


async def load_game_from_db(
    game_id: str, client: httpx.AsyncClient | None = None
) -> tuple[GameState, MultiplayerGameSummary | None, list[GameState], str | None] | None:
    """Load game tuple from Supabase by room_code, or None; raise SupabaseUnavailable on error."""
    if not is_persistence_enabled() or not is_valid_room_code(game_id):
        return None

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{quote(game_id, safe='')}&select=*"
    start, status_code = time.perf_counter(), 0

    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        status_code = resp.status_code
        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        if not rows:
            record_supabase_query("load_game", "not_found", status_code, _elapsed_ms(start))
            return None

        row = rows[0]
        raw_gs = row.get("game_state", {})
        packed = isinstance(raw_gs, dict) and "state" in raw_gs
        state_data = raw_gs["state"] if packed else raw_gs
        history_data = row.get("history") or (raw_gs.get("history") if packed else None) or []
        passcode = (raw_gs.get("passcode") if packed else None) or row.get("passcode")

        state = GameState.model_validate(state_data)
        if row.get("state_revision") is not None:
            state.state_revision = max(state.state_revision, int(row["state_revision"]))

        summary = build_summary_from_row(row)
        if summary is None:
            raise SupabaseUnavailable(f"The stored summary of '{game_id}' is unreadable.")

        history: list[GameState] = []
        if isinstance(history_data, list):
            for h in history_data:
                try:
                    history.append(GameState.model_validate(h))
                except Exception as ex:
                    logger.debug("Skipping unparseable history entry for %s: %s", game_id, ex)

        record_supabase_query("load_game", "ok", status_code, _elapsed_ms(start))
        return (state, summary, history, passcode)

    except Exception as ex:
        record_supabase_query("load_game", "error", status_code, _elapsed_ms(start))
        logger.warning("Supabase exception loading game '%s': %s", game_id, ex)
        raise SupabaseUnavailable(str(ex)) from ex


async def load_all_summaries_from_db(
    client: httpx.AsyncClient | None = None,
) -> dict[str, MultiplayerGameSummary | None]:
    """Fetch all game summaries from Supabase; raise SupabaseUnavailable on error.

    A row whose stored summary cannot be read maps to None: the game exists but is withheld, so
    the lobby neither lists it nor takes it for a deleted game.
    """
    if not is_persistence_enabled():
        return {}

    headers, summaries = get_headers(), {}
    start, status_code = time.perf_counter(), 0

    base_url = f"{get_supabase_url()}/rest/v1/multiplayer_games?select="
    try:
        resp = await _execute_http("get", f"{base_url}{LOBBY_COLUMNS}", headers, client=client)
        status_code = resp.status_code
        if resp.status_code == 400:
            # A slow lobby is better than an empty one if Supabase refuses the narrower query.
            logger.warning("Supabase refused the lobby columns, reading whole rows: %s", resp.text)
            resp = await _execute_http("get", f"{base_url}*", headers, client=client)
            status_code = resp.status_code
        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        for row in rows:
            room_code = row.get("room_code")
            if room_code and room_code != DEFAULT_GAME_ID:
                summaries[room_code] = build_summary_from_row(row)
        record_supabase_query("load_summaries", "ok", status_code, _elapsed_ms(start))
        return summaries

    except Exception as ex:
        record_supabase_query("load_summaries", "error", status_code, _elapsed_ms(start))
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
    """Persist game state, metadata, and history into Supabase (upsert on room_code)."""
    if (
        not is_persistence_enabled()
        or game_id == DEFAULT_GAME_ID
        or not is_valid_room_code(game_id)
    ):
        return False

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?on_conflict=room_code"
    headers = {**get_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    serialized_summary = _serialize_summary_for_db(summary) if summary else None
    payload: dict[str, Any] = {
        "room_code": game_id,
        "name": (summary.name if summary and summary.name else f"Match {game_id}").strip(),
        "status": to_db_status(summary.status if summary else "waiting"),
        "winner": state.winner.value if state.winner else None,
        "completed_at": summary.completed_at if summary else None,
        "phase": state.phase,
        "season": state.season,
        "year": state.year,
        "summary": serialized_summary,
        "game_state": {
            "state": state.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS),
            "summary": serialized_summary,
            "passcode": passcode,
        },
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if history is not None:
        payload["history"] = [
            h.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS) for h in history
        ]
    if summary and is_valid_uuid(summary.creator_id):
        payload["host_user_id"] = summary.creator_id

    return await _execute_write_op(
        "save_game",
        "post",
        url,
        headers,
        (200, 201, 204),
        f"save for '{game_id}'",
        client=client,
        json_payload=payload,
    )


async def delete_game_from_db(game_id: str, client: httpx.AsyncClient | None = None) -> bool:
    """Delete a game room from Supabase PostgreSQL."""
    if not is_persistence_enabled() or not is_valid_room_code(game_id):
        return False
    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{quote(game_id, safe='')}"
    return await _execute_write_op(
        "delete_game",
        "delete",
        url,
        get_headers(),
        (200, 204),
        f"delete for '{game_id}'",
        client=client,
    )


async def load_profile_names_from_db(client: httpx.AsyncClient | None = None) -> dict[str, str]:
    """Load user_id -> display_name mappings from public.profiles."""
    if not is_persistence_enabled():
        return {}

    url = f"{get_supabase_url()}/rest/v1/profiles?select=id,display_name"
    start = time.perf_counter()
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        if resp.status_code != 200:
            record_supabase_query("load_profiles", "error", resp.status_code, _elapsed_ms(start))
            logger.warning("Supabase profiles read failed: HTTP %d %s", resp.status_code, resp.text)
            return {}
        rows = resp.json()
        if not isinstance(rows, list):
            record_supabase_query("load_profiles", "error", resp.status_code, _elapsed_ms(start))
            return {}
        profiles = {
            str(r["id"]): (r.get("display_name") or "").strip()
            for r in rows
            if r.get("id") and (r.get("display_name") or "").strip()
        }
        record_supabase_query("load_profiles", "ok", resp.status_code, _elapsed_ms(start))
        return profiles
    except Exception as ex:
        record_supabase_query("load_profiles", "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception loading profiles: %s", ex)
        return {}


async def upsert_profile_display_name(
    user_id: str, display_name: str, client: httpx.AsyncClient | None = None
) -> bool:
    """Persist a user's display_name into public.profiles."""
    if not is_persistence_enabled() or not is_valid_uuid(user_id):
        return False
    url = f"{get_supabase_url()}/rest/v1/profiles?on_conflict=id"
    headers = {**get_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    payload = {
        "id": user_id,
        "display_name": display_name,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return await _execute_write_op(
        "upsert_profile",
        "post",
        url,
        headers,
        (200, 201, 204),
        "profile upsert",
        client=client,
        json_payload=payload,
    )
