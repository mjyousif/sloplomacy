"""Who created a match: the one place the creator check is written."""

from __future__ import annotations

from domain.game_state import MultiplayerGameSummary


def is_creator(
    summary: MultiplayerGameSummary | None,
    user_id: str | None,
) -> bool:
    """True when `user_id` equals the match's recorded `creator_id`.

    A missing value never matches another missing one.
    """
    if not summary:
        return False
    return bool(user_id and summary.creator_id and summary.creator_id == user_id)
