from domain.game_state import MultiplayerGameSummary
from security.creator import is_creator


def _summary(creator_id: str | None, created_by: str = "") -> MultiplayerGameSummary:
    return MultiplayerGameSummary(
        game_id="mp_x",
        name="x",
        created_at="2026-01-01T00:00:00Z",
        created_by=created_by,
        creator_id=creator_id,
    )


def test_matches_creator_id():
    assert is_creator(_summary("u1"), "u1")


def test_email_or_created_by_never_grants_creator():
    assert not is_creator(_summary(None, "Host@Example.com"), "host@example.COM")
    assert not is_creator(_summary("u1", "Host@Example.com"), "Host@Example.com")


def test_rejects_other_users():
    assert not is_creator(_summary("u1", "a@b.c"), "u2")


def test_missing_values_never_match_each_other():
    assert not is_creator(_summary(None, ""), None)
    assert not is_creator(_summary(None, ""), "")
    assert not is_creator(None, "u1")
