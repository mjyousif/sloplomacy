"""The turn history endpoints."""

from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _finalize,
    _new_game,
    _order_payload,
    _seated_game,
)

client = TestClient(app)


def _bounce_in_burgundy(game_id):
    """France and Germany both move into Burgundy, so both bounce."""
    _order = {
        "unit_id": "GER_A_MUN",
        "power": "GERMANY",
        "unit_type": "A",
        "origin": "MUN",
        "order_type": "MOVE",
        "target": "BUR",
        "is_explicit": True,
    }
    assert client.post(f"/api/order?game_id={game_id}", json={"order": _order}).status_code == 200
    assert (
        client.post(f"/api/order?game_id={game_id}", json={"order": _order_payload()}).status_code
        == 200
    )


def test_a_new_game_has_no_turn_history():
    game_id = _new_game()
    res = client.get(f"/api/history?game_id={game_id}")
    assert res.status_code == 200
    assert res.json() == []
    assert client.get(f"/api/history/0?game_id={game_id}").status_code == 404


def test_turn_history_shows_every_nations_orders_and_what_happened():
    game_id = _seated_game()
    _bounce_in_burgundy(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    entries = client.get(f"/api/history?game_id={game_id}").json()
    assert entries == [{"index": 0, "season": "Spring", "year": 1901, "phase": "Movement"}]

    turn = client.get(f"/api/history/0?game_id={game_id}").json()
    assert turn["season"] == "Spring"
    assert turn["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert turn["orders"]["GER_A_MUN"]["target"] == "BUR"
    # The board is the one the turn began with.
    assert next(u for u in turn["units"] if u["id"] == "FRA_A_PAR")["province"] == "PAR"
    for unit_id in ("FRA_A_PAR", "GER_A_MUN"):
        res = turn["resolution"]["resolutions"][unit_id]
        assert res["succeeded"] is False
        assert res["bounced"] is True
    # Only what a past turn needs leaves the server.
    assert "timer" not in turn
    assert "turn_history" not in turn
    assert "finalized_powers" not in turn


def test_turn_history_follows_a_rollback():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    assert len(client.get(f"/api/history?game_id={game_id}").json()) == 1

    client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers())

    assert client.get(f"/api/history?game_id={game_id}").json() == []


def test_turn_history_of_an_unknown_game_is_not_found():
    assert client.get("/api/history?game_id=ghost_game_9999").status_code == 404
