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
        mock_client.post.return_value = httpx.Response(status_code=201)
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            await save_game_to_db("no_history", game, client=mock_client)
            without = mock_client.post.call_args.kwargs["json"]
            await save_game_to_db("no_history", game, history=[game], client=mock_client)
            with_history = mock_client.post.call_args.kwargs["json"]

        assert "history" not in without
        assert "history" not in without["game_state"]
        assert len(with_history["history"]) == 1

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

        async def history_count(row):
            mock_client = AsyncMock(spec=httpx.AsyncClient)
            mock_client.get.return_value = httpx.Response(status_code=200, json=[row])
            with patch.dict(os.environ, env):
                loaded = await load_game_from_db("history_rows", client=mock_client)
            return len(loaded[2])

        assert await history_count({**base, "game_state": blob, "history": [snapshot]}) == 1
        assert (
            await history_count(
                {**base, "game_state": {**blob, "history": [snapshot]}, "history": []}
            )
            == 1
        )
        # Once a row has been rewritten the column wins over anything older.
        assert (
            await history_count(
                {
                    **base,
                    "game_state": {**blob, "history": [snapshot]},
                    "history": [snapshot, snapshot],
                }
            )
            == 2
        )

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
