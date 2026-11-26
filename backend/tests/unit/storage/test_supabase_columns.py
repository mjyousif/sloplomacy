"""The Supabase client's column handling: history in its own column, lobby reads that skip game states."""

import asyncio
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.game_state import GameParticipant, MultiplayerGameSummary
from scenarios.presets import build_scenario
from storage.supabase import (
    LOBBY_COLUMNS,
    SupabaseUnavailable,
    build_summary_from_row,
    load_all_summaries_from_db,
    load_game_from_db,
    save_game_to_db,
)


def test_save_without_history_leaves_the_column_out_of_the_write():
    async def run_test():
        game = build_scenario("standard_1901", Power.ENGLAND, "no_history")
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post.return_value = httpx.Response(status_code=201, json=[])
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            await save_game_to_db("no_history", game, client=mock_client)
            without = mock_client.post.call_args.kwargs["json"]
            await save_game_to_db(
                "no_history", game, history=[game], current_phase_index=3, client=mock_client
            )
            with_phase_idx = mock_client.post.call_args.kwargs["json"]

        # Normalized saves never inline history or summary blobs; phases save via storage.phases.
        assert "history" not in without
        assert "summary" not in without
        assert "history" not in without["game_state"]
        assert "current_phase_index" not in without
        assert "history" not in with_phase_idx
        assert with_phase_idx["current_phase_index"] == 3

    asyncio.run(run_test())


def test_lobby_read_does_not_download_game_states():
    async def run_test():
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = httpx.Response(status_code=200, json=[])
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            await load_all_summaries_from_db(client=mock_client)

        url = mock_client.get.call_args.args[0]
        assert f"select={LOBBY_COLUMNS}" in url
        assert "*" not in url

    asyncio.run(run_test())


def test_lobby_row_keeps_seats_from_the_packed_summary():
    summary = MultiplayerGameSummary(
        game_id="lobby_row",
        name="Seats",
        status="active",
        created_by="host@test.com",
        created_at="2026-11-05T00:00:00Z",
        participants={
            "FRANCE": GameParticipant(
                user_id="host",
                email="host@test.com",
                display_name="Host",
                power=Power.FRANCE,
                joined_at="2026-11-05T00:00:00Z",
            )
        },
    )
    row = {
        "room_code": "lobby_row",
        "status": "in_progress",
        "summary": summary.model_dump(mode="json"),
    }

    assert list(build_summary_from_row(row).participants) == ["FRANCE"]


def test_load_reads_history_from_its_column_and_from_older_rows():
    async def run_test():
        game = build_scenario("standard_1901", Power.FRANCE, "history_rows")
        snapshot = game.model_dump(mode="json")
        blob = {"state": snapshot, "summary": None, "passcode": None}
        base = {"room_code": "history_rows", "status": "lobby", "name": "x"}
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}

        async def load_row(row):
            mock_client = AsyncMock(spec=httpx.AsyncClient)
            mock_client.get.return_value = httpx.Response(status_code=200, json=[row])
            with patch.dict(os.environ, env):
                return await load_game_from_db("history_rows", client=mock_client)

        loaded_col = await load_row({**base, "game_state": blob, "history": [snapshot]})
        assert len(loaded_col.history) == 1

        loaded_blob = await load_row(
            {**base, "game_state": {**blob, "history": [snapshot]}, "history": []}
        )
        assert len(loaded_blob.history) == 1

        # Once migrated to normalized phases, current_phase_index > 0 keeps history lazy (None).
        loaded_norm = await load_row(
            {
                **base,
                "game_type": "PUBLIC",
                "status": "active",
                "current_phase_index": 12,
                "game_participants": [],
                "game_state": snapshot,
            }
        )
        assert loaded_norm.phase_count == 12
        assert loaded_norm.history is None

    asyncio.run(run_test())


def test_lobby_falls_back_to_whole_rows_if_supabase_refuses_the_columns():
    async def run_test():
        row = {"room_code": "game_a", "name": "Alpha", "status": "lobby"}

        async def get(url, headers=None, timeout=None):
            if "select=*" in url:
                return httpx.Response(status_code=200, json=[row])
            return httpx.Response(status_code=400, json={"message": "failed to parse select"})

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.side_effect = get
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            summaries = await load_all_summaries_from_db(client=mock_client)

        assert list(summaries) == ["game_a"]

    asyncio.run(run_test())


def test_lobby_outage_is_not_retried_as_a_refused_query():
    async def run_test():
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = httpx.Response(status_code=503, text="down")
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            with pytest.raises(SupabaseUnavailable):
                await load_all_summaries_from_db(client=mock_client)

        assert mock_client.get.call_count == 1

    asyncio.run(run_test())


def test_save_game_to_db_strips_creator_email_uuid_names_and_admin_log_emails():
    from domain.game_state import AdminActionLogEntry
    from storage.supabase import GAME_DB_IDS, save_game_to_db
    from storage.supabase_codec import serialize_participant_for_rpc

    uid = "11111111-1111-1111-1111-111111111111"
    db_uuid = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    GAME_DB_IDS.pop("save_strip", None)

    state = build_scenario("standard_1901", Power.FRANCE, "save_strip")
    state.admin_log = [
        AdminActionLogEntry(
            id="log1",
            timestamp="2026-11-05T00:00:00Z",
            actor_id=uid,
            actor="secret@example.com",
            season="Spring",
            year=1901,
            phase="Movement",
            summary_lines=["[ADMIN OVERRIDE] Edit"],
            acknowledged_by=[uid, "secret@example.com", "FRANCE"],
        )
    ]
    france_part = GameParticipant(
        user_id=uid,
        display_name="Freetvs",
        power=Power.FRANCE,
        joined_at="2026-11-05T00:00:00Z",
    )
    guest_part = GameParticipant(
        user_id="guest_1234",
        display_name="Envoy Guest",
        power=Power.ENGLAND,
        joined_at="2026-11-05T00:00:00Z",
    )
    summary = MultiplayerGameSummary(
        game_id="save_strip",
        name="Strip Test",
        status="waiting",
        created_by="secret@example.com",
        creator_id=uid,
        created_at="2026-11-05T00:00:00Z",
        participants={"FRANCE": france_part},
    )

    async def run_test():
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post.side_effect = [
            httpx.Response(status_code=201, json=[{"id": db_uuid}]),
            httpx.Response(status_code=200, json=[]),
        ]
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            try:
                await save_game_to_db(
                    "save_strip", state, summary, history=[state], client=mock_client
                )
            finally:
                GAME_DB_IDS.pop("save_strip", None)

        payload = mock_client.post.call_args_list[0].kwargs["json"]
        assert "created_by" not in payload
        assert "summary" not in payload
        assert payload["host_user_id"] == uid
        assert payload["creator_guest_id"] is None
        log_entry = payload["game_state"]["admin_log"][0]
        assert "actor" not in log_entry
        assert log_entry["actor_id"] == uid
        assert log_entry["acknowledged_by"] == [uid, "FRANCE"]

        rpc_seat = mock_client.post.call_args_list[1].kwargs["json"]["p_seats"][0]
        assert rpc_seat["user_id"] == uid
        assert rpc_seat["guest_display_name"] is None
        guest_seat = serialize_participant_for_rpc(guest_part, is_finalized=False)
        assert guest_seat["guest_id"] == "guest_1234"
        assert guest_seat["guest_display_name"] == "Envoy Guest"

    asyncio.run(run_test())


def test_serialize_state_for_db_strips_raw_uuid_actor_and_turn_history_emails():
    from domain.game_state import AdminActionLogEntry
    from storage.supabase_codec import _serialize_state_for_db

    uid = "11111111-1111-1111-1111-111111111111"
    state = build_scenario("standard_1901", Power.FRANCE, "state_scrub")
    state.admin_log = [
        AdminActionLogEntry(
            id="log_uuid_actor",
            timestamp="2026-11-05T00:00:00Z",
            actor_id=None,
            actor=uid,
            season="Spring",
            year=1901,
            phase="Movement",
            summary_lines=["[ADMIN OVERRIDE] Edit"],
            acknowledged_by=["FRANCE"],
        )
    ]
    state.turn_history = [
        "FRANCE (alice.secret@example.com) has formally surrendered! Sovereign forces have entered Civil Disorder.",
        "Spring 1901 Movement resolved.",
    ]

    serialized = _serialize_state_for_db(state)
    assert "actor" not in serialized["admin_log"][0]
    assert serialized["turn_history"] == [
        "FRANCE (Envoy) has formally surrendered! Sovereign forces have entered Civil Disorder.",
        "Spring 1901 Movement resolved.",
    ]


def test_load_profile_name_from_db_ignores_emails_and_validates_uuid():
    from storage.supabase import load_profile_name_from_db

    uid = "11111111-1111-1111-1111-111111111111"

    async def run_test():
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.side_effect = [
            httpx.Response(status_code=200, json=[{"display_name": "Talleyrand"}]),
            httpx.Response(status_code=200, json=[{"display_name": "leak@example.com"}]),
        ]
        with patch.dict(os.environ, env):
            assert await load_profile_name_from_db("not-a-uuid", client=mock_client) is None
            assert await load_profile_name_from_db(uid, client=mock_client) == "Talleyrand"
            assert await load_profile_name_from_db(uid, client=mock_client) is None

    asyncio.run(run_test())


def test_build_summary_from_row_backfills_creator_id_from_host_user_id():
    uid = "11111111-1111-1111-1111-111111111111"
    row = {
        "room_code": "backfill",
        "host_user_id": uid,
        "summary": {
            "game_id": "backfill",
            "name": "Backfill",
            "created_by": "secret@example.com",
            "created_at": "2026-11-05T00:00:00Z",
        },
    }
    loaded = build_summary_from_row(row)
    assert loaded is not None
    assert loaded.creator_id == uid
    assert loaded.created_by == ""


def _private_row_with_unreadable_summary(room_code="secret_room"):
    """A private game whose stored summary no longer validates, beside columns that say 'public'.

    A save never writes `is_private`, `passcode` or the seats to their own columns, so those read
    as a public, passcode-less, empty game.
    """
    broken = {
        "game_id": room_code,
        "name": "Private",
        "created_at": "2026-11-05T00:00:00Z",
        "is_private": True,
        "has_passcode": True,
        "participants": {"FRANCE": {"user_id": "alice"}},  # Missing fields: fails validation.
    }
    return {
        "room_code": room_code,
        "name": "Private",
        "status": "in_progress",
        "is_private": False,
        "game_state": {"summary": broken},
        "summary": broken,
    }


def test_unreadable_stored_summary_is_withheld_not_replaced_by_a_public_one():
    assert build_summary_from_row(_private_row_with_unreadable_summary()) is None


def test_unreadable_stored_summary_is_logged_as_a_warning(caplog):
    with caplog.at_level("WARNING", logger="diplomacy.database"):
        build_summary_from_row(_private_row_with_unreadable_summary())

    assert any("secret_room" in r.message and r.levelname == "WARNING" for r in caplog.records)


def test_row_without_any_stored_summary_still_reads_from_its_columns():
    summary = build_summary_from_row(
        {"room_code": "legacy", "name": "Old", "status": "lobby", "is_private": True}
    )

    assert summary is not None and summary.is_private


def test_second_readable_summary_still_wins_over_an_unreadable_one():
    good = MultiplayerGameSummary(
        game_id="mixed", name="Mixed", created_at="2026-11-05T00:00:00Z", is_private=True
    )
    row = {
        "room_code": "mixed",
        "game_state": {"summary": {"game_id": "mixed"}},
        "summary": good.model_dump(mode="json"),
    }

    assert build_summary_from_row(row).is_private


def test_loading_a_game_with_an_unreadable_summary_is_unavailable_not_public():
    async def run_test():
        game = build_scenario("standard_1901", Power.FRANCE, "secret_room")
        row = _private_row_with_unreadable_summary()
        row["game_state"] = {**row["game_state"], "state": game.model_dump(mode="json")}
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = httpx.Response(status_code=200, json=[row])
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env), pytest.raises(SupabaseUnavailable):
            await load_game_from_db("secret_room", client=mock_client)

    asyncio.run(run_test())


def test_lobby_read_marks_an_unreadable_summary_as_withheld():
    async def run_test():
        rows = [
            _private_row_with_unreadable_summary(),
            {"room_code": "fine", "name": "Fine", "status": "lobby"},
        ]
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.return_value = httpx.Response(status_code=200, json=rows)
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            summaries = await load_all_summaries_from_db(client=mock_client)

        assert summaries["secret_room"] is None
        assert summaries["fine"] is not None

    asyncio.run(run_test())
