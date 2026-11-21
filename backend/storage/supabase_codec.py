"""Serialization and row-decoding codec for Supabase `multiplayer_games` persistence."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from domain.board import Power
from domain.game_state import GameState, MultiplayerGameSummary

logger = logging.getLogger("diplomacy.database")

# Rebuilt from the board on refresh and for every viewer, never saved.
DERIVED_STATE_FIELDS = {"unit_options", "preview"}

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


def is_valid_uuid(val: str | None) -> bool:
    """Return True when `val` is a valid UUID string."""
    if not val:
        return False
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
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
                summary = MultiplayerGameSummary.model_validate(candidate)
                if not summary.creator_id and row.get("host_user_id"):
                    summary.creator_id = str(row["host_user_id"])
                if "@" in (summary.created_by or "") or is_valid_uuid(summary.creator_id):
                    summary.created_by = ""
                return summary
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


def _serialize_summary_for_db(summary: MultiplayerGameSummary) -> dict[str, Any]:
    """Strip denormalized names and emails; public.profiles keyed by UUID is authoritative."""
    data = summary.model_dump(mode="json")
    data.pop("created_by", None)
    participants = data.get("participants")
    if isinstance(participants, dict):
        for part in participants.values():
            if isinstance(part, dict):
                part.pop("email", None)
                if is_valid_uuid(part.get("user_id")) or "@" in str(part.get("display_name") or ""):
                    part.pop("display_name", None)
    return data


def _serialize_state_for_db(state: GameState) -> dict[str, Any]:
    """Serialize GameState while stripping denormalized UUID actor names and any email tokens."""
    data = state.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS)
    admin_log = data.get("admin_log")
    if isinstance(admin_log, list):
        for entry in admin_log:
            if not isinstance(entry, dict):
                continue
            if is_valid_uuid(entry.get("actor_id")) or "@" in str(entry.get("actor") or ""):
                entry.pop("actor", None)
            acked = entry.get("acknowledged_by")
            if isinstance(acked, list):
                entry["acknowledged_by"] = [t for t in acked if isinstance(t, str) and "@" not in t]
    return data
