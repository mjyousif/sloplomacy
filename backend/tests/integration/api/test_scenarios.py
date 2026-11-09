"""Loading and resetting scenarios."""

from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import _auth_headers, _new_game, _seated_game

client = TestClient(app)


def test_scenario_refuses_unknown_scenarios_and_unknown_games():
    game_id = _new_game()
    games_before = len(GAMES)

    bad_scenario = client.post(
        f"/api/scenario?game_id={game_id}", json={"scenario_id": "not-a-scenario"}
    )
    bad_game = client.post("/api/scenario?game_id=junk_game", json={"scenario_id": "standard_1901"})

    assert bad_scenario.status_code == 400
    assert bad_game.status_code == 404
    assert len(GAMES) == games_before


def test_scenario_reset_on_a_live_match_needs_the_host():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    reset = {"scenario_id": "standard_1901"}

    nobody = client.post(f"/api/scenario?game_id={game_id}", json=reset)
    bob = client.post(
        f"/api/scenario?game_id={game_id}", json=reset, headers=_auth_headers("bob", "bob@test.com")
    )

    assert nobody.status_code == 401
    assert bob.status_code == 403
    assert GAMES[game_id].season == "Fall"

    host = client.post(f"/api/scenario?game_id={game_id}", json=reset, headers=_auth_headers())
    assert host.status_code == 200
    assert GAMES[game_id].season == "Spring"


def test_scenario_reset_stays_open_on_solo_and_saved_boards():
    assert client.post("/api/scenario", json={"scenario_id": "standard_1901"}).status_code == 200
    saved = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]

    res = client.post(f"/api/scenario?game_id={saved}", json={"scenario_id": "standard_1901"})

    assert res.status_code == 200
