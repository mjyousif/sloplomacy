import base64
import importlib.util
import json
import time
from pathlib import Path

import jwt
import pytest
from database import is_valid_room_code
from fastapi.testclient import TestClient
from main import (
    GAME_SUMMARIES,
    GAMES,
    MAX_ACTIVE_GAMES,
    app,
    seed_initial_multiplayer_lobbies,
)
from models import OrderType

JWT_SECRET = "test-secret-at-least-32-chars-long-12345"
client = TestClient(app)


def make_jwt(
    user_id: str,
    email: str,
    secret: str = JWT_SECRET,
    exp_offset: int = 3600,
    aud: str = "authenticated",
) -> str:
    payload = {"sub": user_id, "email": email, "exp": int(time.time()) + exp_offset}
    if aud:
        payload["aud"] = aud
    return jwt.encode(payload, secret, algorithm="HS256")


def auth_headers(
    user_id: str,
    email: str,
    secret: str = JWT_SECRET,
    exp_offset: int = 3600,
    aud: str = "authenticated",
) -> dict:
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


def load_quickstart():
    current = Path(__file__).resolve().parent
    path = None
    while current.parent != current:
        candidate = current / "quickstart.py"
        if candidate.exists():
            path = candidate
            break
        current = current.parent
    if path is None:
        path = Path(__file__).resolve().parents[3] / "quickstart.py"
    spec = importlib.util.spec_from_file_location("quickstart", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def demo_sign_in_headers() -> dict:
    """The token getAuthHeaders in frontend/src/lib/supabase.ts sends for a local demo user."""

    def encode(value: dict) -> str:
        return base64.b64encode(json.dumps(value, separators=(",", ":")).encode()).decode()

    header = encode({"alg": "none", "typ": "JWT"})
    payload = encode({"sub": "local_demo_example_com", "email": "demo@example.com"})
    return {"Authorization": f"Bearer {header}.{payload}."}


def test_local_launcher_backend_accepts_demo_sign_in(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)

    res = client.get("/api/admin/status?game_id=proto_1901", headers=demo_sign_in_headers())
    assert res.status_code == 401

    monkeypatch.setenv("ENVIRONMENT", load_quickstart().backend_env()["ENVIRONMENT"])
    res = client.get("/api/admin/status?game_id=proto_1901", headers=demo_sign_in_headers())
    assert res.status_code == 200


def test_local_launcher_keeps_environment_set_in_the_shell(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    assert load_quickstart().backend_env()["ENVIRONMENT"] == "production"


def test_jwt_tampered_signature_rejected():
    fake_token = make_jwt(
        "attacker", "attacker@test.com", secret="wrong-secret-key-at-least-32-characters-123"
    )
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
        json={
            "name": "Auth Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
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
        json={
            "name": "FoW Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
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
        json={
            "name": "IDOR Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
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
    from fastapi import HTTPException
    from main import check_game_capacity

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
        json={
            "name": "Timer Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
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


# ==============================================================================
# SEC-09: Defense-in-Depth Security Response Headers
# ==============================================================================


def test_security_headers_present():
    """Verify that HTTP responses include standard defensive security headers."""
    res = client.get("/api/games")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("permissions-policy") == "geolocation=(), camera=(), microphone=()"

    # Also check game endpoint response
    res_game = client.get("/api/game?game_id=proto_1901")
    assert res_game.status_code == 200
    assert res_game.headers.get("x-content-type-options") == "nosniff"
    assert res_game.headers.get("x-frame-options") == "DENY"


# ==============================================================================
# SEC-05: Hidden orders stay hidden on every path
# ==============================================================================

ALICE_ID = "00000000-0000-0000-0000-00000000a11c"
BOB_ID = "00000000-0000-0000-0000-000000000b0b"


def alice_headers() -> dict:
    return auth_headers(ALICE_ID, "alice@test.com")


def bob_headers() -> dict:
    return auth_headers(BOB_ID, "bob@test.com")


def secret_plan_match(private: bool = False) -> str:
    """Alice (host, France) has secretly ordered Paris to Burgundy; Bob holds Germany."""
    body = {
        "name": "Secrets",
        "creator_power": "FRANCE",
        "user_id": ALICE_ID,
        "email": "alice@test.com",
    }
    if private:
        body.update({"is_private": True, "passcode": "Secret1901"})
    gid = client.post("/api/games", json=body, headers=alice_headers()).json()["game_id"]
    joined = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "GERMANY",
            "user_id": BOB_ID,
            "email": "bob@test.com",
            "passcode": "Secret1901" if private else None,
        },
        headers=bob_headers(),
    )
    assert joined.status_code == 200, joined.text
    res = client.post(
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
        headers=alice_headers(),
    )
    assert res.status_code == 200, res.text
    assert GAMES[gid].orders["FRA_A_PAR"].order_type == OrderType.MOVE
    return gid


def assert_plan_hidden(state: dict) -> None:
    assert state["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"
    preview = state.get("last_resolution")
    if preview:
        assert preview["resolutions"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_naming_a_power_in_get_game_does_not_show_its_orders():
    gid = secret_plan_match()
    for headers in (bob_headers(), {}):
        res = client.get(f"/api/game?game_id={gid}&power=FRANCE", headers=headers)
        assert res.status_code == 200
        assert_plan_hidden(res.json()["state"])

    own = client.get(f"/api/game?game_id={gid}", headers=alice_headers()).json()["state"]
    assert own["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert own["last_resolution"]["resolutions"]["FRA_A_PAR"]["order_type"] == "MOVE"


def test_turn_preview_is_built_only_from_what_the_viewer_may_see():
    gid = secret_plan_match()
    state = client.get(f"/api/game?game_id={gid}", headers=bob_headers()).json()["state"]
    assert state["last_resolution"]["resolutions"]["FRA_A_PAR"]["order_type"] == "HOLD"

    for headers in (bob_headers(), {}):
        res = client.post(f"/api/simulate?game_id={gid}", headers=headers)
        assert res.status_code == 200
        assert res.json()["resolutions"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_set_power_does_not_return_hidden_orders():
    gid = secret_plan_match()
    res = client.post(f"/api/power?game_id={gid}", json={"power": "FRANCE"})
    assert res.status_code == 200
    assert_plan_hidden(res.json())


def test_saving_a_live_match_copies_only_what_the_caller_sees():
    gid = secret_plan_match()
    res = client.post(
        f"/api/games/save-sandbox?game_id={gid}",
        json={"name": "Peek", "user_id": BOB_ID, "email": "bob@test.com"},
        headers=bob_headers(),
    )
    assert res.status_code == 200
    copy_id = res.json()["game_id"]
    assert GAMES[copy_id].orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_private_sandbox_opens_only_for_your_own_seat():
    gid = secret_plan_match()
    for headers in (bob_headers(), {}):
        res = client.post(
            f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}, headers=headers
        )
        assert res.status_code == 403

    own = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "GERMANY"}, headers=bob_headers()
    )
    assert own.status_code == 200
    assert own.json()["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_only_the_seat_holder_carries_sandbox_orders_into_the_match():
    gid = secret_plan_match()
    sandbox_id = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "GERMANY"}, headers=bob_headers()
    ).json()["game_id"]
    GAMES[sandbox_id].orders["GER_A_BER"] = (
        GAMES[sandbox_id]
        .orders["GER_A_BER"]
        .model_copy(update={"order_type": OrderType.MOVE, "target": "SIL", "is_explicit": True})
    )

    res = client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": "GERMANY"})
    assert res.status_code == 200
    assert sandbox_id not in GAMES
    assert GAMES[gid].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_a_batch_cannot_order_another_powers_units():
    gid = secret_plan_match()
    res = client.post(
        f"/api/orders/batch?game_id={gid}",
        json={
            "power": "GERMANY",
            "orders": [
                {
                    "unit_id": "FRA_A_PAR",
                    "power": "GERMANY",
                    "unit_type": "A",
                    "origin": "PAR",
                    "order_type": "HOLD",
                    "is_explicit": True,
                }
            ],
        },
        headers=bob_headers(),
    )
    assert res.status_code == 403
    assert GAMES[gid].orders["FRA_A_PAR"].order_type == OrderType.MOVE


def test_a_build_slot_belongs_to_the_power_it_names():
    gid = secret_plan_match()
    res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "BUILD_FRANCE_PAR",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "BUILD",
                "is_explicit": True,
            }
        },
        headers=bob_headers(),
    )
    assert res.status_code == 403
    assert "BUILD_FRANCE_PAR" not in GAMES[gid].orders


def test_nobody_orders_an_empty_seat():
    gid = secret_plan_match()
    order = {
        "order": {
            "unit_id": "RUS_A_MOS",
            "power": "RUSSIA",
            "unit_type": "A",
            "origin": "MOS",
            "order_type": "MOVE",
            "target": "UKR",
            "is_explicit": True,
        }
    }
    for headers in (bob_headers(), {}):
        assert (
            client.post(f"/api/order?game_id={gid}", json=order, headers=headers).status_code == 403
        )
    assert GAMES[gid].orders["RUS_A_MOS"].order_type == OrderType.HOLD


def socket_state(path: str, token: str | None = None) -> dict:
    with client.websocket_connect(path) as ws:
        if "handshake=1" in path:
            ws.send_json({"type": "auth", "token": token})
        msg = ws.receive_json()
        assert msg["type"] == "game_update"
        return msg["state"]


def test_socket_shows_hidden_orders_only_to_their_seat():
    gid = secret_plan_match()
    assert_plan_hidden(socket_state(f"/ws/games/{gid}?power=FRANCE"))
    assert_plan_hidden(
        socket_state(f"/ws/games/{gid}?power=FRANCE&handshake=1", make_jwt(BOB_ID, "bob@test.com"))
    )
    assert_plan_hidden(socket_state(f"/ws/games/{gid}?power=FRANCE&handshake=1", "not-a-token"))

    own = socket_state(f"/ws/games/{gid}?handshake=1", make_jwt(ALICE_ID, "alice@test.com"))
    assert own["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"


def test_private_match_socket_admits_seated_players_without_the_passcode():
    from starlette.websockets import WebSocketDisconnect

    gid = secret_plan_match(private=True)
    own = socket_state(f"/ws/games/{gid}?handshake=1", make_jwt(BOB_ID, "bob@test.com"))
    assert own["orders"]["GER_A_BER"]["order_type"] == "HOLD"

    with pytest.raises(WebSocketDisconnect) as refused:
        socket_state(f"/ws/games/{gid}?handshake=1", None)
    assert refused.value.code == 4403

    assert_plan_hidden(socket_state(f"/ws/games/{gid}?passcode=Secret1901"))


def test_admin_check_fails_closed_for_a_game_that_is_not_loaded():
    from fastapi import HTTPException
    from main import verify_admin_access

    with pytest.raises(HTTPException) as denied:
        verify_admin_access("mp_never_loaded", None)
    assert denied.value.status_code == 404


# ==============================================================================
# Turn history: resolved orders are public, the current turn's never are
# ==============================================================================


def test_turn_history_never_shows_the_current_turns_orders():
    gid = secret_plan_match()
    # Nothing has resolved, so Alice's plan is in no history entry.
    assert client.get(f"/api/history?game_id={gid}", headers=bob_headers()).json() == []

    assert client.post(f"/api/adjudicate?game_id={gid}", headers=alice_headers()).status_code == 200
    # Alice plans her fall move; Bob must not see it.
    res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "BUR",
                "order_type": "MOVE",
                "target": "MUN",
                "is_explicit": True,
            }
        },
        headers=alice_headers(),
    )
    assert res.status_code == 200, res.text

    for headers in (bob_headers(), {}):
        entries = client.get(f"/api/history?game_id={gid}", headers=headers).json()
        assert [(e["season"], e["phase"]) for e in entries] == [("Spring", "Movement")]
        # The resolved spring move is public now.
        past = client.get(f"/api/history/0?game_id={gid}", headers=headers).json()
        assert past["orders"]["FRA_A_PAR"]["target"] == "BUR"
        assert past["resolution"]["resolutions"]["FRA_A_PAR"]["succeeded"] is True
        assert client.get(f"/api/history/1?game_id={gid}", headers=headers).status_code == 404
        french_targets = {o["target"] for o in past["orders"].values() if o["power"] == "FRANCE"}
        assert "MUN" not in french_targets


def test_turn_history_of_a_private_sandbox_is_never_served():
    gid = secret_plan_match()
    sandbox_id = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}, headers=alice_headers()
    ).json()["game_id"]
    # Alice steps her private copy forward, so its history holds her live plan.
    client.post(f"/api/adjudicate?game_id={sandbox_id}", headers=alice_headers())

    for headers in (bob_headers(), alice_headers(), {}):
        assert client.get(f"/api/history?game_id={sandbox_id}", headers=headers).status_code == 404
        assert (
            client.get(f"/api/history/0?game_id={sandbox_id}", headers=headers).status_code == 404
        )


def test_turn_history_of_a_private_match_needs_the_passcode():
    gid = secret_plan_match(private=True)
    client.post(f"/api/adjudicate?game_id={gid}", headers=alice_headers())

    for path in (f"/api/history?game_id={gid}", f"/api/history/0?game_id={gid}"):
        assert client.get(path).status_code == 403
        assert client.get(f"{path}&passcode=wrong").status_code == 403
        assert client.get(f"{path}&passcode=Secret1901").status_code == 200
        # Seated players need no passcode, as with GET /api/game.
        assert client.get(path, headers=alice_headers()).status_code == 200
