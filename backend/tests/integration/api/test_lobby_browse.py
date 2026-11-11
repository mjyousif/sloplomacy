"""`GET /api/games/browse` end to end, and the last-move time a resolved phase records."""

import pytest
from main import app
from starlette.testclient import TestClient
from storage.store import GAME_SUMMARIES

from .helpers import _auth_headers

client = TestClient(app)


@pytest.fixture
def only_these_games():
    """Browse a lobby holding only the games this test makes."""
    before = dict(GAME_SUMMARIES)
    GAME_SUMMARIES.clear()
    yield
    GAME_SUMMARIES.clear()
    GAME_SUMMARIES.update(before)


def _create(name, power="FRANCE"):
    res = client.post(
        "/api/games",
        headers=_auth_headers(),
        json={"name": name, "creator_power": power, "display_name": "Hosty"},
    )
    assert res.status_code == 200
    return res.json()["game_id"]


def test_browse_filters_by_open_country_and_pages(only_these_games):
    french = _create("French host", "FRANCE")
    italian = _create("Italian host", "ITALY")

    page = client.get("/api/games/browse", params={"countries": "france"}).json()
    assert [r["game_id"] for r in page["games"]] == [italian]
    assert page["games"][0]["host_name"] == "Hosty"

    both = client.get("/api/games/browse", params={"page_size": 1}).json()
    assert both["total"] == 2
    assert len(both["games"]) == 1
    second = client.get("/api/games/browse", params={"page_size": 1, "page": 2}).json()
    assert {both["games"][0]["game_id"], second["games"][0]["game_id"]} == {french, italian}


def test_browse_turn_filter(only_these_games):
    gid = _create("Turn filter")

    def ids(**params):
        return [
            r["game_id"] for r in client.get("/api/games/browse", params=params).json()["games"]
        ]

    assert ids(turn_op="at", season="Spring", year=1901) == [gid]
    assert ids(turn_op="after", season="Spring", year=1901) == []
    assert ids(turn_op="before", year=1902) == [gid]


def test_browse_rejects_bad_parameters():
    assert client.get("/api/games/browse", params={"countries": "ATLANTIS"}).status_code == 422
    assert client.get("/api/games/browse", params={"seats": "half"}).status_code == 422
    assert client.get("/api/games/browse", params={"page_size": 500}).status_code == 422
    assert client.get("/api/games/browse", params={"page": 0}).status_code == 422


def test_resolving_a_phase_records_the_last_move(only_these_games):
    gid = _create("Clockwork")
    row = client.get("/api/games/browse").json()["games"][0]
    assert row["last_moved_at"] == row["created_at"]
    assert GAME_SUMMARIES[gid].last_moved_at is None

    res = client.post(f"/api/adjudicate?game_id={gid}", headers=_auth_headers())
    assert res.status_code == 200

    moved = GAME_SUMMARIES[gid].last_moved_at
    assert moved is not None and moved > GAME_SUMMARIES[gid].created_at
    assert client.get("/api/games/browse").json()["games"][0]["last_moved_at"] == moved
