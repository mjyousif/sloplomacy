import asyncio
import os
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
import httpx

from main import app, GAMES, GAME_SUMMARIES, GAME_HISTORY, GAME_PASSCODES, DEFAULT_GAME_ID, build_scenario
from models import GameState, MultiplayerGameSummary, GameParticipant, Power, UnitType
from database import (
    is_persistence_enabled,
    to_db_status,
    to_app_status,
    save_game_to_db,
    load_game_from_db,
    load_all_summaries_from_db,
    delete_game_from_db,
)

client = TestClient(app)


def test_persistence_enabled_flag():
    # 1. When env vars are missing
    with patch.dict(os.environ, {}, clear=True):
        assert is_persistence_enabled() is False

    # 2. When placeholder URL is provided
    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://your-project-ref.supabase.co", "SUPABASE_KEY": "anon_key"},
    ):
        assert is_persistence_enabled() is False

    # 3. When valid credentials are provided
    with patch.dict(
        os.environ,
        {"SUPABASE_URL": "https://abc123xyz.supabase.co", "SUPABASE_KEY": "secret_service_key"},
    ):
        assert is_persistence_enabled() is True

    # 4. Fallback to VITE_SUPABASE_* variables
    with patch.dict(
        os.environ,
        {
            "VITE_SUPABASE_URL": "https://live-cluster.supabase.co",
            "VITE_SUPABASE_ANON_KEY": "eyJhbGciOi...",
        },
        clear=True,
    ):
        assert is_persistence_enabled() is True


def test_status_mapping():
    assert to_db_status("waiting") == "lobby"
    assert to_db_status("active") == "in_progress"
    assert to_db_status("completed") == "completed"

    assert to_app_status("lobby") == "waiting"
    assert to_app_status("in_progress") == "active"
    assert to_app_status("completed") == "completed"
    assert to_app_status("waiting") == "waiting"
    assert to_app_status("active") == "active"


def test_save_game_to_db_payload_and_success():
    async def run_test():
        game = build_scenario("standard_1901", Power.ENGLAND, "test_game_1")
        summary = MultiplayerGameSummary(
            game_id="test_game_1",
            name="Test English Match",
            status="waiting",
            season="Spring",
            year=1901,
            phase="Movement",
            created_by="churchill@diplomacy.eu",
            creator_id="00000000-0000-0000-0000-000000000001",
            created_at="2026-11-05T00:00:00Z",
        )

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_resp = httpx.Response(status_code=201)
        mock_client.post.return_value = mock_resp

        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            success = await save_game_to_db(
                game_id="test_game_1",
                state=game,
                summary=summary,
                history=[],
                passcode="secret123",
                client=mock_client,
            )

            assert success is True
            mock_client.post.assert_called_once()
            call_kwargs = mock_client.post.call_args.kwargs
            payload = call_kwargs["json"]
            assert payload["room_code"] == "test_game_1"
            assert payload["name"] == "Test English Match"
            assert payload["status"] == "lobby"
            assert payload["host_user_id"] == "00000000-0000-0000-0000-000000000001"
            assert "state" in payload["game_state"]
            assert payload["game_state"]["passcode"] == "secret123"

    asyncio.run(run_test())


def test_load_game_from_db_parsing():
    async def run_test():
        game = build_scenario("standard_1901", Power.FRANCE, "test_game_2")
        summary = MultiplayerGameSummary(
            game_id="test_game_2",
            name="Paris Commune 1901",
            status="active",
            season="Fall",
            year=1901,
            phase="Movement",
            created_by="clemenceau@diplomacy.eu",
            created_at="2026-11-05T00:00:00Z",
        )

        db_row = {
            "room_code": "test_game_2",
            "name": "Paris Commune 1901",
            "status": "in_progress",
            "phase": "Movement",
            "season": "Fall",
            "year": 1901,
            "game_state": {
                "state": game.model_dump(mode="json"),
                "summary": summary.model_dump(mode="json"),
                "history": [game.model_dump(mode="json")],
                "passcode": "pass777",
            },
        }

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_resp = httpx.Response(status_code=200, json=[db_row])
        mock_client.get.return_value = mock_resp

        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            loaded = await load_game_from_db("test_game_2", client=mock_client)
            assert loaded is not None
            loaded_state, loaded_summary, loaded_history, loaded_passcode = loaded
            assert loaded_state.game_id == "test_game_2"
            assert loaded_summary.name == "Paris Commune 1901"
            assert loaded_summary.status == "active"
            assert len(loaded_history) == 1
            assert loaded_passcode == "pass777"

    asyncio.run(run_test())


def test_delete_and_load_summaries_from_db():
    async def run_test():
        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.delete.return_value = httpx.Response(status_code=204)
        mock_client.get.return_value = httpx.Response(
            status_code=200,
            json=[
                {
                    "room_code": "game_a",
                    "name": "Match Alpha",
                    "status": "lobby",
                    "phase": "Movement",
                    "season": "Spring",
                    "year": 1901,
                },
                {
                    "room_code": "game_b",
                    "name": "Match Bravo",
                    "status": "in_progress",
                    "phase": "Retreats",
                    "season": "Fall",
                    "year": 1902,
                },
            ],
        )

        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            del_ok = await delete_game_from_db("game_a", client=mock_client)
            assert del_ok is True

            summaries = await load_all_summaries_from_db(client=mock_client)
            assert len(summaries) == 2
            assert summaries["game_a"].name == "Match Alpha"
            assert summaries["game_a"].status == "waiting"
            assert summaries["game_b"].name == "Match Bravo"
            assert summaries["game_b"].status == "active"

    asyncio.run(run_test())


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
        with patch("main.load_game_from_db", side_effect=mock_load):
            res = client.get(f"/api/game?game_id={gid}")
            assert res.status_code == 200
            data = res.json()
            assert data["state"]["game_id"] == gid
            assert data["summary"]["name"] == "Cross-Container Persistence Test"

            # Check that container 2's L1 RAM cache is now warmed
            assert gid in GAMES
            assert gid in GAME_SUMMARIES
