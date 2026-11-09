"""A player's private sandbox of a live match: isolation from the real match, and what carries back."""

import pytest
from domain.board import Power
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import (
    _auth_headers,
    _germany_moves_to_silesia,
    _order_payload,
    _seated_game,
)

client = TestClient(app)


def _enter_sandbox(game_id, power="FRANCE"):
    res = client.post(f"/api/sandbox/enter?game_id={game_id}", json={"power": power})
    assert res.status_code == 200
    return res.json()


def _exit_sandbox(sandbox_id, power="FRANCE"):
    res = client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": power})
    assert res.status_code == 200
    return res.json()


def test_opening_a_sandbox_leaves_an_opponents_finalized_orders_alone():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "GERMANY", "force": True})

    sandbox = _enter_sandbox(game_id)
    _exit_sandbox(sandbox["game_id"])

    assert GAMES[game_id].finalized_powers == [Power.GERMANY]
    assert GAMES[game_id].orders["GER_A_BER"].order_type == OrderType.MOVE
    assert GAMES[game_id].orders["GER_A_BER"].target == "SIL"


def test_sandbox_runs_on_a_private_copy_that_hides_opponents_orders():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    real_game = GAMES[game_id]

    sandbox = _enter_sandbox(game_id)

    assert sandbox["game_id"] != game_id
    assert GAMES[game_id] is real_game
    assert sandbox["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert sandbox["orders"]["GER_A_BER"]["target"] is None
    # Nor does it reveal an order through any preview of the copy.
    assert sandbox["last_resolution"]["resolutions"]["GER_A_BER"]["order_type"] == "HOLD"


def test_hypothetical_orders_never_reach_the_real_match():
    game_id = _seated_game()
    real_germany_order = GAMES[game_id].orders["GER_A_BER"].model_copy()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    _germany_moves_to_silesia(sandbox_id)
    res = client.post(f"/api/sandbox/ai-orders?game_id={sandbox_id}", json={"include_active": True})
    assert res.status_code == 200
    assert GAMES[game_id].orders["GER_A_BER"] == real_germany_order

    _exit_sandbox(sandbox_id)
    assert GAMES[game_id].orders["GER_A_BER"] == real_germany_order
    assert sandbox_id not in GAMES


def test_stepping_turns_in_a_sandbox_leaves_the_real_match_on_its_turn():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    assert client.post(f"/api/sandbox/ai-step?game_id={sandbox_id}").status_code == 200

    assert GAMES[sandbox_id].season == "Fall"
    assert GAMES[game_id].season == "Spring"


def test_own_sandbox_orders_carry_over_to_the_real_match():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    state = _exit_sandbox(sandbox_id)

    assert state["game_id"] == game_id
    assert state["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert GAMES[game_id].orders["FRA_A_PAR"].target == "BUR"


def test_changing_own_orders_in_a_sandbox_drops_finalization_like_a_real_edit():
    game_id = _seated_game()
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "FRANCE", "force": True})
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    _exit_sandbox(sandbox_id)

    assert GAMES[game_id].finalized_powers == []


def test_browsing_a_sandbox_without_changes_keeps_own_finalization():
    game_id = _seated_game()
    client.post(f"/api/finalize?game_id={game_id}", json={"power": "FRANCE", "force": True})

    _exit_sandbox(_enter_sandbox(game_id)["game_id"])

    assert GAMES[game_id].finalized_powers == [Power.FRANCE]


def test_own_sandbox_orders_are_dropped_if_the_match_moved_on():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]
    client.post(f"/api/order?game_id={sandbox_id}", json={"order": _order_payload(target="BUR")})

    for power in ("FRANCE", "GERMANY"):
        client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})
    assert GAMES[game_id].season == "Fall"

    state = _exit_sandbox(sandbox_id)

    assert state["season"] == "Fall"
    assert state["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_sandbox_orders_do_not_return_after_the_player_left_the_seat():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id, "GERMANY")["game_id"]
    _germany_moves_to_silesia(sandbox_id)
    client.post(
        f"/api/games/{game_id}/surrender",
        json={"power": "GERMANY", "user_id": "bob", "leave": True},
    )

    _exit_sandbox(sandbox_id, "GERMANY")

    assert GAMES[game_id].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_one_player_keeps_one_sandbox_per_match():
    game_id = _seated_game()
    first = _enter_sandbox(game_id)["game_id"]
    second = _enter_sandbox(game_id)["game_id"]

    assert first not in GAMES
    assert second in GAMES


def test_each_player_has_their_own_sandbox():
    game_id = _seated_game()
    host_sandbox = _enter_sandbox(game_id, "FRANCE")["game_id"]
    bob_sandbox = _enter_sandbox(game_id, "GERMANY")["game_id"]
    _germany_moves_to_silesia(bob_sandbox)

    assert host_sandbox != bob_sandbox
    assert GAMES[host_sandbox].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_deleting_a_match_removes_its_sandboxes():
    game_id = _seated_game()
    sandbox_id = _enter_sandbox(game_id)["game_id"]

    assert client.delete(f"/api/games/{game_id}", headers=_auth_headers()).status_code == 200

    assert sandbox_id not in GAMES
    assert (
        client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": "FRANCE"}).status_code
        == 404
    )


@pytest.mark.parametrize(
    "path",
    [
        "/api/sandbox/exit",
        "/api/sandbox/clear-foreign",
        "/api/sandbox/ai-orders",
        "/api/sandbox/ai-step",
    ],
)
def test_sandbox_writes_are_refused_on_a_live_match(path):
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    orders_before = {k: v.model_copy() for k, v in GAMES[game_id].orders.items()}

    res = client.post(f"{path}?game_id={game_id}", json={"power": "FRANCE"})

    assert res.status_code == 409
    assert GAMES[game_id].orders == orders_before
    assert GAMES[game_id].season == "Spring"


def test_saved_sandbox_keeps_its_own_board():
    save = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    )
    game_id = save.json()["game_id"]

    assert _enter_sandbox(game_id)["game_id"] == game_id
    assert _exit_sandbox(game_id)["game_id"] == game_id
