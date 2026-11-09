"""Memory and Supabase together: seats and orders across restarts, failed reads and saves, eviction."""

from unittest.mock import patch

from domain.game_state import GameState, MultiplayerGameSummary
from fastapi.testclient import TestClient
from main import app
from storage.store import (
    GAME_SUMMARIES,
    GAMES,
    UNSAVED_GAMES,
    cache_loaded_game,
)
from tests.integration.storage.helpers import (
    ARMY_PARIS_TO_BURGUNDY,
    BOB,
    CAL,
    _create_game,
    _join,
    _restart_container,
)

client = TestClient(app)


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

    # Asked as France's seat: everyone else sees the hidden order as a hold.
    orders = client.get(f"/api/game?game_id={game_id}&power=FRANCE").json()["state"]["orders"]
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

    with patch(
        "storage.supabase.load_all_summaries_from_db", side_effect=save_finishes_during_read
    ):
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
