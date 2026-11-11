"""A private campaign never shows in the public lobby: not over HTTP, the browser, or the socket.

Its players still find it under `GET /api/games/mine`, and a stranger never does.
"""

import pytest
from main import app
from starlette.testclient import TestClient
from storage.store import GAME_SUMMARIES
from tests.ws_testing import receive_json

from .helpers import auth_headers

client = TestClient(app)

HOST = ("priv_host", "host@secret.test")
STRANGER = ("stranger", "stranger@elsewhere.test")


@pytest.fixture
def private_and_public():
    priv = client.post(
        "/api/games",
        headers=auth_headers(*HOST),
        json={
            "name": "Hidden Cabal",
            "creator_power": "AUSTRIA",
            "is_private": True,
            "passcode": "s3cret",
        },
    ).json()["game_id"]
    pub = client.post(
        "/api/games",
        headers=auth_headers(*HOST),
        json={"name": "Open Table", "creator_power": "FRANCE"},
    ).json()["game_id"]
    yield priv, pub
    GAME_SUMMARIES.pop(priv, None)
    GAME_SUMMARIES.pop(pub, None)


def _browse_ids(**params):
    res = client.get("/api/games/browse", params={"seats": "all", "page_size": 50, **params})
    assert res.status_code == 200
    page = res.json()
    ids = [r["game_id"] for r in page["games"]]
    for n in range(2, (page["total"] + 49) // 50 + 1):
        more = client.get("/api/games/browse", params={"seats": "all", "page_size": 50, "page": n})
        ids += [r["game_id"] for r in more.json()["games"]]
    return ids


def test_private_game_is_not_in_the_public_list(private_and_public):
    priv, pub = private_and_public
    listed = [g["game_id"] for g in client.get("/api/games").json()]

    assert pub in listed
    assert priv not in listed


def test_private_game_is_not_in_the_browser(private_and_public):
    priv, pub = private_and_public
    ids = _browse_ids()

    assert pub in ids
    assert priv not in ids


def test_browser_rows_carry_no_emails_or_user_ids(private_and_public):
    _, pub = private_and_public
    res = client.get("/api/games/browse", params={"seats": "all", "page_size": 50})
    body = res.text

    assert HOST[1] not in body
    assert HOST[0] not in body
    assert "participants" not in body


def test_private_game_is_not_in_the_lobby_socket(private_and_public):
    priv, pub = private_and_public
    with client.websocket_connect("/ws/lobby") as ws:
        first = [g["game_id"] for g in receive_json(ws)["games"]]
        ws.send_json({"type": "refresh"})
        refreshed = [g["game_id"] for g in receive_json(ws)["games"]]

        # A broadcast after a change to the private game leaves it out too.
        client.post(
            f"/api/games/{priv}/join",
            headers=auth_headers(*STRANGER),
            json={"power": "ITALY", "passcode": "s3cret"},
        )
        broadcast = [g["game_id"] for g in receive_json(ws)["games"]]

    for listed in (first, refreshed, broadcast):
        assert pub in listed
        assert priv not in listed


def test_mine_lists_a_players_private_games_and_no_one_elses(private_and_public):
    priv, pub = private_and_public

    host_mine = client.get("/api/games/mine", headers=auth_headers(*HOST))
    stranger_mine = client.get("/api/games/mine", headers=auth_headers(*STRANGER))

    assert host_mine.status_code == 200
    assert {priv, pub} <= {g["game_id"] for g in host_mine.json()}
    assert stranger_mine.status_code == 200
    assert not {priv, pub} & {g["game_id"] for g in stranger_mine.json()}


def test_mine_needs_a_signed_in_caller():
    assert client.get("/api/games/mine").status_code == 401
