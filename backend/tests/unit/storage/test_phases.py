"""Unit tests for normalized `game_phases` persistence and lazy phase tracking."""

import asyncio
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.stats import CampaignStatsResponse
from scenarios.presets import build_scenario
from storage.phases import (
    GAME_HISTORY,
    GAME_HISTORY_LOADED,
    PENDING_PHASE_TRUNCATE_FROM,
    PENDING_PHASE_UPSERTS,
    STATS_CACHE,
    append_resolved_phase,
    clear_phase_tracking,
    current_phase_count,
    delete_phases_from_db,
    flush_phase_mutations,
    has_unsaved_phases,
    load_all_phases_from_db,
    load_phase_entries_from_db,
    load_phase_from_db,
    set_loaded_phase_state,
    truncate_phases_from,
    upsert_phases_to_db,
)
from storage.supabase import GAME_DB_IDS, SupabaseUnavailable
from storage.supabase_codec import serialize_phase_payload

ENV = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
DB_UUID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"


def _run(coro):
    with patch.dict(os.environ, ENV):
        return asyncio.run(coro)


def _client(method: str, *responses: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    if len(responses) == 1:
        getattr(c, method).return_value = responses[0]
    else:
        getattr(c, method).side_effect = list(responses)
    return c


def test_load_phase_entries_from_db_returns_ordered_entries():
    gid = "phase_entries_1"
    GAME_DB_IDS[gid] = DB_UUID
    try:
        rows = [
            {"phase_index": 0, "season": "Spring", "year": 1901, "phase": "Movement"},
            {"phase_index": 1, "season": "Fall", "year": 1901, "phase": "Movement"},
        ]
        client = _client("get", httpx.Response(200, json=rows))
        entries = _run(load_phase_entries_from_db(gid, client=client))
        assert [(e.index, e.season, e.year, e.phase) for e in entries] == [
            (0, "Spring", 1901, "Movement"),
            (1, "Fall", 1901, "Movement"),
        ]
        url = client.get.call_args.args[0]
        assert "select=phase_index,season,year,phase" in url
        assert f"game_id=eq.{DB_UUID}" in url
    finally:
        GAME_DB_IDS.pop(gid, None)


def test_load_phase_and_all_phases_from_db_roundtrip():
    gid = "phase_load_1"
    GAME_DB_IDS[gid] = DB_UUID
    try:
        snap0 = build_scenario("standard_1901", Power.FRANCE, gid)
        snap1 = snap0.model_copy(deep=True, update={"season": "Fall", "state_revision": 2})
        row0 = {
            "phase_index": 0,
            "year": snap0.year,
            "season": snap0.season,
            "phase": snap0.phase,
            "state_revision": snap0.state_revision,
            "payload": serialize_phase_payload(snap0),
        }
        row1 = {
            "phase_index": 1,
            "year": snap1.year,
            "season": snap1.season,
            "phase": snap1.phase,
            "state_revision": snap1.state_revision,
            "payload": serialize_phase_payload(snap1),
        }

        single_client = _client("get", httpx.Response(200, json=[row1]))
        one = _run(load_phase_from_db(gid, 1, client=single_client))
        assert one is not None
        assert one.season == "Fall"
        assert one.state_revision == 2

        missing_client = _client("get", httpx.Response(200, json=[]))
        assert _run(load_phase_from_db(gid, 99, client=missing_client)) is None

        all_client = _client("get", httpx.Response(200, json=[row0, row1]))
        loaded_all = _run(load_all_phases_from_db(gid, client=all_client))
        assert [s.season for s in loaded_all] == ["Spring", "Fall"]
    finally:
        GAME_DB_IDS.pop(gid, None)


def test_phase_read_failures_raise_supabase_unavailable():
    gid = "phase_fail_1"
    GAME_DB_IDS[gid] = DB_UUID
    try:
        failing = _client("get", httpx.Response(503, text="down"))
        with pytest.raises(SupabaseUnavailable):
            _run(load_phase_entries_from_db(gid, client=failing))
        with pytest.raises(SupabaseUnavailable):
            _run(load_phase_from_db(gid, 0, client=failing))
        with pytest.raises(SupabaseUnavailable):
            _run(load_all_phases_from_db(gid, client=failing))
    finally:
        GAME_DB_IDS.pop(gid, None)


def test_upsert_and_delete_phases_from_db():
    gid = "phase_write_1"
    GAME_DB_IDS[gid] = DB_UUID
    try:
        snap = build_scenario("standard_1901", Power.FRANCE, gid)
        post_client = _client("post", httpx.Response(201))
        ok = _run(upsert_phases_to_db(gid, {40: snap}, client=post_client))
        assert ok is True
        body = post_client.post.call_args.kwargs["json"]
        assert body[0]["game_id"] == DB_UUID
        assert body[0]["phase_index"] == 40

        del_client = _client("delete", httpx.Response(204))
        assert _run(delete_phases_from_db(gid, 40, client=del_client)) is True
        assert f"game_id=eq.{DB_UUID}&phase_index=gte.40" in del_client.delete.call_args.args[0]
    finally:
        GAME_DB_IDS.pop(gid, None)


def test_cold_start_append_at_phase_40_and_rollback_truncation():
    gid = "cold40"
    GAME_DB_IDS[gid] = DB_UUID
    clear_phase_tracking(gid)
    try:
        with patch.dict(os.environ, ENV):
            set_loaded_phase_state(gid, phase_count=40, history=None)
            assert current_phase_count(gid) == 40
            assert gid not in GAME_HISTORY_LOADED
            assert gid not in GAME_HISTORY

            snap40 = build_scenario("standard_1901", Power.ENGLAND, gid)
            idx = append_resolved_phase(gid, snap40)
            assert idx == 40
            assert current_phase_count(gid) == 41
            assert 40 in PENDING_PHASE_UPSERTS[gid]
            assert has_unsaved_phases(gid) is True

            truncate_phases_from(gid, 38)
            assert current_phase_count(gid) == 38
            assert 40 not in PENDING_PHASE_UPSERTS.get(gid, {})
            assert PENDING_PHASE_TRUNCATE_FROM[gid] == 38
    finally:
        GAME_DB_IDS.pop(gid, None)
        clear_phase_tracking(gid)


def test_flush_phase_mutations_retries_after_failure():
    gid = "retry40"
    GAME_DB_IDS[gid] = DB_UUID
    clear_phase_tracking(gid)
    try:
        snap = build_scenario("standard_1901", Power.ENGLAND, gid)

        async def run_test():
            set_loaded_phase_state(gid, phase_count=10, history=None)
            truncate_phases_from(gid, 8)
            append_resolved_phase(gid, snap)

            # Delete succeeds, upsert fails -> pending upsert remains dirty for retry.
            fail_client = AsyncMock(spec=httpx.AsyncClient)
            fail_client.delete.return_value = httpx.Response(204)
            fail_client.post.return_value = httpx.Response(500, text="boom")
            assert await flush_phase_mutations(gid, client=fail_client) is False
            assert gid not in PENDING_PHASE_TRUNCATE_FROM
            assert 8 in PENDING_PHASE_UPSERTS[gid]
            assert has_unsaved_phases(gid) is True

            retry_client = AsyncMock(spec=httpx.AsyncClient)
            retry_client.post.return_value = httpx.Response(201)
            assert await flush_phase_mutations(gid, client=retry_client) is True
            assert not has_unsaved_phases(gid)

        _run(run_test())
    finally:
        GAME_DB_IDS.pop(gid, None)
        clear_phase_tracking(gid)


def test_stats_cache_cleared_with_phase_tracking():
    gid = "stats_cache_test"
    STATS_CACHE[gid] = (
        (1,),
        CampaignStatsResponse(
            game_id=gid,
            turns_resolved=1,
            sc_timeline=[],
            powers={},
            diplomatic_matrix=[],
            awards=[],
        ),
    )
    assert gid in STATS_CACHE
    clear_phase_tracking(gid)
    assert gid not in STATS_CACHE
