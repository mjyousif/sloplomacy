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

    assert (user.user_id, user.email, user.is_authenticated) == ("demo", "demo@example.com", True)


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
