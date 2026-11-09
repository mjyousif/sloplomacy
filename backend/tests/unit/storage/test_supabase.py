"""The Supabase client on its own: configuration, status mapping, and saving, loading and deleting rows."""

import asyncio
import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from domain.board import Power
from domain.game_state import MultiplayerGameSummary
from scenarios.presets import build_scenario
from storage.supabase import (
    SupabaseUnavailable,
    delete_game_from_db,
    is_persistence_enabled,
    load_all_summaries_from_db,
    load_game_from_db,
    save_game_to_db,
    to_app_status,
    to_db_status,
)


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

    # 4. The URL may come from VITE_SUPABASE_URL, but the anon key never enables persistence
    with patch.dict(
        os.environ,
        {
            "VITE_SUPABASE_URL": "https://live-cluster.supabase.co",
            "VITE_SUPABASE_ANON_KEY": "eyJhbGciOi...",
        },
        clear=True,
    ):
        assert is_persistence_enabled() is False

    with patch.dict(
        os.environ,
        {
            "VITE_SUPABASE_URL": "https://live-cluster.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "secret_service_key",
        },
        clear=True,
    ):
        assert is_persistence_enabled() is True


def _fake_supabase_jwt(role: str) -> str:
    import base64
    import json

    def part(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{part({'alg': 'HS256', 'typ': 'JWT'})}.{part({'iss': 'supabase', 'role': role})}.signature"


@pytest.mark.parametrize(
    "env",
    [
        # The anon key passed off as the backend key, as the old deploy scripts did without a service key
        {"SUPABASE_KEY": "anon_key_value", "VITE_SUPABASE_ANON_KEY": "anon_key_value"},
        {"SUPABASE_SERVICE_ROLE_KEY": "anon_key_value", "SUPABASE_ANON_KEY": "anon_key_value"},
        # Keys that say they are not service_role
        {"SUPABASE_KEY": _fake_supabase_jwt("anon")},
        {"SUPABASE_KEY": _fake_supabase_jwt("authenticated")},
        {"SUPABASE_KEY": "sb_publishable_abc123"},
    ],
)
def test_persistence_refuses_keys_that_are_not_service_role(env):
    """RLS gives anon zero rows, so persisting with it would make every saved game look deleted."""
    with patch.dict(
        os.environ, {"SUPABASE_URL": "https://abc123xyz.supabase.co", **env}, clear=True
    ):
        assert is_persistence_enabled() is False


@pytest.mark.parametrize(
    "key",
    [_fake_supabase_jwt("service_role"), "sb_secret_abc123", "opaque_service_key"],
)
def test_persistence_accepts_service_role_keys(key):
    env = {
        "SUPABASE_URL": "https://abc123xyz.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": key,
        "VITE_SUPABASE_ANON_KEY": _fake_supabase_jwt("anon"),
    }
    with patch.dict(os.environ, env, clear=True):
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


def test_database_failures_are_not_reported_as_empty_results():
    async def run_test():
        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env):
            failing = AsyncMock(spec=httpx.AsyncClient)
            failing.get.return_value = httpx.Response(status_code=503, text="down")
            with pytest.raises(SupabaseUnavailable):
                await load_all_summaries_from_db(client=failing)
            with pytest.raises(SupabaseUnavailable):
                await load_game_from_db("some_game", client=failing)

            unreachable = AsyncMock(spec=httpx.AsyncClient)
            unreachable.get.side_effect = httpx.ConnectError("no route")
            with pytest.raises(SupabaseUnavailable):
                await load_all_summaries_from_db(client=unreachable)
            with pytest.raises(SupabaseUnavailable):
                await load_game_from_db("some_game", client=unreachable)

            malformed = AsyncMock(spec=httpx.AsyncClient)
            malformed.get.return_value = httpx.Response(status_code=200, json={"message": "?"})
            with pytest.raises(SupabaseUnavailable):
                await load_all_summaries_from_db(client=malformed)

            unusable_row = AsyncMock(spec=httpx.AsyncClient)
            unusable_row.get.return_value = httpx.Response(
                status_code=200, json=[{"room_code": "x", "game_state": {"state": {"bad": 1}}}]
            )
            with pytest.raises(SupabaseUnavailable):
                await load_game_from_db("x", client=unusable_row)

            empty = AsyncMock(spec=httpx.AsyncClient)
            empty.get.return_value = httpx.Response(status_code=200, json=[])
            assert await load_game_from_db("some_game", client=empty) is None
            assert await load_all_summaries_from_db(client=empty) == {}

    asyncio.run(run_test())
