"""The unsigned dev sign-in: one decode path, and a token that never expires is refused."""

import time

import jwt
import pytest
from fastapi import HTTPException
from security.auth import decode_unverified_dev_token


def _unsigned(claims: dict) -> str:
    return jwt.encode(claims, "", algorithm="none")


def test_unsigned_token_with_a_future_expiry_names_its_user():
    user = decode_unverified_dev_token(
        _unsigned({"sub": "demo", "email": "demo@example.com", "exp": int(time.time()) + 60})
    )

    assert (user.user_id, user.is_authenticated) == ("demo", True)
    assert not hasattr(user, "email")


def test_unsigned_token_without_an_expiry_is_refused():
    with pytest.raises(HTTPException) as refused:
        decode_unverified_dev_token(_unsigned({"sub": "demo"}))

    assert refused.value.status_code == 401
    assert "exp" in refused.value.detail


def test_expired_unsigned_token_is_refused():
    with pytest.raises(HTTPException) as refused:
        decode_unverified_dev_token(_unsigned({"sub": "demo", "exp": int(time.time()) - 5}))

    assert refused.value.status_code == 401
    assert "expired" in refused.value.detail


def test_garbage_is_refused():
    with pytest.raises(HTTPException) as refused:
        decode_unverified_dev_token("not-a-token")

    assert refused.value.status_code == 401


@pytest.fixture
def clean_env(monkeypatch):
    for name in ("ENVIRONMENT", "ALLOW_INSECURE_DEV_AUTH", "K_SERVICE", "K_REVISION"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr("security.auth._DEV_AUTH_REFUSAL_LOGGED", False)
    return monkeypatch


def test_only_the_explicit_flag_enables_dev_auth(clean_env):
    from security.auth import is_insecure_dev_auth_allowed

    assert not is_insecure_dev_auth_allowed()
    for environment in ("development", "test"):
        clean_env.setenv("ENVIRONMENT", environment)
        assert not is_insecure_dev_auth_allowed()
        clean_env.setenv("ALLOW_INSECURE_DEV_AUTH", "false")
        assert not is_insecure_dev_auth_allowed()
        clean_env.delenv("ALLOW_INSECURE_DEV_AUTH")
    clean_env.setenv("ALLOW_INSECURE_DEV_AUTH", "true")
    assert is_insecure_dev_auth_allowed()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("K_SERVICE", "diplomacy-1901"),
        ("K_REVISION", "diplomacy-1901-00001"),
        ("ENVIRONMENT", "production"),
    ],
)
def test_flag_is_inert_on_cloud_run_or_in_production_and_says_so_once(
    clean_env, caplog, name, value
):
    from security.auth import is_insecure_dev_auth_allowed

    clean_env.setenv("ALLOW_INSECURE_DEV_AUTH", "true")
    clean_env.setenv(name, value)

    with caplog.at_level("ERROR", logger="diplomacy.auth"):
        assert not is_insecure_dev_auth_allowed()
        assert not is_insecure_dev_auth_allowed()

    assert len([r for r in caplog.records if "ALLOW_INSECURE_DEV_AUTH" in r.getMessage()]) == 1
