"""Checking a private match's passcode and limiting wrong guesses (security/passcode.py)."""

import pytest
from fastapi import HTTPException
from security import passcode as pc
from storage.store import GAME_PASSCODES


@pytest.fixture
def private_match():
    GAME_PASSCODES["mp_unit"] = "Secret1901"
    GAME_PASSCODES["mp_other"] = "Other1901"
    yield "mp_unit"
    GAME_PASSCODES.pop("mp_unit", None)
    GAME_PASSCODES.pop("mp_other", None)


def test_the_passcode_matches_after_trimming(private_match):
    assert pc.passcode_matches(private_match, "Secret1901")
    assert pc.passcode_matches(private_match, "  Secret1901 ")
    assert not pc.passcode_matches(private_match, "secret1901")
    assert not pc.passcode_matches(private_match, "")
    assert not pc.passcode_matches(private_match, None)


def test_a_match_without_a_passcode_matches_nothing():
    assert not pc.passcode_matches("mp_none", "")
    assert not pc.passcode_matches("mp_none", "anything")


def test_a_passcode_that_is_not_ascii_is_compared_not_crashed(private_match):
    assert not pc.passcode_matches(private_match, "Sécret1901")


def test_too_many_wrong_tries_lock_out_even_the_right_passcode(private_match):
    for _ in range(pc.MAX_WRONG_PASSCODES):
        assert not pc.check_passcode(private_match, "wrong", "1.2.3.4")
    with pytest.raises(pc.PasscodeRateLimited):
        pc.check_passcode(private_match, "Secret1901", "1.2.3.4")


def test_a_missing_passcode_is_refused_but_not_counted(private_match):
    for _ in range(pc.MAX_WRONG_PASSCODES * 2):
        assert not pc.check_passcode(private_match, None, "1.2.3.4")
        assert not pc.check_passcode(private_match, "  ", "1.2.3.4")
    assert pc.check_passcode(private_match, "Secret1901", "1.2.3.4")


def test_the_right_passcode_clears_the_count(private_match):
    for _ in range(pc.MAX_WRONG_PASSCODES - 1):
        pc.check_passcode(private_match, "wrong", "1.2.3.4")
    assert pc.check_passcode(private_match, "Secret1901", "1.2.3.4")
    for _ in range(pc.MAX_WRONG_PASSCODES - 1):
        pc.check_passcode(private_match, "wrong", "1.2.3.4")
    assert pc.check_passcode(private_match, "Secret1901", "1.2.3.4")


def test_counts_are_kept_per_client_and_per_match(private_match):
    for _ in range(pc.MAX_WRONG_PASSCODES):
        pc.check_passcode(private_match, "wrong", "1.2.3.4")
    assert pc.check_passcode(private_match, "Secret1901", "5.6.7.8")
    assert pc.check_passcode("mp_other", "Other1901", "1.2.3.4")


def test_old_wrong_tries_age_out(private_match, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(pc.time, "monotonic", lambda: now[0])
    for _ in range(pc.MAX_WRONG_PASSCODES):
        pc.check_passcode(private_match, "wrong", "1.2.3.4")
    with pytest.raises(pc.PasscodeRateLimited):
        pc.check_passcode(private_match, "Secret1901", "1.2.3.4")
    now[0] += pc.WRONG_PASSCODE_WINDOW_SECONDS + 1
    assert pc.check_passcode(private_match, "Secret1901", "1.2.3.4")


def test_require_passcode_answers_403_then_429(private_match):
    with pytest.raises(HTTPException) as missing:
        pc.require_passcode(private_match, None, "1.2.3.4")
    assert missing.value.status_code == 403
    for _ in range(pc.MAX_WRONG_PASSCODES):
        with pytest.raises(HTTPException) as wrong:
            pc.require_passcode(private_match, "wrong", "1.2.3.4")
        assert wrong.value.status_code == 403
    with pytest.raises(HTTPException) as limited:
        pc.require_passcode(private_match, "Secret1901", "1.2.3.4")
    assert limited.value.status_code == 429


class _Conn:
    def __init__(self, headers, host="10.0.0.1"):
        self.headers = headers
        self.client = type("Client", (), {"host": host})()


def test_the_client_address_is_the_last_forwarded_hop():
    # Anything before the last entry is whatever the client sent, so it is never trusted.
    assert pc.client_address(_Conn({"x-forwarded-for": "6.6.6.6, 203.0.113.9"})) == "203.0.113.9"
    assert pc.client_address(_Conn({"x-forwarded-for": "203.0.113.9"})) == "203.0.113.9"
    assert pc.client_address(_Conn({})) == "10.0.0.1"
    assert pc.client_address(None) == "unknown"
