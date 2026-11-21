"""Centralized UUID-based profile name resolution and public name sanitization."""

from domain.game_state import AdminActionLogEntry, GameParticipant, MultiplayerGameSummary
from storage import supabase
from storage.supabase_codec import is_valid_uuid

PROFILE_NAMES: dict[str, str] = {}

DEFAULT_DISPLAY_NAME = "Envoy"
UNKNOWN_HOST_NAME = "Unknown host"


def sanitize_public_name(raw: str | None) -> str | None:
    """Collapse whitespace and reject empty strings or email addresses (never slice `@`)."""
    clean = " ".join((raw or "").split())
    if not clean or "@" in clean:
        return None
    return clean


def resolve_display_name(
    user_id: str | None,
    *,
    fallback: str | None = None,
    default: str = DEFAULT_DISPLAY_NAME,
) -> str:
    """Resolve a user's public display name from PROFILE_NAMES by UUID, defaulting to `default`.

    For registered UUID users, `public.profiles` (`PROFILE_NAMES`) is the single source of truth;
    inline/request fallbacks are ignored so stale or spoofed names are never trusted.
    """
    if is_valid_uuid(user_id):
        return sanitize_public_name(PROFILE_NAMES.get(user_id or "")) or default
    return (
        sanitize_public_name(PROFILE_NAMES.get(user_id or ""))
        or sanitize_public_name(fallback)
        or default
    )


def resolve_participant_name(
    part: GameParticipant | None,
    *,
    default: str = DEFAULT_DISPLAY_NAME,
) -> str:
    """Resolve a match participant's public display name."""
    if part is None:
        return default
    return resolve_display_name(part.user_id, fallback=part.display_name, default=default)


def resolve_host_name(summary: MultiplayerGameSummary) -> str:
    """Resolve the match host's public display name, never exposing an email."""
    if summary.creator_id:
        if is_valid_uuid(summary.creator_id):
            return resolve_display_name(summary.creator_id, default=DEFAULT_DISPLAY_NAME)
        participant_name = next(
            (
                sanitize_public_name(p.display_name)
                for p in summary.participants.values()
                if p.user_id == summary.creator_id and sanitize_public_name(p.display_name)
            ),
            None,
        )
        return (
            sanitize_public_name(PROFILE_NAMES.get(summary.creator_id))
            or participant_name
            or sanitize_public_name(summary.created_by)
            or DEFAULT_DISPLAY_NAME
        )
    return sanitize_public_name(summary.created_by) or UNKNOWN_HOST_NAME


def resolve_actor_name(
    entry: AdminActionLogEntry,
    summary: MultiplayerGameSummary | None = None,
) -> str:
    """Resolve an admin action log actor's public display name from `actor_id` / `PROFILE_NAMES`."""
    if entry.actor_id:
        if is_valid_uuid(entry.actor_id):
            return resolve_display_name(entry.actor_id, default=DEFAULT_DISPLAY_NAME)
        participant_fallback = None
        if summary:
            participant_fallback = next(
                (
                    p.display_name
                    for p in summary.participants.values()
                    if p.user_id == entry.actor_id and sanitize_public_name(p.display_name)
                ),
                None,
            )
        return resolve_display_name(
            entry.actor_id,
            fallback=participant_fallback or entry.actor,
            default=DEFAULT_DISPLAY_NAME,
        )
    return sanitize_public_name(entry.actor) or DEFAULT_DISPLAY_NAME


async def ensure_profile_loaded(user_id: str | None) -> None:
    """Populate `PROFILE_NAMES[user_id]` on demand from `public.profiles` for a registered UUID."""
    if (
        not is_valid_uuid(user_id)
        or user_id in PROFILE_NAMES
        or not supabase.is_persistence_enabled()
    ):
        return
    name = await supabase.load_profile_name_from_db(user_id)  # type: ignore[arg-type]
    clean = sanitize_public_name(name)
    if clean and user_id:
        PROFILE_NAMES[user_id] = clean
