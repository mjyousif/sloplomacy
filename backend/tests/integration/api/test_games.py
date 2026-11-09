"""Matches as a whole: missing games, the shared default board, and private lobby passcodes."""

from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES

client = TestClient(app)


def test_api_404_error_handling():
    """Verify that invalid game IDs or unknown unit IDs return 404 status codes."""
    # Unknown game lookup
    res_get = client.get("/api/game?game_id=ghost_game_9999")
    assert res_get.status_code == 404
    assert "not found" in res_get.json()["detail"].lower()

    # Unknown game join
    res_join = client.post(
        "/api/games/ghost_game_9999/join",
        json={
            "power": "FRANCE",
            "user_id": "usr_test",
            "email": "test@test.com",
            "display_name": "Tester",
        },
    )
    assert res_join.status_code == 404

    # Unknown unit order in valid default game
    res_order = client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "NON_EXISTENT_UNIT",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
    )
    assert res_order.status_code == 404


def test_shared_default_board_cannot_be_deleted():
    res = client.delete("/api/games/proto_1901")

    assert res.status_code == 403
    assert "proto_1901" in GAMES
    assert client.get("/api/game?game_id=proto_1901").status_code == 200


def test_private_lobby_passcode_flow():
    client = TestClient(app)

    # 1. Create a private game with passcode
    create_res = client.post(
        "/api/games",
        json={
            "name": "Secret Cabal 1901",
            "creator_power": "AUSTRIA",
            "user_id": "user_host",
            "email": "host@vienna.at",
            "display_name": "Emperor Franz",
            "is_private": True,
            "passcode": "SecretPass123",
        },
    )
    assert create_res.status_code == 200
    game_summary = create_res.json()
    gid = game_summary["game_id"]
    assert game_summary["is_private"] is True
    assert game_summary["has_passcode"] is True
    assert "passcode" not in game_summary  # Passcode must never be exposed publicly

    # 2. Fetch specific game by ID via GET /api/games/{gid}
    get_res = client.get(f"/api/games/{gid}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Secret Cabal 1901"
    assert get_res.json()["has_passcode"] is True

    # 3. Join without passcode -> 403 Forbidden
    join_fail = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_intruder",
            "email": "intruder@rome.it",
            "display_name": "Intruder",
        },
    )
    assert join_fail.status_code == 403
    assert "passcode" in join_fail.json()["detail"].lower()

    # 4. Join with wrong passcode -> 403 Forbidden
    join_wrong = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_intruder",
            "email": "intruder@rome.it",
            "display_name": "Intruder",
            "passcode": "WrongPasscode",
        },
    )
    assert join_wrong.status_code == 403

    # 5. Join with correct passcode -> 200 OK
    join_ok = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_friend",
            "email": "friend@rome.it",
            "display_name": "Allied Victor",
            "passcode": "SecretPass123",
        },
    )
    assert join_ok.status_code == 200
    assert "ITALY" in join_ok.json()["summary"]["participants"]

    # 6. Re-entry by existing participant does not require passcode again
    rejoin_ok = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_friend",
            "email": "friend@rome.it",
            "display_name": "Allied Victor",
        },
    )
    assert rejoin_ok.status_code == 200
