"""Email privacy: user emails never leak in public lobby, game, admin or socket payloads."""

import json

from fastapi.testclient import TestClient
from main import app
from tests.integration.security.helpers import auth_headers, make_jwt, socket_state
from tests.ws_testing import receive_json

client = TestClient(app)


def test_emails_are_never_exposed_in_lobby_game_admin_or_sockets():
    alice_id = "00000000-0000-0000-0000-00000000e101"
    bob_id = "00000000-0000-0000-0000-00000000e102"
    alice_email = "alice.secret@example.com"
    bob_email = "bob.secret@example.com"
    alice_hdrs = auth_headers(alice_id, alice_email)
    bob_hdrs = auth_headers(bob_id, bob_email)

    create_res = client.post(
        "/api/games",
        json={
            "name": "Email Privacy Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": alice_email,
            "display_name": "GeneralAlice",
            "is_private": False,
        },
        headers=alice_hdrs,
    )
    assert create_res.status_code == 200
    assert alice_email not in create_res.text
    assert create_res.json()["created_by"] == "GeneralAlice"
    gid = create_res.json()["game_id"]

    join_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "GERMANY",
            "user_id": bob_id,
            "email": bob_email,
            "display_name": "KaiserBob",
        },
        headers=bob_hdrs,
    )
    assert join_res.status_code == 200
    assert alice_email not in join_res.text
    assert bob_email not in join_res.text

    # Public lobby endpoints
    games_res = client.get("/api/games")
    assert games_res.status_code == 200
    assert alice_email not in games_res.text
    assert bob_email not in games_res.text

    browse_res = client.get("/api/games/browse?seats=all")
    assert browse_res.status_code == 200
    assert alice_email not in browse_res.text
    assert bob_email not in browse_res.text

    details_res = client.get(f"/api/games/{gid}")
    assert details_res.status_code == 200
    assert alice_email not in details_res.text
    assert bob_email not in details_res.text
    assert details_res.json()["created_by"] == "GeneralAlice"

    # Bob's own games list & game state
    mine_res = client.get("/api/games/mine", headers=bob_hdrs)
    assert mine_res.status_code == 200
    assert alice_email not in mine_res.text
    assert bob_email not in mine_res.text

    game_res = client.get(f"/api/game?game_id={gid}", headers=bob_hdrs)
    assert game_res.status_code == 200
    assert alice_email not in game_res.text
    assert bob_email not in game_res.text

    # Admin status & admin action log
    status_res = client.get(f"/api/admin/status?game_id={gid}", headers=bob_hdrs)
    assert status_res.status_code == 200
    assert alice_email not in status_res.text

    spawn_res = client.post(
        f"/api/admin/unit/spawn?game_id={gid}",
        json={"power": "ITALY", "unit_type": "A", "province": "ROM"},
        headers=alice_hdrs,
    )
    assert spawn_res.status_code == 200
    assert alice_email not in spawn_res.text
    assert spawn_res.json()["admin_log"][0]["actor"] == "GeneralAlice"

    # Non-creator error message must not leak creator's email
    denied_res = client.post(
        f"/api/admin/unit/spawn?game_id={gid}",
        json={"power": "ITALY", "unit_type": "A", "province": "VEN"},
        headers=bob_hdrs,
    )
    assert denied_res.status_code == 403
    assert alice_email not in denied_res.text

    # WebSockets: /ws/lobby and /ws/games/{gid}
    with client.websocket_connect("/ws/lobby") as ws_lobby:
        lobby_payload = json.dumps(receive_json(ws_lobby))
        assert alice_email not in lobby_payload
        assert bob_email not in lobby_payload

    ws_game = socket_state(f"/ws/games/{gid}?handshake=1", token=make_jwt(bob_id, bob_email))
    game_payload = json.dumps(ws_game)
    assert alice_email not in game_payload
    assert bob_email not in game_payload
