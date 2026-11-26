"""Supabase PostgREST queries for `public.profiles`."""

import time
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from storage.supabase_codec import is_valid_uuid
from storage.supabase_http import (
    _elapsed_ms,
    _execute_http,
    _execute_write_op,
    get_headers,
    get_supabase_url,
    is_persistence_enabled,
    logger,
)
from telemetry import record_supabase_query


async def load_profile_names_from_db(client: httpx.AsyncClient | None = None) -> dict[str, str]:
    """Load user_id -> display_name mappings from public.profiles."""
    if not is_persistence_enabled():
        return {}

    url = f"{get_supabase_url()}/rest/v1/profiles?select=id,display_name"
    start = time.perf_counter()
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        if resp.status_code != 200:
            record_supabase_query("load_profiles", "error", resp.status_code, _elapsed_ms(start))
            logger.warning("Supabase profiles read failed: HTTP %d %s", resp.status_code, resp.text)
            return {}
        rows = resp.json()
        if not isinstance(rows, list):
            record_supabase_query("load_profiles", "error", resp.status_code, _elapsed_ms(start))
            return {}
        profiles = {
            str(r["id"]): (r.get("display_name") or "").strip()
            for r in rows
            if r.get("id")
            and (r.get("display_name") or "").strip()
            and "@" not in (r.get("display_name") or "")
        }
        record_supabase_query("load_profiles", "ok", resp.status_code, _elapsed_ms(start))
        return profiles
    except Exception as ex:
        record_supabase_query("load_profiles", "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception loading profiles: %s", ex)
        return {}


async def load_profile_name_from_db(
    user_id: str, client: httpx.AsyncClient | None = None
) -> str | None:
    """Load a single registered user's display_name from public.profiles by UUID."""
    if not is_persistence_enabled() or not is_valid_uuid(user_id):
        return None

    url = (
        f"{get_supabase_url()}/rest/v1/profiles?id=eq.{quote(user_id, safe='')}&select=display_name"
    )
    start = time.perf_counter()
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        if resp.status_code != 200:
            record_supabase_query("load_profile", "error", resp.status_code, _elapsed_ms(start))
            logger.warning("Supabase profile read failed: HTTP %d %s", resp.status_code, resp.text)
            return None
        rows = resp.json()
        if not isinstance(rows, list) or not rows:
            record_supabase_query("load_profile", "ok", resp.status_code, _elapsed_ms(start))
            return None
        raw_name = rows[0].get("display_name")
        clean = (raw_name or "").strip() if isinstance(raw_name, str) else ""
        record_supabase_query("load_profile", "ok", resp.status_code, _elapsed_ms(start))
        if not clean or "@" in clean:
            return None
        return clean
    except Exception as ex:
        record_supabase_query("load_profile", "error", 0, _elapsed_ms(start))
        logger.warning("Supabase exception loading profile '%s': %s", user_id, ex)
        return None


async def upsert_profile_display_name(
    user_id: str, display_name: str, client: httpx.AsyncClient | None = None
) -> bool:
    """Persist a user's display_name into public.profiles."""
    if not is_persistence_enabled() or not is_valid_uuid(user_id):
        return False
    url = f"{get_supabase_url()}/rest/v1/profiles?on_conflict=id"
    headers = {**get_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    payload = {
        "id": user_id,
        "display_name": display_name,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return await _execute_write_op(
        "upsert_profile",
        "post",
        url,
        headers,
        (200, 201, 204),
        "profile upsert",
        client=client,
        json_payload=payload,
    )
