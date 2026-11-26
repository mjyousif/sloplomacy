"""Shared HTTP client pooling, Supabase configuration, and low-level PostgREST transport."""

import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any

import httpx
from telemetry import record_supabase_query

logger = logging.getLogger("diplomacy.database")

_HTTP_CLIENT: httpx.AsyncClient | None = None
_HTTP_CLIENT_LOOP: asyncio.AbstractEventLoop | None = None

ROOM_CODE_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

# The keys the backend has already complained about, so each problem is logged once per process
# instead of on every request.
_REJECTED_KEYS_LOGGED: set[str] = set()


class SupabaseUnavailable(Exception):
    """Supabase gave no usable answer, so nothing can be concluded about what it holds."""


def is_valid_room_code(code: str | None) -> bool:
    """Verify that a game_id / room_code conforms to safe alphanumeric syntax."""
    return bool(code and ROOM_CODE_REGEX.match(code))


def get_http_client() -> httpx.AsyncClient:
    """Return a shared pooled AsyncClient bound to the current running event loop."""
    global _HTTP_CLIENT, _HTTP_CLIENT_LOOP
    loop = asyncio.get_running_loop()
    if _HTTP_CLIENT is None or _HTTP_CLIENT.is_closed or _HTTP_CLIENT_LOOP is not loop:
        _HTTP_CLIENT = httpx.AsyncClient(
            timeout=10.0,
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
        )
        _HTTP_CLIENT_LOOP = loop
    return _HTTP_CLIENT


async def close_http_client() -> None:
    """Close the shared Supabase HTTP client (called on app shutdown)."""
    global _HTTP_CLIENT, _HTTP_CLIENT_LOOP
    client = _HTTP_CLIENT
    loop = _HTTP_CLIENT_LOOP
    _HTTP_CLIENT = None
    _HTTP_CLIENT_LOOP = None
    if client is not None and not client.is_closed:
        try:
            if loop is asyncio.get_running_loop():
                await client.aclose()
        except RuntimeError:
            pass


def get_supabase_url() -> str:
    url = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").strip()
    return url.rstrip("/")


def _key_role(key: str) -> str | None:
    """Return the Postgres role for a Supabase API key (prefix or JWT `role` claim)."""
    if key.startswith("sb_publishable_"):
        return "anon"
    if key.startswith("sb_secret_"):
        return "service_role"
    parts = key.split(".")
    if len(parts) != 3:
        return None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (ValueError, TypeError):
        return None
    role = claims.get("role") if isinstance(claims, dict) else None
    return role if isinstance(role, str) else None


def _log_rejected_key_once(reason: str, message: str) -> None:
    if reason in _REJECTED_KEYS_LOGGED:
        return
    _REJECTED_KEYS_LOGGED.add(reason)
    logger.error(message)


def get_supabase_key() -> str:
    """Return the service_role key or "" (never the anon key, which RLS gives zero rows)."""
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY") or ""
    ).strip()
    if not key:
        if get_supabase_url():
            _log_rejected_key_once(
                "missing",
                "SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is not. Game persistence is OFF: "
                "games live in memory only and are lost when the server restarts. The anon key is "
                "never used for persistence.",
            )
        return ""

    anon_keys = {
        (os.environ.get("VITE_SUPABASE_ANON_KEY") or "").strip(),
        (os.environ.get("SUPABASE_ANON_KEY") or "").strip(),
    } - {""}
    role = _key_role(key)
    if key in anon_keys or (role is not None and role != "service_role"):
        _log_rejected_key_once(
            "anon",
            "The Supabase key the backend was given is not a service role key "
            f"(role: {role or 'same as the anon key'}). Game persistence is OFF: RLS would give "
            "this key zero rows, and the lobby would drop every saved game. Set "
            "SUPABASE_SERVICE_ROLE_KEY to the service_role key.",
        )
        return ""
    return key


def is_persistence_enabled() -> bool:
    url, key = get_supabase_url(), get_supabase_key()
    return bool(url and key and "your-project-ref" not in url and "your-supabase" not in url)


def get_headers() -> dict[str, str]:
    key = get_supabase_key()
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _elapsed_ms(start_time: float) -> float:
    return (time.perf_counter() - start_time) * 1000.0


async def _execute_http(
    method: str,
    url: str,
    headers: dict[str, str],
    client: httpx.AsyncClient | None = None,
    json_payload: Any = None,
) -> httpx.Response:
    kwargs: dict[str, Any] = {"headers": headers, "timeout": 10.0}
    if json_payload is not None:
        kwargs["json"] = json_payload
    c = client or get_http_client()
    return await getattr(c, method)(url, **kwargs)


async def _execute_write_op(
    operation: str,
    method: str,
    url: str,
    headers: dict[str, str],
    ok_codes: tuple[int, ...],
    label: str,
    client: httpx.AsyncClient | None = None,
    json_payload: Any = None,
) -> bool:
    """Execute a Supabase write/delete HTTP request and record telemetry."""
    start = time.perf_counter()
    try:
        resp = await _execute_http(method, url, headers, client=client, json_payload=json_payload)
        if resp.status_code in ok_codes:
            record_supabase_query(operation, "ok", resp.status_code, _elapsed_ms(start))
            logger.debug("Supabase %s succeeded.", label)
            return True
        record_supabase_query(operation, "error", resp.status_code, _elapsed_ms(start))
        logger.warning("Supabase %s failed: HTTP %d %s", label, resp.status_code, resp.text)
        return False
    except Exception as ex:
        record_supabase_query(operation, "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception during %s: %s", label, ex)
        return False
