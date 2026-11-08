import asyncio
import os
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
import httpx

from main import (
    app,
    GAMES,
    GAME_SUMMARIES,
    GAME_HISTORY,
    GAME_PASSCODES,
    DEFAULT_GAME_ID,
    HISTORY_UNSAVED,
    SAVES_RUNNING,
    UNSAVED_GAMES,
    build_scenario,
    cache_loaded_game,
    persist_game,
)
from models import GameState, MultiplayerGameSummary, GameParticipant, Power, UnitType
from database import (
    LOBBY_COLUMNS,
    SupabaseUnavailable,
    build_summary_from_row,
    is_persistence_enabled,
    to_db_status,
    to_app_status,
    save_game_to_db,
    load_game_from_db,
    load_all_summaries_from_db,
    delete_game_from_db,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def restore_seeded_lobbies():
    from main import seed_initial_multiplayer_lobbies
    yield
    seed_initial_multiplayer_lobbies()


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
    with patch.dict(os.environ, {"SUPABASE_URL": "https://abc123xyz.supabase.co", **env}, clear=True):
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
        with patch("main.load_all_summaries_from_db", side_effect=mock_load_empty):
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
        with patch("main.delete_game_from_db", side_effect=mock_delete):
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
        with patch("main.load_all_summaries_from_db", side_effect=mock_load_with_proto):
            res = client.get("/api/games")
            assert res.status_code == 200
            ids = [g["game_id"] for g in res.json()]
            assert "proto_1901" not in ids
            assert "proto_1901" not in GAME_SUMMARIES


class FakeSupabase:
    """Stands in for Supabase behind main.py, holding each game as a serialized row."""

    def __init__(self):
        self.rows = {}
        self.reads_fail = False
        self.writes_fail = False
        self.saved_history = []  # Whether each save carried the rollback history

    def _require_reads(self):
        if self.reads_fail:
            raise SupabaseUnavailable("HTTP 503 upstream unavailable")

    async def save(self, game_id, state, summary=None, history=None, passcode=None, client=None):
        if self.writes_fail:
            return False
        self.saved_history.append(history is not None)
        kept_history = self.rows.get(game_id, {}).get("history", [])
        self.rows[game_id] = {
            "state": state.model_dump(mode="json"),
            "summary": summary.model_dump(mode="json") if summary else None,
            "history": kept_history if history is None else [h.model_dump(mode="json") for h in history],
            "passcode": passcode,
        }
        return True

    async def load(self, game_id, client=None):
        self._require_reads()
        row = self.rows.get(game_id)
        if row is None:
            return None
        return (
            GameState.model_validate(row["state"]),
            MultiplayerGameSummary.model_validate(row["summary"]),
            [GameState.model_validate(h) for h in row["history"]],
            row["passcode"],
        )

    async def load_all(self, client=None):
        self._require_reads()
        return {
            gid: MultiplayerGameSummary.model_validate(row["summary"])
            for gid, row in self.rows.items()
        }

    async def delete(self, game_id, client=None):
        self.rows.pop(game_id, None)
        return True


@pytest.fixture
def supabase():
    db = FakeSupabase()
    env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
    with patch.dict(os.environ, env), patch("main.save_game_to_db", side_effect=db.save), patch(
        "main.load_game_from_db", side_effect=db.load
    ), patch("main.load_all_summaries_from_db", side_effect=db.load_all), patch(
        "main.delete_game_from_db", side_effect=db.delete
    ):
        yield db
    UNSAVED_GAMES.clear()
    HISTORY_UNSAVED.clear()


HOST = {"user_id": "host", "email": "host@test.com", "display_name": "Host"}
BOB = {"user_id": "bob", "email": "bob@test.com", "display_name": "Bob"}
CAL = {"user_id": "cal", "email": "cal@test.com", "display_name": "Cal"}
ARMY_PARIS_TO_BURGUNDY = {
    "unit_id": "FRA_A_PAR",
    "power": "FRANCE",
    "unit_type": "A",
    "origin": "PAR",
    "order_type": "MOVE",
    "target": "BUR",
    "is_explicit": True,
}


def _create_game(power="FRANCE"):
    res = client.post("/api/games", json={"name": "Friends", "creator_power": power, **HOST})
    assert res.status_code == 200
    return res.json()["game_id"]


def _join(game_id, power, player):
    """Claim a seat the way the client does: it refreshes the lobby straight after joining."""
    res = client.post(f"/api/games/{game_id}/join", json={"power": power, **player})
    assert res.status_code == 200
    assert client.get("/api/games").status_code == 200


def _restart_container(game_id):
    """Wipe what a Cloud Run instance held in memory, as scaling to zero does."""
    GAMES.pop(game_id, None)
    GAME_SUMMARIES.pop(game_id, None)
    GAME_HISTORY.pop(game_id, None)
    GAME_PASSCODES.pop(game_id, None)


def test_seat_survives_the_joiners_own_lobby_refresh(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)

    summary = GAME_SUMMARIES[game_id]
    assert sorted(summary.participants) == ["FRANCE", "GERMANY"]
    assert summary.status == "active"

    # The turn still resolves once both players are ready.
    for power in ("FRANCE", "GERMANY"):
        res = client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})
        assert res.status_code == 200
    assert GAMES[game_id].season == "Fall"

    # And nobody else can take the seat.
    res = client.post(f"/api/games/{game_id}/join", json={"power": "GERMANY", **CAL})
    assert res.status_code == 409


def test_seat_survives_a_restart(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)

    _restart_container(game_id)

    state = client.get(f"/api/game?game_id={game_id}").json()
    assert sorted(state["summary"]["participants"]) == ["FRANCE", "GERMANY"]
    assert state["summary"]["status"] == "active"


def test_surrender_and_leave_stays_gone_after_lobby_refresh(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _join(game_id, "RUSSIA", CAL)

    res = client.post(
        f"/api/games/{game_id}/surrender", json={"power": "GERMANY", "leave": True, **BOB}
    )
    assert res.status_code == 200

    listed = {g["game_id"]: g for g in client.get("/api/games").json()}
    assert sorted(listed[game_id]["participants"]) == ["FRANCE", "RUSSIA"]
    assert "GERMANY" not in supabase.rows[game_id]["summary"]["participants"]


def test_drafted_order_survives_a_restart(supabase):
    game_id = _create_game()
    res = client.post(f"/api/order?game_id={game_id}", json={"order": ARMY_PARIS_TO_BURGUNDY})
    assert res.status_code == 200

    _restart_container(game_id)

    orders = client.get(f"/api/game?game_id={game_id}").json()["state"]["orders"]
    assert orders["FRA_A_PAR"]["target"] == "BUR"


def test_failed_lobby_read_changes_nothing(supabase):
    game_id = _create_game()
    client.post(f"/api/order?game_id={game_id}", json={"order": ARMY_PARIS_TO_BURGUNDY})
    live_state = GAMES[game_id]

    supabase.reads_fail = True
    res = client.get("/api/games")

    assert res.status_code == 200
    assert game_id in [g["game_id"] for g in res.json()]
    assert GAMES[game_id] is live_state
    assert GAMES[game_id].orders["FRA_A_PAR"].target == "BUR"


def test_game_survives_failed_first_save_and_saves_on_next_change(supabase):
    supabase.writes_fail = True
    game_id = _create_game()
    assert game_id not in supabase.rows
    supabase.writes_fail = False

    # The read works and the game has no row, but it was never saved, so it was not deleted.
    assert game_id in [g["game_id"] for g in client.get("/api/games").json()]
    assert client.get(f"/api/games/{game_id}").status_code == 200
    assert client.get(f"/api/game?game_id={game_id}").status_code == 200

    client.post(f"/api/order?game_id={game_id}", json={"order": ARMY_PARIS_TO_BURGUNDY})
    assert game_id in supabase.rows
    assert game_id not in UNSAVED_GAMES


def test_lobby_read_overlapping_a_first_save_does_not_evict_the_game(supabase):
    game_id = _create_game()
    UNSAVED_GAMES.add(game_id)
    read_all = supabase.load_all

    async def save_finishes_during_read(client=None):
        rows_seen_by_read = await read_all()
        UNSAVED_GAMES.discard(game_id)
        rows_seen_by_read.pop(game_id, None)
        return rows_seen_by_read

    with patch("main.load_all_summaries_from_db", side_effect=save_finishes_during_read):
        client.get("/api/games")

    assert game_id in GAMES


def test_game_deleted_from_supabase_is_still_evicted(supabase):
    game_id = _create_game()
    del supabase.rows[game_id]

    assert game_id not in [g["game_id"] for g in client.get("/api/games").json()]
    assert game_id not in GAMES


def test_game_details_read_leaves_the_live_game_alone(supabase):
    game_id = _create_game()
    supabase.writes_fail = True
    client.post(f"/api/order?game_id={game_id}", json={"order": ARMY_PARIS_TO_BURGUNDY})
    supabase.writes_fail = False
    live_state = GAMES[game_id]

    assert client.get(f"/api/games/{game_id}").status_code == 200

    assert GAMES[game_id] is live_state
    assert GAMES[game_id].orders["FRA_A_PAR"].target == "BUR"


def test_game_details_survive_a_failed_read(supabase):
    game_id = _create_game()
    supabase.reads_fail = True

    assert client.get(f"/api/games/{game_id}").status_code == 200
    assert game_id in GAMES


def test_game_details_evict_a_game_deleted_from_supabase(supabase):
    game_id = _create_game()
    del supabase.rows[game_id]

    assert client.get(f"/api/games/{game_id}").status_code == 404
    assert game_id not in GAMES


def test_failed_read_of_an_unloaded_game_is_not_reported_as_missing(supabase):
    game_id = _create_game()
    _restart_container(game_id)
    supabase.reads_fail = True

    assert client.get(f"/api/game?game_id={game_id}").status_code == 503
    assert client.get(f"/api/games/{game_id}").status_code == 503

    supabase.reads_fail = False
    assert client.get(f"/api/game?game_id={game_id}").status_code == 200


def test_delete_is_refused_when_the_owner_cannot_be_checked(supabase):
    game_id = _create_game()
    _restart_container(game_id)
    supabase.reads_fail = True

    assert client.delete(f"/api/games/{game_id}").status_code == 503
    assert game_id in supabase.rows


def test_overlapping_cold_start_reads_share_one_game_object(supabase):
    game_id = _create_game()
    first = supabase.rows[game_id]
    _restart_container(game_id)
    state = GameState.model_validate(first["state"])
    summary = MultiplayerGameSummary.model_validate(first["summary"])

    winner = cache_loaded_game(game_id, (state, summary, [], None))
    later = cache_loaded_game(game_id, (state.model_copy(deep=True), summary, [], None))

    assert later is winner
    assert GAMES[game_id] is winner


def test_saves_never_overlap_and_the_last_one_has_the_newest_state():
    async def run_test():
        game_id = "overlapping_saves"
        GAMES[game_id] = build_scenario("standard_1901", Power.FRANCE, game_id)
        running = 0
        most_running = 0
        saved_targets = []
        first_save_started = asyncio.Event()
        finish_first_save = asyncio.Event()

        async def slow_save(game_id, state, summary=None, history=None, passcode=None):
            nonlocal running, most_running
            running += 1
            most_running = max(most_running, running)
            target = state.orders["FRA_A_PAR"].target
            first_save_started.set()
            await finish_first_save.wait()
            saved_targets.append(target)
            running -= 1
            return True

        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env), patch("main.save_game_to_db", side_effect=slow_save):
            first = asyncio.create_task(persist_game(game_id))
            await first_save_started.wait()
            # These return at once, as the running save picks them up. The timeout turns a
            # regression, where they would wait on that save, into a failure and not a hang.
            GAMES[game_id].orders["FRA_A_PAR"].target = "BUR"
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            GAMES[game_id].orders["FRA_A_PAR"].target = "PIC"
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            finish_first_save.set()
            await asyncio.wait_for(first, timeout=1)

        assert most_running == 1
        assert saved_targets == [None, "PIC"]
        assert game_id not in UNSAVED_GAMES
        assert game_id not in SAVES_RUNNING
        GAMES.pop(game_id, None)

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


def test_private_sandbox_is_never_saved_or_listed(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)

    sandbox = client.post(f"/api/sandbox/enter?game_id={game_id}", json={"power": "FRANCE"}).json()
    sandbox_id = sandbox["game_id"]
    client.post(
        f"/api/order?game_id={sandbox_id}",
        json={"order": {**ARMY_PARIS_TO_BURGUNDY, "unit_id": "FRA_A_MAR", "origin": "MAR"}},
    )

    assert sandbox_id not in supabase.rows
    assert sandbox_id not in [g["game_id"] for g in client.get("/api/games").json()]
    # Lobby syncing leaves it alone: it has no row and that does not mean it was deleted.
    assert sandbox_id in GAMES


def test_shared_default_board_survives_lookup_of_a_missing_row(supabase):
    assert client.get("/api/games/proto_1901").status_code == 404
    assert client.get("/api/game?game_id=proto_1901").status_code == 200


def _resolve_turn(game_id):
    for power in ("FRANCE", "GERMANY"):
        client.post(f"/api/finalize?game_id={game_id}", json={"power": power, "force": True})


def _rollback_headers():
    import jwt
    import os
    secret = os.getenv("SUPABASE_JWT_SECRET", "k" * 32)
    return {
        "Authorization": "Bearer "
        + jwt.encode(
            {"sub": HOST["user_id"], "email": HOST["email"], "aud": "authenticated"},
            secret,
            algorithm="HS256",
        )
    }


def test_an_order_click_leaves_the_saved_history_alone(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    assert len(supabase.rows[game_id]["history"]) == 1
    supabase.saved_history.clear()

    order = {**ARMY_PARIS_TO_BURGUNDY, "origin": "PAR"}
    assert client.post(f"/api/order?game_id={game_id}", json={"order": order}).status_code == 200

    assert supabase.saved_history == [False]
    assert len(supabase.rows[game_id]["history"]) == 1


def test_history_survives_a_restart_and_rollback_still_works(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    client.post(f"/api/order?game_id={game_id}", json={"order": {**ARMY_PARIS_TO_BURGUNDY}})

    _restart_container(game_id)
    client.get(f"/api/game?game_id={game_id}")

    res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_rollback_headers())
    assert res.status_code == 200
    assert res.json()["season"] == "Spring"
    assert supabase.rows[game_id]["history"] == []


def test_a_scenario_reset_saves_the_emptied_history(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)

    res = client.post(
        f"/api/scenario?game_id={game_id}",
        json={"scenario_id": "standard_1901"},
        headers=_rollback_headers(),
    )

    assert res.status_code == 200
    assert supabase.rows[game_id]["history"] == []


def test_a_history_save_that_fails_is_sent_again(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    supabase.writes_fail = True
    _resolve_turn(game_id)
    assert supabase.rows[game_id]["history"] == []
    supabase.writes_fail = False

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})

    assert len(supabase.rows[game_id]["history"]) == 1
    assert game_id not in HISTORY_UNSAVED


def test_a_turn_resolved_during_a_save_still_saves_its_history():
    async def run_test():
        game_id = "history_during_save"
        GAMES[game_id] = build_scenario("standard_1901", Power.FRANCE, game_id)
        GAME_HISTORY[game_id] = []
        HISTORY_UNSAVED.add(game_id)
        histories = []
        started = asyncio.Event()
        finish = asyncio.Event()

        async def slow_save(game_id, state, summary=None, history=None, passcode=None):
            histories.append(None if history is None else len(history))
            started.set()
            await finish.wait()
            return True

        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with patch.dict(os.environ, env), patch("main.save_game_to_db", side_effect=slow_save):
            first = asyncio.create_task(persist_game(game_id))
            await started.wait()
            GAME_HISTORY[game_id].append(GAMES[game_id].model_copy(deep=True))
            HISTORY_UNSAVED.add(game_id)
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            finish.set()
            await asyncio.wait_for(first, timeout=1)

        assert histories == [0, 1]
        assert game_id not in HISTORY_UNSAVED
        GAMES.pop(game_id, None)
        GAME_HISTORY.pop(game_id, None)

    asyncio.run(run_test())


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
    row = {"room_code": "lobby_row", "status": "in_progress", "summary": summary.model_dump(mode="json")}

    assert list(build_summary_from_row(row).participants) == ["FRANCE"]


def test_history_kept_inside_an_older_row_moves_to_its_column_on_the_next_save(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    _restart_container(game_id)

    client.get(f"/api/game?game_id={game_id}")
    assert game_id in HISTORY_UNSAVED
    supabase.saved_history.clear()

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})
    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "GERMANY"})

    assert supabase.saved_history == [True, False]
    assert game_id not in HISTORY_UNSAVED


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
        assert await history_count({**base, "game_state": {**blob, "history": [snapshot]}, "history": []}) == 1
        # Once a row has been rewritten the column wins over anything older.
        assert await history_count({**base, "game_state": {**blob, "history": [snapshot]}, "history": [snapshot, snapshot]}) == 2

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
