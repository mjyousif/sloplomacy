import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from domain.board import Power
from domain.game_state import MultiplayerGameSummary

logger = logging.getLogger("diplomacy.database")

ROOM_CODE_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# Rebuilt from the board whenever a game loads, so saving them would only bloat every row.
# Rebuilt from the board on refresh and for every viewer, never saved.
DERIVED_STATE_FIELDS = {"unit_options", "preview"}

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


def is_valid_room_code(code: str | None) -> bool:
    """Verify that a game_id / room_code conforms to safe alphanumeric syntax."""
    if not code:
        return False
    return bool(ROOM_CODE_REGEX.match(code))


def is_valid_uuid(val: str | None) -> bool:
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
