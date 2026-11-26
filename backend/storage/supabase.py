"""Supabase PostgREST client for normalized `multiplayer_games` and `game_participants`."""

import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary
from domain.ids import DEFAULT_GAME_ID
from storage.supabase_codec import (
    APP_TO_DB_STATUS as APP_TO_DB_STATUS,
)
from storage.supabase_codec import (
    DB_TO_APP_STATUS as DB_TO_APP_STATUS,
)
from storage.supabase_codec import (
    DERIVED_STATE_FIELDS as DERIVED_STATE_FIELDS,
)
from storage.supabase_codec import (
    LoadedGame,
    _serialize_state_for_db,
    build_summary_from_row,
    epoch_to_iso_timestamp,
    game_type_from_summary,
    is_valid_uuid,
    serialize_participant_for_rpc,
    to_app_status,
    to_db_status,
)
from storage.supabase_codec import (
    _serialize_summary_for_db as _serialize_summary_for_db,
)
from storage.supabase_http import (
    ROOM_CODE_REGEX as ROOM_CODE_REGEX,
)
from storage.supabase_http import (
    SupabaseUnavailable,
    _elapsed_ms,
    _execute_http,
    _execute_write_op,
    get_headers,
    get_supabase_url,
    is_persistence_enabled,
    is_valid_room_code,
)
from storage.supabase_http import (
    close_http_client as close_http_client,
)
from storage.supabase_http import (
    get_http_client as get_http_client,
)
from storage.supabase_http import (
    get_supabase_key as get_supabase_key,
)
from storage.supabase_http import (
    logger as logger,
)
from storage.supabase_profiles import (
    load_profile_name_from_db as load_profile_name_from_db,
)
from storage.supabase_profiles import (
    load_profile_names_from_db as load_profile_names_from_db,
)
from storage.supabase_profiles import (
    upsert_profile_display_name as upsert_profile_display_name,
)
from telemetry import record_supabase_query

# Maps app `room_code` -> Postgres `multiplayer_games.id` UUID.
GAME_DB_IDS: dict[str, str] = {}

# What the lobby reads for each game: metadata, virtual computed `has_passcode` & `board_preview`,
# and active seats via embedded FK join (filtering out soft-left former players).
LOBBY_COLUMNS = (
    "id,room_code,name,game_type,status,scenario_id,winner,"
    "host_user_id,creator_guest_id,phase,season,year,"
    "current_phase_index,state_revision,"
    "deadline,created_at,completed_at,last_moved_at,has_passcode,board_preview,"
    "game_participants(power,user_id,guest_id,guest_display_name,joined_at,"
    "surrendered,surrendered_at,game_over_seen_at,is_finalized)"
)

GAME_LOAD_COLUMNS = f"{LOBBY_COLUMNS},passcode,game_state"


async def resolve_game_db_id(game_id: str, client: httpx.AsyncClient | None = None) -> str | None:
    """Return the Postgres UUID (`multiplayer_games.id`) for `game_id` (`room_code`)."""
    cached = GAME_DB_IDS.get(game_id)
    if cached:
        return cached
    if not is_persistence_enabled() or not is_valid_room_code(game_id):
        return None

    url = (
        f"{get_supabase_url()}/rest/v1/multiplayer_games"
        f"?room_code=eq.{quote(game_id, safe='')}&select=id"
    )
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
            record_supabase_query("resolve_game_id", "not_found", status_code, _elapsed_ms(start))
            return None
        db_id = str(rows[0]["id"])
        GAME_DB_IDS[game_id] = db_id
        record_supabase_query("resolve_game_id", "ok", status_code, _elapsed_ms(start))
        return db_id
    except SupabaseUnavailable:
        record_supabase_query("resolve_game_id", "error", status_code, _elapsed_ms(start))
        raise
    except Exception as ex:
        record_supabase_query("resolve_game_id", "error", status_code, _elapsed_ms(start))
        raise SupabaseUnavailable(str(ex)) from ex


async def load_game_from_db(
    game_id: str, client: httpx.AsyncClient | None = None
) -> LoadedGame | None:
    """Load game tuple from Supabase by room_code, or None; raise SupabaseUnavailable on error."""
    if not is_persistence_enabled() or not is_valid_room_code(game_id):
        return None

    url = (
        f"{get_supabase_url()}/rest/v1/multiplayer_games"
        f"?room_code=eq.{quote(game_id, safe='')}"
        f"&select={GAME_LOAD_COLUMNS}&game_participants.left_at=is.null"
    )
    start, status_code = time.perf_counter(), 0

    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        status_code = resp.status_code
        if resp.status_code == 400:
            # Legacy schema fallback when column projections aren't migrated yet.
            fallback_url = (
                f"{get_supabase_url()}/rest/v1/multiplayer_games"
                f"?room_code=eq.{quote(game_id, safe='')}&select=*"
            )
            resp = await _execute_http("get", fallback_url, get_headers(), client=client)
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
        db_id = str(row["id"]) if row.get("id") else None
        if db_id:
            GAME_DB_IDS[game_id] = db_id

        raw_gs = row.get("game_state", {})
        packed = isinstance(raw_gs, dict) and "state" in raw_gs
        state_data = raw_gs["state"] if packed else raw_gs
        passcode = row.get("passcode") or (raw_gs.get("passcode") if packed else None)

        state = GameState.model_validate(state_data)
        if row.get("state_revision") is not None:
            state.state_revision = max(state.state_revision, int(row["state_revision"]))

        summary = build_summary_from_row(row)
        if summary is None:
            raise SupabaseUnavailable(f"The stored summary of '{game_id}' is unreadable.")
        for sp in state.surrendered_powers:
            if sp not in summary.surrendered_powers:
                summary.surrendered_powers.append(sp)

        phase_count = int(row.get("current_phase_index") or 0)
        history: list[GameState] | None = None
        legacy_hist = row.get("history") or (raw_gs.get("history") if packed else None)
        if phase_count == 0 and isinstance(legacy_hist, list) and legacy_hist:
            history = []
            for h in legacy_hist:
                try:
                    history.append(GameState.model_validate(h))
                except Exception as ex:
                    logger.debug("Skipping unparseable history entry for %s: %s", game_id, ex)
            phase_count = len(history)

        record_supabase_query("load_game", "ok", status_code, _elapsed_ms(start))
        return LoadedGame(
            state=state,
            summary=summary,
            history=history,
            passcode=passcode,
            phase_count=phase_count,
            db_id=db_id,
        )

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
    query_url = f"{base_url}{LOBBY_COLUMNS}&game_participants.left_at=is.null"
    try:
        resp = await _execute_http("get", query_url, headers, client=client)
        status_code = resp.status_code
        if resp.status_code == 400:
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
                if row.get("id"):
                    GAME_DB_IDS[room_code] = str(row["id"])
                summaries[room_code] = build_summary_from_row(row)
        record_supabase_query("load_summaries", "ok", status_code, _elapsed_ms(start))
        return summaries

    except Exception as ex:
        record_supabase_query("load_summaries", "error", status_code, _elapsed_ms(start))
        logger.warning("Supabase exception loading summaries: %s", ex)
        raise SupabaseUnavailable(str(ex)) from ex


async def sync_participants_to_db(
    game_db_id: str,
    summary: MultiplayerGameSummary,
    finalized_powers: list[Power] | tuple[Power, ...],
    surrendered_powers: list[Power] | tuple[Power, ...],
    *,
    phase_index: int = 0,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Atomically sync active seats in `public.game_participants` (preserving former players)."""
    finalized_set = set(finalized_powers)
    seats_payload = [
        serialize_participant_for_rpc(part, is_finalized=part.power in finalized_set)
        for part in summary.participants.values()
    ]
    rpc_url = f"{get_supabase_url()}/rest/v1/rpc/sync_game_participants"
    rpc_body = {
        "p_game_id": game_db_id,
        "p_seats": seats_payload,
        "p_surrendered_powers": [p.value for p in surrendered_powers],
        "p_phase_index": max(0, int(phase_index)),
    }
    return await _execute_write_op(
        "sync_participants",
        "post",
        rpc_url,
        get_headers(),
        (200, 204),
        f"participant sync for '{summary.game_id}'",
        client=client,
        json_payload=rpc_body,
    )


async def save_game_to_db(
    game_id: str,
    state: GameState,
    summary: MultiplayerGameSummary | None = None,
    history: list[GameState] | None = None,
    passcode: str | None = None,
    *,
    current_phase_index: int | None = None,
    sync_participants: bool = True,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Persist normalized game metadata, lean live `game_state`, and active seats."""
    if (
        not is_persistence_enabled()
        or game_id == DEFAULT_GAME_ID
        or not is_valid_room_code(game_id)
    ):
        return False

    del history  # Phase snapshots are persisted incrementally via storage.phases.
    game_type = game_type_from_summary(summary)
    clean_passcode = passcode.strip() if isinstance(passcode, str) and passcode.strip() else None
    phase_idx = max(0, int(current_phase_index)) if current_phase_index is not None else 0

    payload: dict[str, Any] = {
        "room_code": game_id,
        "name": (summary.name if summary and summary.name else f"Match {game_id}").strip(),
        "game_type": game_type,
        "is_sandbox": game_type in ("SANDBOX", "DRAFT"),
        "is_private": game_type == "PRIVATE",
        "status": to_db_status(summary.status if summary else "waiting"),
        "scenario_id": state.scenario_id or "standard_1901",
        "winner": state.winner.value if state.winner else None,
        "completed_at": summary.completed_at if summary else None,
        "last_moved_at": summary.last_moved_at if summary else None,
        "deadline": epoch_to_iso_timestamp(summary.deadline) if summary else None,
        "phase": state.phase,
        "season": state.season,
        "year": int(state.year),
        "state_revision": int(state.state_revision),
        "passcode": clean_passcode,
        "game_state": _serialize_state_for_db(state),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if current_phase_index is not None:
        payload["current_phase_index"] = phase_idx
    if summary:
        if summary.created_at:
            payload["created_at"] = summary.created_at
        cid = (summary.creator_id or "").strip()
        if is_valid_uuid(cid):
            payload["host_user_id"] = cid
            payload["creator_guest_id"] = None
        elif cid and "@" not in cid:
            payload["host_user_id"] = None
            payload["creator_guest_id"] = cid

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?on_conflict=room_code&select=id"
    headers = {**get_headers(), "Prefer": "resolution=merge-duplicates,return=representation"}
    start = time.perf_counter()
    try:
        resp = await _execute_http("post", url, headers, client=client, json_payload=payload)
        if resp.status_code not in (200, 201, 204):
            record_supabase_query("save_game", "error", resp.status_code, _elapsed_ms(start))
            logger.warning(
                "Supabase save for '%s' failed: HTTP %d %s", game_id, resp.status_code, resp.text
            )
            return False
        record_supabase_query("save_game", "ok", resp.status_code, _elapsed_ms(start))
        if resp.content:
            try:
                rows = resp.json()
                if isinstance(rows, list) and rows and rows[0].get("id"):
                    GAME_DB_IDS[game_id] = str(rows[0]["id"])
            except ValueError:
                pass
    except Exception as ex:
        record_supabase_query("save_game", "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception during save for '%s': %s", game_id, ex)
        return False

    if sync_participants and summary is not None:
        db_id = GAME_DB_IDS.get(game_id)
        if db_id:
            return await sync_participants_to_db(
                db_id,
                summary,
                state.finalized_powers,
                state.surrendered_powers,
                phase_index=phase_idx,
                client=client,
            )
    return True


async def delete_game_from_db(game_id: str, client: httpx.AsyncClient | None = None) -> bool:
    """Delete a game room from Supabase PostgreSQL (cascades to child tables)."""
    if not is_persistence_enabled() or not is_valid_room_code(game_id):
        return False
    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{quote(game_id, safe='')}"
    ok = await _execute_write_op(
        "delete_game",
        "delete",
        url,
        get_headers(),
        (200, 204),
        f"delete for '{game_id}'",
        client=client,
    )
    if ok:
        GAME_DB_IDS.pop(game_id, None)
    return ok


__all__ = [
    "APP_TO_DB_STATUS",
    "DB_TO_APP_STATUS",
    "DERIVED_STATE_FIELDS",
    "GAME_DB_IDS",
    "GAME_LOAD_COLUMNS",
    "LOBBY_COLUMNS",
    "ROOM_CODE_REGEX",
    "LoadedGame",
    "SupabaseUnavailable",
    "_serialize_state_for_db",
    "_serialize_summary_for_db",
    "build_summary_from_row",
    "close_http_client",
    "delete_game_from_db",
    "get_headers",
    "get_http_client",
    "get_supabase_key",
    "get_supabase_url",
    "is_persistence_enabled",
    "is_valid_room_code",
    "is_valid_uuid",
    "load_all_summaries_from_db",
    "load_game_from_db",
    "load_profile_name_from_db",
    "load_profile_names_from_db",
    "resolve_game_db_id",
    "save_game_to_db",
    "sync_participants_to_db",
    "to_app_status",
    "to_db_status",
    "upsert_profile_display_name",
]
