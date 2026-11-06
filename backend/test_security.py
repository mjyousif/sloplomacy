import time
import hmac
import pytest
import jwt
from fastapi.testclient import TestClient

from main import app, GAMES, GAME_SUMMARIES, GAME_PASSCODES, MAX_ACTIVE_GAMES, seed_initial_multiplayer_lobbies
from models import Order, OrderType, Power, UnitType
from database import is_valid_room_code

JWT_SECRET = "test-secret-at-least-32-chars-long-12345"
client = TestClient(app)


def make_jwt(user_id: str, email: str, secret: str = JWT_SECRET, exp_offset: int = 3600, aud: str = "authenticated") -> str:
    payload = {"sub": user_id, "email": email, "exp": int(time.time()) + exp_offset}
    if aud:
        payload["aud"] = aud
    return jwt.encode(payload, secret, algorithm="HS256")


def auth_headers(user_id: str, email: str, secret: str = JWT_SECRET, exp_offset: int = 3600, aud: str = "authenticated") -> dict:
    return {"Authorization": f"Bearer {make_jwt(user_id, email, secret, exp_offset, aud)}"}


@pytest.fixture(autouse=True)
def reset_server():
    seed_initial_multiplayer_lobbies()


# ==============================================================================
# SEC-01: Cryptographic JWT Verification & alg: none Rejection
# ==============================================================================

def test_jwt_alg_none_rejected(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_INSECURE_DEV_AUTH", "false")

    token = jwt.encode({"sub": "attacker", "email": "attacker@test.com"}, "", algorithm="none")
    res = client.get(
        "/api/admin/status?game_id=proto_1901",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401


def test_jwt_tampered_signature_rejected():
    fake_token = make_jwt("attacker", "attacker@test.com", secret="wrong-secret-key-at-least-32-characters-123")
    res = client.get(
        "/api/admin/status?game_id=proto_1901",
        headers={"Authorization": f"Bearer {fake_token}"},
    )
    assert res.status_code == 401


def test_jwt_expired_token_rejected():
    expired_token = make_jwt("user", "user@test.com", exp_offset=-60)
    res = client.get(
        "/api/admin/status?game_id=proto_1901",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res.status_code == 401


# ==============================================================================
# SEC-02: Seat Authorization on Order Mutations
# ==============================================================================

def test_seat_authorization_prevents_opponent_order_tampering():
    # Alice creates match as FRANCE
    alice_id = "00000000-0000-0000-0000-000000000001"
    res_create = client.post(
        "/api/games",
        json={"name": "Auth Match", "creator_power": "FRANCE", "user_id": alice_id, "email": "alice@test.com"},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    # Bob joins as GERMANY
    bob_id = "00000000-0000-0000-0000-000000000002"
    res_join = client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_join.status_code == 200

    # Bob attempts to move Alice's French army in Paris
    malicious_order = {
        "unit_id": "FRA_A_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "MOVE",
        "target": "PIC",
        "is_explicit": True,
    }
    res_tamper = client.post(
        f"/api/order?game_id={gid}",
        json={"order": malicious_order},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_tamper.status_code == 403

    # Unauthenticated attacker attempts to finalize France
    res_unauth = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
    )
    assert res_unauth.status_code == 401

    # Bob attempts to finalize France
    res_bob_finalize = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_bob_finalize.status_code == 403

    # Alice finalizes France successfully
    res_alice_finalize = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_alice_finalize.status_code == 200


# ==============================================================================
# SEC-03: Fog of War / Simultaneous Order Secrecy
# ==============================================================================

def test_fog_of_war_masks_opponent_orders():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={"name": "FoW Match", "creator_power": "FRANCE", "user_id": alice_id, "email": "alice@test.com"},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Alice plots a secret move to Burgundy
    res_order = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_order.status_code == 200

    # Bob views the game state (as GERMANY)
    bob_view = client.get(
        f"/api/game?game_id={gid}&power=GERMANY",
        headers=auth_headers(bob_id, "bob@test.com"),
    ).json()["state"]

    # Bob must see Alice's unit as HOLDing (masked)
    assert bob_view["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"
    assert bob_view["orders"]["FRA_A_PAR"]["target"] is None

    # Alice views the game state (as FRANCE)
    alice_view = client.get(
        f"/api/game?game_id={gid}&power=FRANCE",
        headers=auth_headers(alice_id, "alice@test.com"),
    ).json()["state"]

    # Alice sees her own true move
    assert alice_view["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert alice_view["orders"]["FRA_A_PAR"]["target"] == "BUR"


# ==============================================================================
# SEC-04: IDOR Prevention on Leave & Surrender
# ==============================================================================

def test_surrender_and_leave_idor_protection():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={"name": "IDOR Match", "creator_power": "FRANCE", "user_id": alice_id, "email": "alice@test.com"},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Bob tries to surrender Alice's France
    res_surrender = client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "FRANCE", "user_id": bob_id, "leave": False},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_surrender.status_code == 403

    # Bob tries to force Alice to leave
    res_leave = client.post(
        f"/api/games/{gid}/leave",
        json={"power": "FRANCE", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_leave.status_code == 403

    # France is still occupied by Alice
    summary = GAME_SUMMARIES[gid]
    assert "FRANCE" in summary.participants
    assert summary.participants["FRANCE"].user_id == alice_id


# ==============================================================================
# SEC-06: Passcode Protection for Private Games
# ==============================================================================

def test_private_game_passcode_enforced():
    alice_id = "00000000-0000-0000-0000-000000000001"
    res_create = client.post(
        "/api/games",
        json={
            "name": "Secret Campaign",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
            "is_private": True,
            "passcode": "supersecretpassword",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    # Request without passcode is forbidden
    res_no_pw = client.get(f"/api/game?game_id={gid}")
    assert res_no_pw.status_code == 403

    # Request with wrong passcode is forbidden
    res_bad_pw = client.get(f"/api/game?game_id={gid}&passcode=wrongpassword")
    assert res_bad_pw.status_code == 403

    # Request with correct passcode succeeds
    res_good_pw = client.get(f"/api/game?game_id={gid}&passcode=supersecretpassword")
    assert res_good_pw.status_code == 200


# ==============================================================================
# SEC-05: Denial of Service / Game Room Capacity Limits
# ==============================================================================

def test_game_capacity_limit_enforced(monkeypatch):
    from main import check_game_capacity, MAX_ACTIVE_GAMES
    from fastapi import HTTPException

    # Simulate room capacity reached
    fake_games = {f"game_{i}": None for i in range(MAX_ACTIVE_GAMES + 1)}
    monkeypatch.setattr("main.GAMES", fake_games)

    with pytest.raises(HTTPException) as exc_info:
        check_game_capacity()
    assert exc_info.value.status_code == 429
    assert "Server game capacity reached" in exc_info.value.detail


# ==============================================================================
# SEC-07: Room Code & Input Validation
# ==============================================================================

def test_room_code_sanitization():
    assert is_valid_room_code("mp_abc123") is True
    assert is_valid_room_code("my-custom-room_42") is True
    assert is_valid_room_code("../escape/path") is False
    assert is_valid_room_code("game' OR '1'='1") is False
    assert is_valid_room_code("game; DROP TABLE users;") is False
    assert is_valid_room_code("") is False
    assert is_valid_room_code("a" * 65) is False


# ==============================================================================
# SEC-08: Timer Authorization
# ==============================================================================

def test_timer_action_authorization():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={"name": "Timer Match", "creator_power": "FRANCE", "user_id": alice_id, "email": "alice@test.com"},
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Bob (non-host) cannot start the timer
    res_start = client.post(
        f"/api/games/{gid}/timer/start",
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_start.status_code == 403

    # Alice (host) starts the timer -> enters VOTING
    res_alice_start = client.post(
        f"/api/games/{gid}/timer/start",
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_alice_start.status_code == 200

    # Bob cannot vote on behalf of FRANCE
    res_bob_vote = client.post(
        f"/api/games/{gid}/timer/vote",
        json={"power": "FRANCE", "choice": "15"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )
    assert res_bob_vote.status_code == 403

    # Unauthenticated user cannot vote on behalf of FRANCE
    res_unauth_vote = client.post(
        f"/api/games/{gid}/timer/vote",
        json={"power": "FRANCE", "choice": "15"},
    )
    assert res_unauth_vote.status_code == 401
