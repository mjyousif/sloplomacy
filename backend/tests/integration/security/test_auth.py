"""Tokens and hardening: forged, tampered and expired JWTs, the local demo sign-in, headers, room codes and capacity."""

import jwt
import pytest
from fastapi.testclient import TestClient
from main import app
from storage.store import MAX_ACTIVE_GAMES
from storage.supabase import is_valid_room_code
from tests.integration.security.helpers import demo_sign_in_headers, load_quickstart, make_jwt

client = TestClient(app)


def test_jwt_alg_none_rejected(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("ALLOW_INSECURE_DEV_AUTH", "false")

    token = jwt.encode({"sub": "attacker", "email": "attacker@test.com"}, "", algorithm="none")
    res = client.get(
        "/api/admin/status?game_id=proto_1901",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 401


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


def test_game_capacity_limit_enforced(monkeypatch):
    from fastapi import HTTPException
    from storage.store import check_game_capacity

    # Simulate room capacity reached
    fake_games = {f"game_{i}": None for i in range(MAX_ACTIVE_GAMES + 1)}
    monkeypatch.setattr("storage.store.GAMES", fake_games)

    with pytest.raises(HTTPException) as exc_info:
        check_game_capacity()
    assert exc_info.value.status_code == 429
    assert "Server game capacity reached" in exc_info.value.detail


def test_room_code_sanitization():
    assert is_valid_room_code("mp_abc123") is True
    assert is_valid_room_code("my-custom-room_42") is True
    assert is_valid_room_code("../escape/path") is False
    assert is_valid_room_code("game' OR '1'='1") is False
    assert is_valid_room_code("game; DROP TABLE users;") is False
    assert is_valid_room_code("") is False
    assert is_valid_room_code("a" * 65) is False


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
