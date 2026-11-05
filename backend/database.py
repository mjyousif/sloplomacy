import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from models import GameParticipant, GameState, MultiplayerGameSummary, Power

logger = logging.getLogger("diplomacy.database")

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


def get_supabase_key() -> str:
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_KEY")
        or os.environ.get("VITE_SUPABASE_ANON_KEY")
        or ""
    ).strip()
    return key


def is_persistence_enabled() -> bool:
    url = get_supabase_url()
    key = get_supabase_key()
    if not url or not key:
        return False
    if "your-project-ref" in url or "your-supabase" in url:
        return False
    return True


def is_valid_uuid(val: Optional[str]) -> bool:
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False


def get_headers() -> Dict[str, str]:
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


def build_summary_from_row(row: Dict[str, Any]) -> MultiplayerGameSummary:
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
    return MultiplayerGameSummary(
        game_id=room_code,
        name=row.get("name") or f"Match {room_code}",
        status=app_status,
        season=row.get("season", "Spring"),
        year=int(row.get("year", 1901)),
        phase=row.get("phase", "Movement"),
        created_by="commander@diplomacy.eu",
        creator_id=str(row.get("host_user_id")) if row.get("host_user_id") else None,
        created_at=created_at,
        participants={},
        finalized_powers=[],
        is_sandbox=bool(row.get("is_sandbox", False)),
        is_private=bool(row.get("is_private", False)),
        has_passcode=bool(row.get("passcode")),
    )


async def load_game_from_db(
    game_id: str,
    client: Optional[httpx.AsyncClient] = None,
) -> Optional[Tuple[GameState, Optional[MultiplayerGameSummary], List[GameState], Optional[str]]]:
    """
    Load a game from Supabase PostgreSQL by room_code.
    Returns (state, summary, history, passcode) or None.
    """
    if not is_persistence_enabled():
        return None

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{game_id}&select=*"
    headers = get_headers()

    try:
        if client:
            resp = await client.get(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(url, headers=headers, timeout=10.0)

        if resp.status_code != 200:
            logger.warning("Supabase load error for '%s': HTTP %d %s", game_id, resp.status_code, resp.text)
            return None

        rows = resp.json()
        if not rows or not isinstance(rows, list):
            return None

        row = rows[0]
        raw_game_state = row.get("game_state", {})

        if isinstance(raw_game_state, dict) and "state" in raw_game_state:
            state_data = raw_game_state["state"]
            summary_data = raw_game_state.get("summary") or row.get("summary")
            history_data = raw_game_state.get("history") or row.get("history") or []
            passcode = raw_game_state.get("passcode") or row.get("passcode")
        else:
            state_data = raw_game_state
            summary_data = row.get("summary")
            history_data = row.get("history") or []
            passcode = row.get("passcode")

        state = GameState.model_validate(state_data)

        summary: Optional[MultiplayerGameSummary] = None
        if summary_data and isinstance(summary_data, dict):
            try:
                summary = MultiplayerGameSummary.model_validate(summary_data)
            except Exception as ex:
                logger.warning("Failed to validate summary for %s: %s", game_id, ex)
        if not summary:
            summary = build_summary_from_row(row)

        history: List[GameState] = []
        if isinstance(history_data, list):
            for h in history_data:
                try:
                    history.append(GameState.model_validate(h))
                except Exception as ex:
                    logger.debug("Skipping unparseable history entry for %s: %s", game_id, ex)

        return (state, summary, history, passcode)

    except Exception as ex:
        logger.warning("Supabase exception loading game '%s': %s", game_id, ex)
        return None


async def load_all_summaries_from_db(
    client: Optional[httpx.AsyncClient] = None,
) -> Dict[str, MultiplayerGameSummary]:
    """Fetch all games from Supabase to warm up or synchronize lobby listings."""
    if not is_persistence_enabled():
        return {}

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?select=*"
    headers = get_headers()
    summaries: Dict[str, MultiplayerGameSummary] = {}

    try:
        if client:
            resp = await client.get(url, headers=headers, timeout=10.0)
        else:
            async with httpx.AsyncClient() as c:
                resp = await c.get(url, headers=headers, timeout=10.0)

        if resp.status_code != 200:
            logger.warning("Supabase load_all_summaries error: HTTP %d %s", resp.status_code, resp.text)
            return {}

        rows = resp.json()
        if isinstance(rows, list):
            for row in rows:
                room_code = row.get("room_code")
                if room_code:
                    summaries[room_code] = build_summary_from_row(row)
        return summaries

    except Exception as ex:
        logger.warning("Supabase exception loading summaries: %s", ex)
        return {}


async def save_game_to_db(
    game_id: str,
    state: GameState,
    summary: Optional[MultiplayerGameSummary] = None,
    history: Optional[List[GameState]] = None,
    passcode: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """
    Persist game state, metadata, and history into Supabase PostgreSQL.
    Uses PostgREST upsert on room_code.
    """
    if not is_persistence_enabled():
        return False

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?on_conflict=room_code"
    headers = get_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    now_iso = datetime.now(timezone.utc).isoformat()
    app_status = summary.status if summary else "waiting"
    db_status = to_db_status(app_status)

    payload: Dict[str, Any] = {
        "room_code": game_id,
        "name": (summary.name if summary and summary.name else f"Match {game_id}").strip(),
        "status": db_status,
        "phase": state.phase,
        "season": state.season,
        "year": state.year,
        "game_state": {
            "state": state.model_dump(mode="json"),
            "summary": summary.model_dump(mode="json") if summary else None,
            "history": [h.model_dump(mode="json") for h in (history or [])],
            "passcode": passcode,
        },
        "updated_at": now_iso,
    }

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
    client: Optional[httpx.AsyncClient] = None,
) -> bool:
    """Delete a game room from Supabase PostgreSQL."""
    if not is_persistence_enabled():
        return False

    url = f"{get_supabase_url()}/rest/v1/multiplayer_games?room_code=eq.{game_id}"
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

        logger.warning("Supabase delete failed for '%s': HTTP %d %s", game_id, resp.status_code, resp.text)
        return False

    except Exception as ex:
        logger.warning("Supabase exception deleting game '%s': %s", game_id, ex)
        return False
