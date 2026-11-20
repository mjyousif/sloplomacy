"""A private match's passcode: checking it, and slowing down anyone who guesses it.

Every place that takes a passcode (viewing a match, its history and press, its game socket, and
joining it) goes through `check_passcode`. Wrong passcodes are counted per client address and
match, and once a client has made `MAX_WRONG_PASSCODES` wrong tries within
`WRONG_PASSCODE_WINDOW_SECONDS` it is refused (429) until the oldest try ages out. A correct
passcode clears its count. A missing passcode is refused but not counted, so a page that loads a
private match before asking for its passcode never uses up a try.

The counts live in memory, which is enough because the service runs a single instance.
"""

import hmac
import time
from collections import deque

from fastapi import HTTPException, Request, WebSocket, status
from storage.store import GAME_PASSCODES

MAX_WRONG_PASSCODES = 10
WRONG_PASSCODE_WINDOW_SECONDS = 600.0

# Above this many tracked (client, match) pairs, stale entries are swept on the next failure.
_SWEEP_ABOVE = 5000

_wrong_tries: dict[tuple[str, str], deque[float]] = {}


class PasscodeRateLimited(Exception):
    """Too many wrong passcodes from this client for this match."""


def client_address(conn: Request | WebSocket | None) -> str:
    """The address a request came from, used only to count wrong passcodes.

    On Cloud Run the peer is Google's front end, and uvicorn trusts forwarding headers only from
    127.0.0.1, so `conn.client` is the front end's address. The front end appends the real client
    address to `X-Forwarded-For`, so the last entry is the one a client cannot forge; anything
    before it may be whatever the client sent.
    """
    if conn is None:
        return "unknown"
    forwarded = conn.headers.get("x-forwarded-for")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last
    return conn.client.host if conn.client else "unknown"


def passcode_matches(game_id: str, provided: str | None) -> bool:
    """True when `provided` is this match's passcode. A match with no passcode matches nothing."""
    expected = GAME_PASSCODES.get(game_id) or ""
    given = (provided or "").strip()
    return bool(expected) and hmac.compare_digest(given.encode(), expected.encode())


def _recent(key: tuple[str, str], now: float) -> deque[float]:
    tries = _wrong_tries.get(key)
    if tries is None:
        return deque()
    while tries and now - tries[0] > WRONG_PASSCODE_WINDOW_SECONDS:
        tries.popleft()
    if not tries:
        _wrong_tries.pop(key, None)
    return tries


def _sweep(now: float) -> None:
    for key in list(_wrong_tries):
        _recent(key, now)


def check_passcode(game_id: str, provided: str | None, client: str) -> bool:
    """Whether `provided` is this match's passcode, counting a wrong one against `client`.

    Raises `PasscodeRateLimited` when the client has already made too many wrong tries, before
    the passcode is even compared, so a right guess cannot be found by carrying on.
    """
    now = time.monotonic()
    key = (client, game_id)
    if len(_recent(key, now)) >= MAX_WRONG_PASSCODES:
        raise PasscodeRateLimited
    if passcode_matches(game_id, provided):
        _wrong_tries.pop(key, None)
        return True
    if (provided or "").strip():
        if len(_wrong_tries) > _SWEEP_ABOVE:
            _sweep(now)
        _wrong_tries.setdefault(key, deque()).append(now)
    return False


def require_passcode(game_id: str, provided: str | None, client: str) -> None:
    """`check_passcode` for an HTTP route: 429 when rate limited, 403 when wrong or missing."""
    try:
        ok = check_passcode(game_id, provided, client)
    except PasscodeRateLimited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many wrong passcodes for this campaign. Try again in a few minutes.",
        ) from None
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Passcode required or incorrect for this private campaign.",
        )


def reset_passcode_tries() -> None:
    """Forget every counted wrong passcode (for tests)."""
    _wrong_tries.clear()
