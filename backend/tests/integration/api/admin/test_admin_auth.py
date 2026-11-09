"""Who may use the admin endpoints: the creator's JWT (HS256 and ES256), strangers, expired or tampered tokens."""

import jwt
from fastapi.testclient import TestClient
from main import app
from tests.integration.api.helpers import make_auth_headers, make_token
from tests.ws_testing import receive_json


def test_admin_security_enforcement():
    client = TestClient(app)
    game_id = "mp_concert_104"

    # 1. Unauthenticated calls without a valid Bearer token fail with 401 Unauthorized
    unauth_headers = {"X-User-Id": "random_intruder", "X-User-Email": "intruder@evil.org"}
    r_unauth = client.post(f"/api/admin/rollback?game_id={game_id}", headers=unauth_headers)
    assert r_unauth.status_code == 401
    assert "Authentication required" in r_unauth.json()["detail"]

    # 2. Authenticated non-creator calls must fail with 403 Forbidden
    headers_intruder = make_auth_headers("random_intruder", "intruder@evil.org")

    r1 = client.post(f"/api/admin/rollback?game_id={game_id}", headers=headers_intruder)
    assert r1.status_code == 403
    assert "Administrator access denied" in r1.json()["detail"]

    r2 = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "MUN"},
        headers=headers_intruder,
    )
    assert r2.status_code == 403

    r3 = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "GERMANY", "unit_type": "A", "province": "SIL"},
        headers=headers_intruder,
    )
    assert r3.status_code == 403

    r4 = client.post(
        f"/api/admin/unit/destroy?game_id={game_id}",
        json={"unit_id": "GER_A_BER"},
        headers=headers_intruder,
    )
    assert r4.status_code == 403

    r5 = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1902, "phase": "Movement"},
        headers=headers_intruder,
    )
    assert r5.status_code == 403

    r6 = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "GERMANY"},
        headers=headers_intruder,
    )
    assert r6.status_code == 403

    r7 = client.post(
        f"/api/adjudicate?game_id={game_id}",
        headers=headers_intruder,
    )
    assert r7.status_code == 403
    assert "Administrator access denied" in r7.json()["detail"]

    r8 = client.post(
        f"/api/admin/unfinalize-all?game_id={game_id}",
        headers=headers_intruder,
    )
    assert r8.status_code == 403


# -------------------------------------------------------------
# Cryptographic Supabase JWT Authorization Tests
# -------------------------------------------------------------
def test_admin_jwt_valid_creator():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu")
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 200
    assert any(u["id"] == "GER_A_BER" and u["province"] == "SIL" for u in res.json()["units"])


def test_admin_jwt_non_creator_forbidden():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_romanov", "tsar@diplomacy.eu")
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 403
    assert "Administrator access denied" in res.json()["detail"]


def test_admin_jwt_expired():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu", exp_offset=-3600)
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 401
    assert "Authentication token has expired" in res.json()["detail"]


def test_admin_jwt_tampered_signature():
    client = TestClient(app)
    game_id = "mp_concert_104"
    token = make_token("bot_bismarck", "bismarck@diplomacy.eu")
    parts = token.split(".")
    tampered_sig = parts[2][:-4] + ("AAAA" if not parts[2].endswith("AAAA") else "BBBB")
    tampered_token = f"{parts[0]}.{parts[1]}.{tampered_sig}"
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        headers={"Authorization": f"Bearer {tampered_token}"},
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
    )
    assert res.status_code == 401
    assert "Invalid authentication token" in res.json()["detail"]


def test_admin_solo_sandbox_unauthenticated():
    client = TestClient(app)
    res = client.post(
        "/api/admin/unit/move?game_id=proto_1901",
        json={"unit_id": "FRA_A_PAR", "new_province": "BUR"},
    )
    assert res.status_code == 200
    assert any(u["id"] == "FRA_A_PAR" and u["province"] == "BUR" for u in res.json()["units"])


def test_admin_multiplayer_lobby_lifecycle_with_jwt():
    client = TestClient(app)
    # 1. Create a multiplayer lobby with User A
    res_create = client.post(
        "/api/games",
        json={
            "name": "Lifecycle Room",
            "creator_power": "ENGLAND",
            "user_id": "user_a",
            "email": "a@uk.gov",
        },
    )
    assert res_create.status_code == 200
    gid = res_create.json()["game_id"]

    token_a = make_token("user_a", "a@uk.gov")
    token_b = make_token("user_b", "b@france.gov")

    # User B joins as France
    res_join = client.post(
        f"/api/games/{gid}/join",
        json={"power": "FRANCE", "user_id": "user_b", "email": "b@france.gov"},
    )
    assert res_join.status_code == 200

    # 2. Attempt admin action as User B -> rejected with 403 Forbidden
    res_b_admin = client.post(
        f"/api/admin/set-turn?game_id={gid}",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"season": "Fall", "year": 1901, "phase": "Movement"},
    )
    assert res_b_admin.status_code == 403
    assert "Administrator access denied" in res_b_admin.json()["detail"]

    # 3. Perform admin action as User A -> succeeds and broadcasts WebSocket event to room
    with client.websocket_connect(f"/ws/games/{gid}") as ws:
        init_event = receive_json(ws)
        assert init_event["type"] == "game_update"

        res_a_admin = client.post(
            f"/api/admin/set-turn?game_id={gid}",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"season": "Fall", "year": 1901, "phase": "Movement"},
        )
        assert res_a_admin.status_code == 200
        assert res_a_admin.json()["season"] == "Fall"

        ws_event = receive_json(ws)
        assert ws_event["type"] == "game_update"
        assert ws_event["state"]["season"] == "Fall"


client = TestClient(app)


def test_admin_es256_asymmetric_jwt_verification(monkeypatch):
    """Verify that ES256 tokens signed with ECC (P-256) are cryptographically validated."""
    import time

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    # Generate an EC key pair for testing
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )

    monkeypatch.setenv("SUPABASE_JWT_PUBLIC_KEY", public_pem)

    client = TestClient(app)
    game_id = "mp_concert_104"

    def make_es256_token(user_id: str, email: str, exp_offset: int = 3600) -> str:
        return jwt.encode(
            {"sub": user_id, "email": email, "exp": int(time.time()) + exp_offset},
            private_key,
            algorithm="ES256",
        )

    # 1. Creator using ES256 (bot_bismarck)
    creator_token = make_es256_token("bot_bismarck", "bismarck@diplomacy.eu")
    res_creator = client.get(
        f"/api/admin/status?game_id={game_id}",
        headers={"Authorization": f"Bearer {creator_token}"},
    )
    assert res_creator.status_code == 200
    assert res_creator.json()["is_creator"] is True

    # 2. Non-creator using ES256 (intruder)
    intruder_token = make_es256_token("intruder_id", "intruder@evil.org")
    res_intruder = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers={"Authorization": f"Bearer {intruder_token}"},
    )
    assert res_intruder.status_code == 403

    # 3. Expired ES256 token -> 401
    expired_token = make_es256_token("bot_bismarck", "bismarck@diplomacy.eu", exp_offset=-60)
    res_expired = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res_expired.status_code == 401
    assert "expired" in res_expired.json()["detail"].lower()
