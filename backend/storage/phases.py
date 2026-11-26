"""Normalized `public.game_phases` persistence, lazy history loading, and War Ledger stats cache."""

import logging
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from domain.game_state import GameState, TurnHistoryEntry
from domain.ids import DEFAULT_GAME_ID
from domain.stats import CampaignStatsResponse
from fastapi import HTTPException
from storage import supabase
from storage.supabase_codec import deserialize_phase_row, serialize_phase_snapshot
from storage.supabase_http import (
    SupabaseUnavailable,
    _elapsed_ms,
    _execute_http,
    _execute_write_op,
    get_headers,
    get_supabase_url,
    is_persistence_enabled,
    is_valid_room_code,
)
from telemetry import record_supabase_query

logger = logging.getLogger("diplomacy.database")

# Authoritative in-memory history list (re-exported by storage.store for backwards compatibility).
GAME_HISTORY: dict[str, list[GameState]] = {DEFAULT_GAME_ID: []}
HISTORY_UNSAVED: set[str] = set()

# Tracks total resolved phases even before full phase snapshots are lazy-loaded after cold start.
GAME_PHASE_COUNTS: dict[str, int] = {}
GAME_HISTORY_LOADED: set[str] = set()
PENDING_PHASE_UPSERTS: dict[str, dict[int, GameState]] = {}
PENDING_PHASE_TRUNCATE_FROM: dict[str, int] = {}

# In-memory CampaignStatsResponse cache keyed by game state fingerprint (see issue #401).
STATS_CACHE: dict[str, tuple[tuple[Any, ...], CampaignStatsResponse]] = {}


def _uses_db_phases(game_id: str) -> bool:
    return (
        is_persistence_enabled()
        and game_id != DEFAULT_GAME_ID
        and not game_id.startswith("sbx_")
        and is_valid_room_code(game_id)
    )


def current_phase_count(game_id: str) -> int:
    """Total resolved phases for `game_id` (known even before lazy history load)."""
    if game_id in GAME_PHASE_COUNTS:
        return GAME_PHASE_COUNTS[game_id]
    return len(GAME_HISTORY.get(game_id, []))


def has_unsaved_phases(game_id: str) -> bool:
    return (
        game_id in HISTORY_UNSAVED
        or bool(PENDING_PHASE_UPSERTS.get(game_id))
        or game_id in PENDING_PHASE_TRUNCATE_FROM
    )


def clear_phase_tracking(game_id: str) -> None:
    """Clear all phase history, pending mutations, and stats cache for `game_id`."""
    GAME_HISTORY.pop(game_id, None)
    HISTORY_UNSAVED.discard(game_id)
    GAME_PHASE_COUNTS.pop(game_id, None)
    GAME_HISTORY_LOADED.discard(game_id)
    PENDING_PHASE_UPSERTS.pop(game_id, None)
    PENDING_PHASE_TRUNCATE_FROM.pop(game_id, None)
    STATS_CACHE.pop(game_id, None)


def set_loaded_phase_state(
    game_id: str, *, phase_count: int, history: list[GameState] | None
) -> None:
    """Initialize phase tracking when a game is loaded into memory."""
    if history is not None:
        GAME_HISTORY[game_id] = history
        GAME_HISTORY_LOADED.add(game_id)
        GAME_PHASE_COUNTS[game_id] = len(history)
    else:
        GAME_HISTORY.pop(game_id, None)
        GAME_HISTORY_LOADED.discard(game_id)
        GAME_PHASE_COUNTS[game_id] = max(0, int(phase_count))


def append_resolved_phase(game_id: str, snapshot: GameState) -> int:
    """Append a resolved phase snapshot without a 30-phase cap (issue #342)."""
    idx = current_phase_count(game_id)
    clean_snap = snapshot.model_copy(
        deep=True,
        update={
            "preview": None,
            "issues": [],
            "timer": None,
            "finalized_powers": [],
            "turn_history": [],
            "admin_log": [],
            "unit_options": {},
        },
    )
    if game_id in GAME_HISTORY_LOADED or not _uses_db_phases(game_id):
        GAME_HISTORY.setdefault(game_id, []).append(clean_snap)
        GAME_HISTORY_LOADED.add(game_id)
    GAME_PHASE_COUNTS[game_id] = idx + 1
    if _uses_db_phases(game_id):
        PENDING_PHASE_UPSERTS.setdefault(game_id, {})[idx] = clean_snap
        HISTORY_UNSAVED.add(game_id)
    return idx


def upsert_phase_at(game_id: str, phase_index: int, snapshot: GameState) -> None:
    """Update an existing resolved phase snapshot (e.g. consolidated Admin intervention)."""
    clean_snap = snapshot.model_copy(
        deep=True,
        update={
            "preview": None,
            "issues": [],
            "timer": None,
            "finalized_powers": [],
            "turn_history": [],
            "admin_log": [],
            "unit_options": {},
        },
    )
    if game_id in GAME_HISTORY_LOADED or not _uses_db_phases(game_id):
        history = GAME_HISTORY.setdefault(game_id, [])
        if 0 <= phase_index < len(history):
            history[phase_index] = clean_snap
        elif phase_index == len(history):
            history.append(clean_snap)
    GAME_PHASE_COUNTS[game_id] = max(current_phase_count(game_id), phase_index + 1)
    if _uses_db_phases(game_id):
        PENDING_PHASE_UPSERTS.setdefault(game_id, {})[phase_index] = clean_snap
        HISTORY_UNSAVED.add(game_id)


def truncate_phases_from(game_id: str, from_index: int) -> None:
    """Remove all resolved phases at `phase_index >= from_index` (admin rollback)."""
    idx = max(0, int(from_index))
    if game_id in GAME_HISTORY:
        del GAME_HISTORY[game_id][idx:]
    GAME_PHASE_COUNTS[game_id] = idx
    pending = PENDING_PHASE_UPSERTS.get(game_id)
    if pending:
        for k in [k for k in pending if k >= idx]:
            del pending[k]
    if _uses_db_phases(game_id):
        prev_trunc = PENDING_PHASE_TRUNCATE_FROM.get(game_id)
        PENDING_PHASE_TRUNCATE_FROM[game_id] = idx if prev_trunc is None else min(prev_trunc, idx)
        HISTORY_UNSAVED.add(game_id)


def replace_all_phases(game_id: str, snapshots: list[GameState]) -> None:
    """Replace a game's entire phase history (scenario reset, sandbox exit/export)."""
    copied = [
        s.model_copy(
            deep=True,
            update={"preview": None, "issues": [], "timer": None, "unit_options": {}},
        )
        for s in snapshots
    ]
    GAME_HISTORY[game_id] = copied
    GAME_HISTORY_LOADED.add(game_id)
    GAME_PHASE_COUNTS[game_id] = len(copied)
    if _uses_db_phases(game_id):
        PENDING_PHASE_TRUNCATE_FROM[game_id] = len(copied)
        if copied:
            PENDING_PHASE_UPSERTS[game_id] = {i: s for i, s in enumerate(copied)}
        else:
            PENDING_PHASE_UPSERTS.pop(game_id, None)
        HISTORY_UNSAVED.add(game_id)


async def load_phase_entries_from_db(
    game_id: str,
    *,
    db_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[TurnHistoryEntry]:
    """Fetch index-only phase metadata (zero JSONB) ordered by `phase_index` ascending."""
    resolved_id = db_id or await supabase.resolve_game_db_id(game_id, client=client)
    if not resolved_id:
        return []
    url = (
        f"{get_supabase_url()}/rest/v1/game_phases"
        f"?game_id=eq.{quote(resolved_id, safe='')}"
        f"&select=phase_index,season,year,phase&order=phase_index.asc"
    )
    start, status_code = time.perf_counter(), 0
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        status_code = resp.status_code
        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        entries = [
            TurnHistoryEntry(
                index=int(r["phase_index"]),
                season=str(r["season"]),
                year=int(r["year"]),
                phase=str(r["phase"]),
            )
            for r in rows
        ]
        record_supabase_query("load_phase_entries", "ok", status_code, _elapsed_ms(start))
        return entries
    except Exception as ex:
        record_supabase_query("load_phase_entries", "error", status_code, _elapsed_ms(start))
        raise SupabaseUnavailable(str(ex)) from ex


async def load_phase_from_db(
    game_id: str,
    phase_index: int,
    *,
    db_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> GameState | None:
    """Fetch a single resolved phase snapshot by `(game_id, phase_index)` in O(1)."""
    resolved_id = db_id or await supabase.resolve_game_db_id(game_id, client=client)
    if not resolved_id:
        return None
    url = (
        f"{get_supabase_url()}/rest/v1/game_phases"
        f"?game_id=eq.{quote(resolved_id, safe='')}&phase_index=eq.{int(phase_index)}"
        f"&select=phase_index,year,season,phase,state_revision,snapshot"
    )
    start, status_code = time.perf_counter(), 0
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        status_code = resp.status_code
        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        if not rows:
            record_supabase_query("load_phase", "not_found", status_code, _elapsed_ms(start))
            return None
        snap = deserialize_phase_row(rows[0], game_id)
        record_supabase_query("load_phase", "ok", status_code, _elapsed_ms(start))
        return snap
    except Exception as ex:
        record_supabase_query("load_phase", "error", status_code, _elapsed_ms(start))
        raise SupabaseUnavailable(str(ex)) from ex


async def load_all_phases_from_db(
    game_id: str,
    *,
    db_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[GameState]:
    """Fetch all resolved phase snapshots for `game_id` ordered by `phase_index` ascending."""
    resolved_id = db_id or await supabase.resolve_game_db_id(game_id, client=client)
    if not resolved_id:
        return []
    url = (
        f"{get_supabase_url()}/rest/v1/game_phases"
        f"?game_id=eq.{quote(resolved_id, safe='')}"
        f"&select=phase_index,year,season,phase,state_revision,snapshot&order=phase_index.asc"
    )
    start, status_code = time.perf_counter(), 0
    try:
        resp = await _execute_http("get", url, get_headers(), client=client)
        status_code = resp.status_code
        if resp.status_code != 200:
            raise SupabaseUnavailable(f"HTTP {resp.status_code} {resp.text}")
        rows = resp.json()
        if not isinstance(rows, list):
            raise SupabaseUnavailable(f"Unexpected response: {rows!r}")
        phases: list[GameState] = []
        for r in rows:
            try:
                phases.append(deserialize_phase_row(r, game_id))
            except Exception as ex:
                logger.warning(
                    "Skipping unparseable game_phases row for %s[%s]: %s",
                    game_id,
                    r.get("phase_index"),
                    ex,
                )
        record_supabase_query("load_all_phases", "ok", status_code, _elapsed_ms(start))
        return phases
    except Exception as ex:
        record_supabase_query("load_all_phases", "error", status_code, _elapsed_ms(start))
        raise SupabaseUnavailable(str(ex)) from ex


async def upsert_phases_to_db(
    game_id: str,
    phases_by_index: dict[int, GameState],
    *,
    db_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Upsert resolved phase rows into `public.game_phases` keyed by `(game_id, phase_index)`."""
    if not phases_by_index:
        return True
    resolved_id = db_id or await supabase.resolve_game_db_id(game_id, client=client)
    if not resolved_id:
        return False
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "game_id": resolved_id,
            "phase_index": int(idx),
            "year": int(snap.year),
            "season": snap.season,
            "phase": snap.phase,
            "state_revision": int(snap.state_revision),
            "resolved_at": now_iso,
            "snapshot": serialize_phase_snapshot(snap),
        }
        for idx, snap in sorted(phases_by_index.items())
    ]
    url = f"{get_supabase_url()}/rest/v1/game_phases?on_conflict=game_id,phase_index"
    headers = {**get_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"}
    return await _execute_write_op(
        "upsert_phases",
        "post",
        url,
        headers,
        (200, 201, 204),
        f"upsert {len(rows)} phase(s) for '{game_id}'",
        client=client,
        json_payload=rows,
    )


async def delete_phases_from_db(
    game_id: str,
    from_index: int,
    *,
    db_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> bool:
    """Delete resolved phases at `phase_index >= from_index` (admin rollback / reset)."""
    resolved_id = db_id or await supabase.resolve_game_db_id(game_id, client=client)
    if not resolved_id:
        return False
    url = (
        f"{get_supabase_url()}/rest/v1/game_phases"
        f"?game_id=eq.{quote(resolved_id, safe='')}&phase_index=gte.{max(0, int(from_index))}"
    )
    return await _execute_write_op(
        "delete_phases",
        "delete",
        url,
        get_headers(),
        (200, 204),
        f"delete phases >= {from_index} for '{game_id}'",
        client=client,
    )


def _apply_pending_to_history(game_id: str, db_history: list[GameState]) -> list[GameState]:
    merged = list(db_history)
    trunc = PENDING_PHASE_TRUNCATE_FROM.get(game_id)
    if trunc is not None:
        del merged[trunc:]
    for idx, snap in sorted(PENDING_PHASE_UPSERTS.get(game_id, {}).items()):
        if idx < len(merged):
            merged[idx] = snap
        elif idx == len(merged):
            merged.append(snap)
    return merged


async def ensure_history_loaded(game_id: str) -> list[GameState]:
    """Load full phase history on demand (lazy for cold-started games), keeping memory authoritative."""
    if game_id in GAME_HISTORY_LOADED or not _uses_db_phases(game_id):
        GAME_HISTORY_LOADED.add(game_id)
        return GAME_HISTORY.setdefault(game_id, [])

    try:
        db_history = await load_all_phases_from_db(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Turn history is unavailable right now. Please try again shortly.",
        ) from ex

    merged = _apply_pending_to_history(game_id, db_history)
    GAME_HISTORY[game_id] = merged
    GAME_HISTORY_LOADED.add(game_id)
    GAME_PHASE_COUNTS[game_id] = len(merged)
    return merged


async def list_phase_entries(game_id: str) -> list[TurnHistoryEntry]:
    """List turn metadata without downloading phase snapshots when history is not yet in RAM."""
    if game_id in GAME_HISTORY_LOADED or not _uses_db_phases(game_id):
        return [
            TurnHistoryEntry(index=i, season=s.season, year=s.year, phase=s.phase)
            for i, s in enumerate(GAME_HISTORY.get(game_id, []))
        ]

    try:
        entries = await load_phase_entries_from_db(game_id)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Turn history is unavailable right now. Please try again shortly.",
        ) from ex

    trunc = PENDING_PHASE_TRUNCATE_FROM.get(game_id)
    if trunc is not None:
        entries = [e for e in entries if e.index < trunc]
    by_idx = {e.index: e for e in entries}
    for idx, snap in PENDING_PHASE_UPSERTS.get(game_id, {}).items():
        by_idx[idx] = TurnHistoryEntry(
            index=idx, season=snap.season, year=snap.year, phase=snap.phase
        )
    ordered = [by_idx[i] for i in sorted(by_idx)]
    GAME_PHASE_COUNTS[game_id] = len(ordered)
    return ordered


async def get_phase_snapshot(game_id: str, index: int) -> GameState | None:
    """Return one historical phase snapshot by index (O(1) DB query on cold start)."""
    if index < 0:
        return None
    pending = PENDING_PHASE_UPSERTS.get(game_id, {})
    if index in pending:
        return pending[index]
    trunc = PENDING_PHASE_TRUNCATE_FROM.get(game_id)
    if trunc is not None and index >= trunc:
        return None

    if game_id in GAME_HISTORY_LOADED or not _uses_db_phases(game_id):
        history = GAME_HISTORY.get(game_id, [])
        return history[index] if 0 <= index < len(history) else None

    try:
        return await load_phase_from_db(game_id, index)
    except SupabaseUnavailable as ex:
        raise HTTPException(
            status_code=503,
            detail="Turn history is unavailable right now. Please try again shortly.",
        ) from ex


async def flush_phase_mutations(game_id: str, client: httpx.AsyncClient | None = None) -> bool:
    """Flush pending phase truncations and upserts to `public.game_phases`."""
    if not _uses_db_phases(game_id):
        HISTORY_UNSAVED.discard(game_id)
        return True

    trunc = PENDING_PHASE_TRUNCATE_FROM.get(game_id)
    if trunc is not None:
        ok = await delete_phases_from_db(game_id, trunc, client=client)
        if not ok:
            HISTORY_UNSAVED.add(game_id)
            return False
        if PENDING_PHASE_TRUNCATE_FROM.get(game_id) == trunc:
            PENDING_PHASE_TRUNCATE_FROM.pop(game_id, None)

    pending = PENDING_PHASE_UPSERTS.get(game_id)
    if pending:
        snapshot_batch = dict(pending)
        ok = await upsert_phases_to_db(game_id, snapshot_batch, client=client)
        if not ok:
            HISTORY_UNSAVED.add(game_id)
            return False
        cur = PENDING_PHASE_UPSERTS.get(game_id, {})
        for idx, val in snapshot_batch.items():
            if cur.get(idx) is val:
                cur.pop(idx, None)
        if not cur:
            PENDING_PHASE_UPSERTS.pop(game_id, None)

    if not has_unsaved_phases(game_id) or (
        game_id not in PENDING_PHASE_TRUNCATE_FROM and not PENDING_PHASE_UPSERTS.get(game_id)
    ):
        HISTORY_UNSAVED.discard(game_id)
        return True
    return False
