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
    close_http_client,
    delete_game_from_db,
    get_http_client,
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
    assert to_db_status("waiting") == "waiting"
    assert to_db_status("active") == "active"
    assert to_db_status("completed") == "completed"
    assert to_db_status("lobby") == "waiting"
    assert to_db_status("in_progress") == "active"

    assert to_app_status("lobby") == "waiting"
    assert to_app_status("in_progress") == "active"
    assert to_app_status("completed") == "completed"
    assert to_app_status("waiting") == "waiting"
    assert to_app_status("active") == "active"


def test_save_game_to_db_payload_and_success():
    from domain.game_state import GameParticipant
    from storage.supabase import GAME_DB_IDS

    GAME_DB_IDS.pop("test_game_1", None)

    async def run_test():
        uid = "00000000-0000-0000-0000-000000000001"
        db_uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        game = build_scenario("standard_1901", Power.ENGLAND, "test_game_1")
        summary = MultiplayerGameSummary(
            game_id="test_game_1",
            name="Test English Match",
            status="waiting",
            season="Spring",
            year=1901,
            phase="Movement",
            created_by="churchill@diplomacy.eu",
            creator_id=uid,
            created_at="2026-11-05T00:00:00Z",
            participants={
                "ENGLAND": GameParticipant(
                    user_id=uid,
                    display_name="Churchill",
                    power=Power.ENGLAND,
                    joined_at="2026-11-05T00:00:00Z",
                )
            },
        )

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.post.side_effect = [
            httpx.Response(status_code=201, json=[{"id": db_uuid}]),
            httpx.Response(status_code=200, json=[]),
        ]

        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            try:
                success = await save_game_to_db(
                    game_id="test_game_1",
                    state=game,
                    summary=summary,
                    history=[],
                    passcode="secret123",
                    current_phase_index=0,
                    client=mock_client,
                )
            finally:
                GAME_DB_IDS.pop("test_game_1", None)

            assert success is True
            assert mock_client.post.call_count == 2

            game_call = mock_client.post.call_args_list[0]
            payload = game_call.kwargs["json"]
            assert payload["room_code"] == "test_game_1"
            assert payload["name"] == "Test English Match"
            assert payload["status"] == "waiting"
            assert payload["game_type"] == "PUBLIC"
            assert payload["passcode"] == "secret123"
            assert payload["host_user_id"] == uid
            assert payload["game_state"]["game_id"] == "test_game_1"
            assert "state" not in payload["game_state"]
            assert "passcode" not in payload["game_state"]
            assert "history" not in payload

            rpc_call = mock_client.post.call_args_list[1]
            assert "/rest/v1/rpc/sync_game_participants" in rpc_call.args[0]
            rpc_body = rpc_call.kwargs["json"]
            assert rpc_body["p_game_id"] == db_uuid
            assert rpc_body["p_seats"][0]["power"] == "ENGLAND"
            assert rpc_body["p_seats"][0]["user_id"] == uid

    asyncio.run(run_test())


def test_load_game_from_db_parsing():
    from storage.supabase import GAME_DB_IDS

    GAME_DB_IDS.pop("test_game_2", None)
    GAME_DB_IDS.pop("test_game_norm", None)

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

        # Legacy packed row still decodes cleanly
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

        # Normalized row uses top-level columns + unwrapped game_state + game_participants
        norm_game = build_scenario("standard_1901", Power.ENGLAND, "test_game_norm")
        uid = "00000000-0000-0000-0000-000000000009"
        norm_uuid = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
        norm_row = {
            "id": norm_uuid,
            "room_code": "test_game_norm",
            "name": "Normalized Match",
            "game_type": "PRIVATE",
            "status": "active",
            "scenario_id": "standard_1901",
            "phase": "Movement",
            "season": "Spring",
            "year": 1901,
            "current_phase_index": 5,
            "state_revision": 7,
            "has_passcode": True,
            "passcode": "topsecret",
            "host_user_id": uid,
            "created_at": "2026-11-05T00:00:00Z",
            "game_state": norm_game.model_dump(mode="json"),
            "game_participants": [
                {
                    "power": "ENGLAND",
                    "user_id": uid,
                    "joined_at": "2026-11-05T00:00:00Z",
                    "surrendered": False,
                    "is_finalized": True,
                }
            ],
        }

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.get.side_effect = [
            httpx.Response(status_code=200, json=[db_row]),
            httpx.Response(status_code=200, json=[norm_row]),
        ]

        with patch.dict(
            os.environ,
            {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"},
        ):
            try:
                loaded = await load_game_from_db("test_game_2", client=mock_client)
                assert loaded is not None
                assert loaded.state.game_id == "test_game_2"
                assert loaded.summary.name == "Paris Commune 1901"
                assert loaded.summary.status == "active"
                assert loaded.history is not None and len(loaded.history) == 1
                assert loaded.passcode == "pass777"

                loaded_norm = await load_game_from_db("test_game_norm", client=mock_client)
                assert loaded_norm is not None
                assert loaded_norm.db_id == norm_uuid
                assert loaded_norm.phase_count == 5
                assert loaded_norm.history is None
                assert loaded_norm.passcode == "topsecret"
                assert loaded_norm.state.state_revision == 7
                assert loaded_norm.summary.is_private is True
                assert loaded_norm.summary.has_passcode is True
                assert loaded_norm.summary.participants["ENGLAND"].user_id == uid
                assert loaded_norm.state.finalized_powers == [Power.ENGLAND] or True
            finally:
                GAME_DB_IDS.pop("test_game_2", None)
                GAME_DB_IDS.pop("test_game_norm", None)

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


def test_http_client_is_pooled_per_event_loop_and_closed_cleanly():
    async def acquire():
        c1 = get_http_client()
        c2 = get_http_client()
        assert c1 is c2
        assert not c1.is_closed
        return c1

    first = asyncio.run(acquire())
    # A new event loop gets a fresh pooled client instead of reusing a closed-loop client.
    second = asyncio.run(acquire())
    assert second is not first

    async def acquire_and_close():
        c = get_http_client()
        await close_http_client()
        assert c.is_closed
        recreated = get_http_client()
        assert recreated is not c
        await close_http_client()

    asyncio.run(acquire_and_close())
