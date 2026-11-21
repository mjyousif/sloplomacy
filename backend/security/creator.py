"""Who created a match: the one place the creator check is written."""

from __future__ import annotations

from domain.game_state import MultiplayerGameSummary


def is_creator(
    summary: MultiplayerGameSummary | None,
    user_id: str | None,
    email: str | None,
) -> bool:
    """True when `user_id` or `email` identifies the match's creator.

    The id has to equal a recorded `creator_id`; the email is compared without regard to
    case against a recorded `created_by`. A missing value never matches another missing one.
    """
    if not summary:
        return False
    if user_id and summary.creator_id and summary.creator_id == user_id:
        return True
    return bool(email and summary.created_by and summary.created_by.lower() == email.lower())
