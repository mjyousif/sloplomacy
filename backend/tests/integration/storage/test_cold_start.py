"""The app against a mocked Supabase: cold starts, lobby eviction, deleting, and the shared board staying unsaved."""

import asyncio
import os
from unittest.mock import patch

from domain.board import Power
from domain.game_state import MultiplayerGameSummary
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import build_scenario
from storage.store import (
    GAME_HISTORY,
    GAME_PASSCODES,
    GAME_SUMMARIES,
    GAMES,
)
from storage.supabase import (
    save_game_to_db,
)

client = TestClient(app)


def test_cold_start_container_recovery_integration():
    """
    Simulates a Cloud Run scale-to-zero event:
    1. Container 1 runs and holds game state.
    2. Cloud Run tears down Container 1 (RAM wiped).
    3. Container 2 spins up on cold start with empty memory.
    4. Client requests game: container 2 restores state from Supabase database.
    """
    gid = "cross_container_test_99"
    saved_state = build_scenario("standard_1901", Power.GERMANY, gid)
    saved_summary = MultiplayerGameSummary(
        game_id=gid,
        name="Cross-Container Persistence Test",
        status="waiting",
        season="Spring",
        year=1901,
        phase="Movement",
        created_by="kaiser@diplomacy.de",
        created_at="2026-11-05T00:00:00Z",
    )

    # Ensure memory is completely wiped (cold start)
    GAMES.pop(gid, None)
    GAME_SUMMARIES.pop(gid, None)
    GAME_HISTORY.pop(gid, None)
    GAME_PASSCODES.pop(gid, None)

    # Mock DB load returning the saved state
    async def mock_load(game_id):
        if game_id == gid:
            return (saved_state, saved_summary, [], None)
        return None

    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
    ):
        with patch("storage.supabase.load_game_from_db", side_effect=mock_load):
            res = client.get(f"/api/game?game_id={gid}")
            assert res.status_code == 200
            data = res.json()
            assert data["state"]["game_id"] == gid
            assert data["summary"]["name"] == "Cross-Container Persistence Test"

            # Check that container 2's L1 RAM cache is now warmed
            assert gid in GAMES
            assert gid in GAME_SUMMARIES


def test_list_games_evicts_games_deleted_from_supabase():
    """When a game is deleted directly from Supabase, list_games() purges it from in-memory cache."""
    gid = "mp_deleted_external"
    saved_summary = MultiplayerGameSummary(
        game_id=gid,
        name="Externally Deleted Match",
        status="waiting",
        season="Spring",
        year=1901,
        phase="Movement",
        created_by="user@diplomacy.com",
        created_at="2026-11-05T00:00:00Z",
    )
    GAME_SUMMARIES[gid] = saved_summary
    GAMES[gid] = build_scenario("standard_1901", Power.ENGLAND, gid)

    async def mock_load_empty(client=None):
        return {}

    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
    ):
        with patch("storage.supabase.load_all_summaries_from_db", side_effect=mock_load_empty):
            res = client.get("/api/games")
            assert res.status_code == 200
            returned_ids = [g["game_id"] for g in res.json()]
            assert gid not in returned_ids
            assert gid not in GAME_SUMMARIES
            assert gid not in GAMES


def test_delete_game_api_endpoint():
    """DELETE /api/games/{game_id} purges cache and invokes DB delete."""
    gid = "mp_to_delete"
    GAME_SUMMARIES[gid] = MultiplayerGameSummary(
        game_id=gid,
        name="Lobby To Delete",
        status="waiting",
        season="Spring",
        year=1901,
        phase="Movement",
        created_by="guest@diplomacy.local",
        creator_id="guest",
        created_at="2026-11-05T00:00:00Z",
    )
    GAMES[gid] = build_scenario("standard_1901", Power.TURKEY, gid)

    async def mock_delete(game_id, client=None):
        return True

    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
    ):
        with patch("storage.supabase.delete_game_from_db", side_effect=mock_delete):
            res = client.delete(f"/api/games/{gid}")
            assert res.status_code == 200
            assert res.json()["status"] == "deleted"
            assert gid not in GAME_SUMMARIES
            assert gid not in GAMES


def test_proto_1901_never_persisted_or_listed_in_lobbies():
    """Verify proto_1901 solo sandbox is rejected by save_game_to_db and excluded from list_games."""

    # 1. save_game_to_db rejects proto_1901
    async def run_save_test():
        state = build_scenario("standard_1901", Power.FRANCE, "proto_1901")
        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            ok = await save_game_to_db("proto_1901", state)
            assert ok is False

    asyncio.run(run_save_test())

    # 2. list_games never returns proto_1901 even if row existed
    async def mock_load_with_proto(client=None):
        return {
            "proto_1901": MultiplayerGameSummary(
                game_id="proto_1901",
                name="Accidental Proto",
                status="waiting",
                season="Spring",
                year=1901,
                phase="Movement",
                created_by="test@test.com",
                created_at="2026-11-05T00:00:00Z",
            )
        }

    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
    ):
        with patch("storage.supabase.load_all_summaries_from_db", side_effect=mock_load_with_proto):
            res = client.get("/api/games")
            assert res.status_code == 200
            ids = [g["game_id"] for g in res.json()]
            assert "proto_1901" not in ids
            assert "proto_1901" not in GAME_SUMMARIES
