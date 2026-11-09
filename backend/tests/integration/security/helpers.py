"""Helpers for the security tests: tokens, two players, and a match with a secret plan."""

import base64
import importlib.util
import json
import time
from pathlib import Path

import jwt
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES

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


def load_quickstart():
    current = Path(__file__).resolve().parent
    path = None
    while current.parent != current:
        candidate = current / "scripts" / "quickstart.py"
        if candidate.exists():
            path = candidate
            break
        candidate_legacy = current / "quickstart.py"
        if candidate_legacy.exists():
            path = candidate_legacy
            break
        current = current.parent
    if path is None:
        path = Path(__file__).resolve().parents[3] / "scripts" / "quickstart.py"
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


def socket_state(path: str, token: str | None = None) -> dict:
    with client.websocket_connect(path) as ws:
        if "handshake=1" in path:
            ws.send_json({"type": "auth", "token": token})
        msg = ws.receive_json()
        assert msg["type"] == "game_update"
        return msg["state"]
