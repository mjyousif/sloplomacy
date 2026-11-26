"""Serialization and row-decoding codec for normalized Supabase persistence."""

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from domain.board import Power, UnitType
from domain.game_state import (
    BoardPreview,
    GameParticipant,
    GameState,
    MultiplayerGameSummary,
    PreviewUnit,
)
from engine.adjudicator.territory import displayed_owners

logger = logging.getLogger("diplomacy.database")

_EMAIL_TOKEN_RE = re.compile(r'[^\s()<>"]+@[^\s()<>"]+')

# Rebuilt from the board on refresh and for every viewer, never saved.
DERIVED_STATE_FIELDS = {"unit_options", "preview"}

# Stripped from per-phase snapshots stored in public.game_phases to avoid O(N^2) bloat.
PHASE_EXCLUDED_FIELDS = {
    "unit_options",
    "preview",
    "issues",
    "timer",
    "finalized_powers",
    "turn_history",
    "admin_log",
}

# Status mapping: Phase 1 writes canonical app statuses directly; DB->App still accepts legacy labels.
APP_TO_DB_STATUS = {
    "waiting": "waiting",
    "active": "active",
    "completed": "completed",
    "lobby": "waiting",
    "in_progress": "active",
}
DB_TO_APP_STATUS = {
    "lobby": "waiting",
    "in_progress": "active",
    "completed": "completed",
    "waiting": "waiting",
    "active": "active",
}

VALID_GAME_TYPES = {"PUBLIC", "PRIVATE", "SANDBOX", "DRAFT"}


@dataclass(slots=True)
class LoadedGame:
    """Result of loading a game row from Supabase (with lazy phase history by default)."""

    state: GameState
    summary: MultiplayerGameSummary | None
    history: list[GameState] | None
    passcode: str | None
    phase_count: int = 0
    db_id: str | None = None


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
    return APP_TO_DB_STATUS.get(app_status, "waiting")


def to_app_status(db_status: str) -> str:
    return DB_TO_APP_STATUS.get(db_status, "waiting")


def game_type_from_summary(summary: MultiplayerGameSummary | None) -> str:
    """Derive the canonical mutually-exclusive `game_type` from summary flags."""
    if summary is None:
        return "PUBLIC"
    if summary.is_sandbox:
        return "DRAFT" if summary.is_draft else "SANDBOX"
    if summary.is_private:
        return "PRIVATE"
    return "PUBLIC"


def flags_from_game_type(game_type: str) -> tuple[bool, bool, bool]:
    """Return `(is_private, is_sandbox, is_draft)` for a `game_type` value."""
    gt = game_type.upper()
    if gt == "DRAFT":
        return (False, True, True)
    if gt == "SANDBOX":
        return (False, True, False)
    if gt == "PRIVATE":
        return (True, False, False)
    return (False, False, False)


def parse_iso_timestamp_to_epoch(val: Any) -> float | None:
    """Convert an ISO8601 timestamp string or numeric epoch to a Unix float."""
    if val is None:
        return None
    if isinstance(val, int | float):
        return float(val)
    if isinstance(val, str):
        raw = val.strip()
        if not raw:
            return None
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            return None
    return None


def epoch_to_iso_timestamp(val: float | None) -> str | None:
    """Convert a Unix epoch float to an ISO8601 UTC timestamp string."""
    if val is None:
        return None
    return datetime.fromtimestamp(float(val), tz=timezone.utc).isoformat()


def build_board_preview_from_raw(raw: Any) -> BoardPreview | None:
    """Build a BoardPreview from Postgres `board_preview(g)` output (or None when absent)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("board_preview must be a JSON object")

    raw_ownership = raw.get("ownership") or {}
    raw_units = raw.get("units") or []
    if not isinstance(raw_ownership, dict) or not isinstance(raw_units, list):
        raise ValueError("board_preview ownership/units have invalid types")

    ownership: dict[str, Power] = {str(prov): Power(pwr) for prov, pwr in raw_ownership.items()}
    units: list[PreviewUnit] = []
    for u in raw_units:
        if not isinstance(u, dict):
            raise ValueError("board_preview unit entry must be an object")
        if u.get("is_dislodged"):
            continue
        units.append(
            PreviewUnit(
                power=Power(u["power"]),
                unit_type=UnitType(u["unit_type"]),
                province=str(u["province"]),
                coast=u.get("coast"),
            )
        )
    return BoardPreview(ownership=displayed_owners(ownership), units=units)


def _decode_normalized_participants(
    raw_parts: Any,
) -> tuple[dict[str, GameParticipant], list[Power], list[Power]]:
    """Decode embedded `game_participants` rows into summary participants and status lists."""
    if raw_parts is None:
        return {}, [], []
    if not isinstance(raw_parts, list):
        raise ValueError("game_participants must be a list")

    participants: dict[str, GameParticipant] = {}
    finalized: list[Power] = []
    surrendered: list[Power] = []
    for item in raw_parts:
        if not isinstance(item, dict):
            raise ValueError("participant row must be an object")
        if item.get("left_at") is not None:
            continue
        pwr = Power(item["power"])
        uid_val = item.get("user_id")
        gid_val = item.get("guest_id")
        if uid_val and is_valid_uuid(str(uid_val)):
            effective_uid = str(uid_val)
            display_name = "Envoy"
        else:
            effective_uid = str(gid_val or "guest")
            raw_guest_name = item.get("guest_display_name")
            clean_name = raw_guest_name.strip() if isinstance(raw_guest_name, str) else ""
            display_name = clean_name if clean_name and "@" not in clean_name else "Envoy"
        part = GameParticipant(
            user_id=effective_uid,
            display_name=display_name,
            power=pwr,
            joined_at=str(item.get("joined_at") or datetime.now(timezone.utc).isoformat()),
            surrendered=bool(item.get("surrendered", False)),
            surrendered_at=item.get("surrendered_at"),
            game_over_seen_at=item.get("game_over_seen_at"),
        )
        participants[pwr.value] = part
        if item.get("is_finalized"):
            finalized.append(pwr)
        if part.surrendered:
            surrendered.append(pwr)
    return participants, finalized, surrendered


def _build_normalized_summary(row: dict[str, Any]) -> MultiplayerGameSummary | None:
    room_code = row.get("room_code", "")
    try:
        if "game_type" in row and row.get("game_type") is not None:
            gt = str(row["game_type"]).upper()
            if gt not in VALID_GAME_TYPES:
                raise ValueError(f"Unknown game_type {gt!r}")
            is_private, is_sandbox, is_draft = flags_from_game_type(gt)
        else:
            is_private = bool(row.get("is_private", False))
            is_sandbox = bool(row.get("is_sandbox", False))
            is_draft = bool(row.get("is_draft", False))

        participants, finalized, surrendered = _decode_normalized_participants(
            row.get("game_participants")
        )
        board = build_board_preview_from_raw(row.get("board_preview"))
        raw_winner = row.get("winner")
        parsed_winner = Power(raw_winner) if raw_winner else None
        creator_id = (
            str(row["host_user_id"])
            if row.get("host_user_id")
            else (str(row["creator_guest_id"]) if row.get("creator_guest_id") else None)
        )
        has_pw = (
            bool(row["has_passcode"])
            if "has_passcode" in row and row.get("has_passcode") is not None
            else bool(row.get("passcode"))
        )
        return MultiplayerGameSummary(
            game_id=room_code,
            name=row.get("name") or f"Match {room_code}",
            status=to_app_status(row.get("status", "waiting")),
            winner=parsed_winner,
            completed_at=row.get("completed_at"),
            season=row.get("season", "Spring"),
            year=int(row.get("year", 1901)),
            phase=row.get("phase", "Movement"),
            created_by="",
            creator_id=creator_id,
            created_at=row.get("created_at") or datetime.now(timezone.utc).isoformat(),
            last_moved_at=row.get("last_moved_at"),
            participants=participants,
            finalized_powers=finalized,
            surrendered_powers=surrendered,
            is_sandbox=is_sandbox,
            is_draft=is_draft,
            is_private=is_private,
            has_passcode=has_pw,
            board=board,
            deadline=parse_iso_timestamp_to_epoch(row.get("deadline")),
        )
    except Exception as ex:
        logger.warning(
            "Stored normalized summary of '%s' is unreadable, so the game is withheld: %s",
            room_code,
            ex,
        )
        return None


def build_summary_from_row(row: dict[str, Any]) -> MultiplayerGameSummary | None:
    """Build a MultiplayerGameSummary from a normalized Postgres row (or legacy fallback).

    Returns None when stored summary/participant/preview data cannot be validated so a broken
    private game is withheld rather than exposed as public/unprotected.
    """
    if "game_participants" in row or "game_type" in row:
        # Guard: if a legacy row has an explicitly broken legacy summary AND empty normalized
        # columns (e.g. mixed migration state), check legacy summary first only when no
        # normalized participants/type were ever populated.
        if row.get("game_type") is not None or row.get("game_participants") is not None:
            return _build_normalized_summary(row)

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
        status=to_app_status(row.get("status", "waiting")),
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


def serialize_participant_for_rpc(part: GameParticipant, *, is_finalized: bool) -> dict[str, Any]:
    """Serialize one seat for `public.sync_game_participants`, stripping PII."""
    raw_uid = (part.user_id or "").strip()
    if is_valid_uuid(raw_uid):
        user_id: str | None = raw_uid
        guest_id: str | None = None
        guest_display_name: str | None = None
    else:
        user_id = None
        guest_id = "guest" if (not raw_uid or "@" in raw_uid) else raw_uid
        raw_name = (part.display_name or "").strip()
        guest_display_name = raw_name if raw_name and "@" not in raw_name else None

    return {
        "power": part.power.value,
        "user_id": user_id,
        "guest_id": guest_id,
        "guest_display_name": guest_display_name,
        "joined_at": part.joined_at,
        "surrendered": bool(part.surrendered),
        "surrendered_at": part.surrendered_at,
        "game_over_seen_at": part.game_over_seen_at,
        "is_finalized": bool(is_finalized),
    }


def _scrub_state_dict(data: dict[str, Any]) -> dict[str, Any]:
    admin_log = data.get("admin_log")
    if isinstance(admin_log, list):
        for entry in admin_log:
            if not isinstance(entry, dict):
                continue
            actor_str = str(entry.get("actor") or "")
            if is_valid_uuid(entry.get("actor_id")) or is_valid_uuid(actor_str) or "@" in actor_str:
                entry.pop("actor", None)
            acked = entry.get("acknowledged_by")
            if isinstance(acked, list):
                entry["acknowledged_by"] = [t for t in acked if isinstance(t, str) and "@" not in t]
    turn_history = data.get("turn_history")
    if isinstance(turn_history, list):
        data["turn_history"] = [
            _EMAIL_TOKEN_RE.sub("Envoy", line) if isinstance(line, str) and "@" in line else line
            for line in turn_history
        ]
    return data


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
    """Serialize live GameState while stripping derived fields, UUID actors, and email tokens."""
    data = state.model_dump(mode="json", exclude=DERIVED_STATE_FIELDS)
    return _scrub_state_dict(data)


def serialize_phase_payload(snapshot: GameState) -> dict[str, Any]:
    """Serialize a lean per-phase snapshot for `public.game_phases.payload`."""
    data = snapshot.model_dump(mode="json", exclude=PHASE_EXCLUDED_FIELDS)
    return _scrub_state_dict(data)


def deserialize_phase_row(row: dict[str, Any], room_code: str) -> GameState:
    """Reconstruct a historical GameState snapshot from a `public.game_phases` row."""
    payload = row.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("game_phases.payload must be a JSON object")
    merged = {
        **payload,
        "game_id": room_code,
        "year": int(row["year"]),
        "season": str(row["season"]),
        "phase": str(row["phase"]),
        "state_revision": int(row.get("state_revision", payload.get("state_revision", 1))),
    }
    return GameState.model_validate(merged)
