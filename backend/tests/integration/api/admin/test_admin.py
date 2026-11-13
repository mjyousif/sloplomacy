"""Admin turn controls: status, rollback, set-turn, and the test seed endpoint."""

import pytest
from fastapi.testclient import TestClient
from main import app
from storage.store import GAME_HISTORY, GAME_SUMMARIES, GAMES, evict_game
from tests.integration.api.helpers import (
    _auth_headers,
    _finalize,
    _germany_moves_to_silesia,
    _new_game,
    _put_game_one_center_from_a_solo,
    _seated_game,
    make_auth_headers,
)


def test_admin_status_solo_and_multiplayer():
    client = TestClient(app)

    # 1. Solo sandbox game
    res = client.get("/api/admin/status?game_id=proto_1901")
    assert res.status_code == 200
    data = res.json()
    assert data["is_creator"] is True

    # 2. Multiplayer Match #104: Creator is bismarck@diplomacy.eu / bot_bismarck
    # Test with verified JWT
    res_bismarck = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers=make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu"),
    )
    assert res_bismarck.status_code == 200
    assert res_bismarck.json()["is_creator"] is True

    # Test with legacy headers fallback on GET status
    res_bismarck_legacy = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers={"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"},
    )
    assert res_bismarck_legacy.status_code == 200
    assert res_bismarck_legacy.json()["is_creator"] is True

    # Non-creator (Tsar Nicholas / bot_romanov)
    res_romanov = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers=make_auth_headers("bot_romanov", "tsar@diplomacy.eu"),
    )
    assert res_romanov.status_code == 200
    assert res_romanov.json()["is_creator"] is False


def test_admin_rollback_turn():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Initially at Spring 1901 Movement
    initial_res = client.get(f"/api/game?game_id={game_id}")
    assert initial_res.json()["state"]["season"] == "Spring"
    assert initial_res.json()["state"]["year"] == 1901

    # Attempt rollback before any turns have advanced -> 400
    rb_fail = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_fail.status_code == 400

    # Adjudicate turn to advance to Fall 1901
    adj_res = client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers)
    assert adj_res.status_code == 200
    assert adj_res.json()["season"] == "Fall"
    assert adj_res.json()["year"] == 1901

    # Status check indicates can_rollback is True and includes history_entries
    st_res = client.get(f"/api/admin/status?game_id={game_id}", headers=creator_headers)
    assert st_res.json()["can_rollback"] is True
    assert st_res.json()["history_count"] == 1
    assert st_res.json()["history_entries"] == [
        {"index": 0, "season": "Spring", "year": 1901, "phase": "Movement"}
    ]

    # Non-creator sees history_count/can_rollback=bool without leaking history_entries
    non_creator_headers = make_auth_headers("other_user", "other@diplomacy.eu")
    non_creator_res = client.get(
        f"/api/admin/status?game_id={game_id}", headers=non_creator_headers
    )
    assert non_creator_res.json()["is_creator"] is False
    assert non_creator_res.json()["history_entries"] == []

    # Roll back as creator
    rb_res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_res.status_code == 200
    restored = rb_res.json()
    assert restored["season"] == "Spring"
    assert restored["year"] == 1901
    assert any("[ADMIN OVERRIDE] Rolled back turn" in h for h in restored["turn_history"])


def test_admin_rollback_to_selected_snapshot_index():
    """Creator can roll back to any earlier snapshot by snapshot_index and discard later ones."""
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Advance twice: Spring 1901 -> Fall 1901 -> Winter 1901 Adjustments
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers).status_code
        == 200
    )
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=creator_headers).status_code
        == 200
    )

    st_res = client.get(f"/api/admin/status?game_id={game_id}", headers=creator_headers)
    assert st_res.status_code == 200
    entries = st_res.json()["history_entries"]
    assert entries == [
        {"index": 0, "season": "Spring", "year": 1901, "phase": "Movement"},
        {"index": 1, "season": "Fall", "year": 1901, "phase": "Movement"},
    ]

    # Out-of-range snapshot_index returns 400 without mutating history
    bad_res = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers=creator_headers,
        json={"snapshot_index": 99},
    )
    assert bad_res.status_code == 400

    # Roll back directly to index 0 (Spring 1901 Movement), truncating index 1
    rb_res = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers=creator_headers,
        json={"snapshot_index": 0},
    )
    assert rb_res.status_code == 200
    restored = rb_res.json()
    assert (restored["season"], restored["year"], restored["phase"]) == (
        "Spring",
        1901,
        "Movement",
    )

    after_res = client.get(f"/api/admin/status?game_id={game_id}", headers=creator_headers)
    assert after_res.json()["history_count"] == 0
    assert after_res.json()["history_entries"] == []


@pytest.mark.parametrize(
    "season, year, phase",
    [
        ("Spring", 1902, "Adjustments"),
        ("Fall", 1902, "Adjustments"),
        ("Winter", 1902, "Movement"),
        ("Winter", 1902, "Retreats"),
        ("Spring", 1900, "Movement"),
        ("Spring", -5, "Movement"),
    ],
)
def test_set_turn_refuses_impossible_turns_and_leaves_the_game_readable(season, year, phase):
    client = TestClient(app)
    game_before = GAMES["proto_1901"].model_copy(deep=True)

    res = client.post(
        "/api/admin/set-turn?game_id=proto_1901",
        json={"season": season, "year": year, "phase": phase},
    )

    assert res.status_code == 400
    assert client.get("/api/game?game_id=proto_1901").status_code == 200
    current = GAMES["proto_1901"]
    assert (current.season, current.year, current.phase) == (
        game_before.season,
        game_before.year,
        game_before.phase,
    )


@pytest.mark.parametrize(
    "season, phase",
    [
        ("Spring", "Movement"),
        ("Spring", "Retreats"),
        ("Fall", "Movement"),
        ("Fall", "Retreats"),
        ("Winter", "Adjustments"),
    ],
)
def test_set_turn_accepts_every_real_turn(season, phase):
    client = TestClient(app)
    res = client.post("/api/scenario?game_id=proto_1901", json={"scenario_id": "standard_1901"})
    assert res.status_code == 200

    res = client.post(
        "/api/admin/set-turn?game_id=proto_1901",
        json={"season": season, "year": 1902, "phase": phase},
    )

    assert res.status_code == 200
    assert client.get("/api/game?game_id=proto_1901").status_code == 200
    client.post("/api/scenario?game_id=proto_1901", json={"scenario_id": "standard_1901"})


client = TestClient(app)


def test_rollback_reopens_a_finished_game():
    game_id = _new_game()
    client.post(
        f"/api/games/{game_id}/join",
        json={"power": "GERMANY", "user_id": "guest2", "email": "guest2@test.com"},
    )
    _put_game_one_center_from_a_solo(game_id)
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())

    state = client.post(
        f"/api/admin/rollback?game_id={game_id}",
        headers=_auth_headers(),
        json={"user_id": "host", "email": "host@test.com"},
    ).json()

    assert state["winner"] is None
    assert client.get(f"/api/games/{game_id}").json()["status"] == "active"
    assert (
        client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers()).json()["winner"]
        == "FRANCE"
    )


def test_rollback_hands_every_player_their_orders_back():
    game_id = _seated_game()
    _germany_moves_to_silesia(game_id)
    _finalize(game_id, "FRANCE")
    _finalize(game_id, "GERMANY")
    assert GAMES[game_id].season == "Fall"

    state = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers()).json()

    assert state["season"] == "Spring"
    assert state["finalized_powers"] == []
    assert state["orders"]["GER_A_BER"]["target"] == "SIL"
    # The turn does not resolve again until the players say so.
    assert GAMES[game_id].season == "Spring"


def test_rollback_recomputes_what_a_snapshot_leaves_out():
    game_id = _seated_game()
    client.post(f"/api/adjudicate?game_id={game_id}", headers=_auth_headers())
    snapshot = GAME_HISTORY[game_id][-1]
    assert snapshot.last_resolution is None

    state = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_auth_headers()).json()

    assert state["last_resolution"] is not None


def test_api_test_seed_scenarios_and_security(monkeypatch):
    # 1. Production environment (no ENVIRONMENT or ENABLE_TEST_SEED_ENDPOINT) -> 403 Forbidden
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("ALLOW_INSECURE_DEV_AUTH", raising=False)
    monkeypatch.delenv("ENABLE_TEST_SEED_ENDPOINT", raising=False)
    res_prod = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res_prod.status_code == 403

    # 2. Enable via ENVIRONMENT=test
    monkeypatch.setenv("ENVIRONMENT", "test")

    # Test seeding standard 1901
    res = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["season"] == "Spring"
    assert data["phase"] == "Movement"
    assert data["year"] == 1901
    assert data["active_power"] == "FRANCE"

    # Test seeding spring retreats demo (defaults to GERMANY, legal DATC retreats include MUN, GAS, PIC)
    res_ret = client.post(
        "/api/test/seed",
        json={"scenario_id": "spring_retreats_demo", "game_id": "test_seed_game"},
    )
    assert res_ret.status_code == 200
    ret_data = res_ret.json()
    assert ret_data["season"] == "Spring"
    assert ret_data["phase"] == "Retreats"
    assert ret_data["active_power"] == "GERMANY"
    assert ret_data["retreats"] is not None
    assert set(ret_data["retreats"]["GERMANY"]["A BUR"]) == {"RUH", "BEL", "MUN", "PIC", "GAS"}
    assert any(u.get("is_dislodged") for u in ret_data["units"])

    # Verify active_power does not leak when re-seeding standard_1901 without active_power
    res_reseed = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": "test_seed_game"},
    )
    assert res_reseed.status_code == 200
    assert res_reseed.json()["active_power"] == "FRANCE"

    # Verify explicit active_power override is respected even on spring_retreats_demo
    res_override = client.post(
        "/api/test/seed",
        json={
            "scenario_id": "spring_retreats_demo",
            "game_id": "test_seed_game",
            "active_power": "FRANCE",
        },
    )
    assert res_override.status_code == 200
    assert res_override.json()["active_power"] == "FRANCE"

    # Test seeding winter adjustments demo
    res_adj = client.post(
        "/api/test/seed",
        json={"scenario_id": "winter_adjustments_demo", "game_id": "test_seed_game"},
    )
    assert res_adj.status_code == 200
    adj_data = res_adj.json()
    assert adj_data["season"] == "Winter"
    assert adj_data["phase"] == "Adjustments"
    assert adj_data["active_power"] == "FRANCE"
    assert adj_data["builds"] is not None
    assert adj_data["builds"]["FRANCE"]["count"] == 2

    # Test unknown scenario
    res_bad = client.post(
        "/api/test/seed",
        json={"scenario_id": "nonexistent_scenario", "game_id": "test_seed_game"},
    )
    assert res_bad.status_code == 400

    # Verify Russia (+1 bicoastal STP build) and Austria (-1 deficit disband) in winter_adjustments_demo
    assert adj_data["builds"]["RUSSIA"]["count"] == 1
    assert "STP" in adj_data["builds"]["RUSSIA"]["homes"]
    assert adj_data["builds"]["AUSTRIA"]["count"] == -1

    # Test refusing to overwrite a multiplayer match
    mp_gid = _seated_game()
    res_mp = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": mp_gid},
    )
    assert res_mp.status_code == 403

    # Test refusing to overwrite an unloaded multiplayer match loaded from persistence
    saved_state = GAMES[mp_gid]
    saved_summary = GAME_SUMMARIES[mp_gid]
    evict_game(mp_gid)
    monkeypatch.setattr("storage.supabase.is_persistence_enabled", lambda: True)

    async def _fake_load(gid: str):
        if gid == mp_gid:
            return (saved_state, saved_summary, [], None)
        return None

    monkeypatch.setattr("storage.supabase.load_game_from_db", _fake_load)
    res_unloaded_mp = client.post(
        "/api/test/seed",
        json={"scenario_id": "standard_1901", "game_id": mp_gid},
    )
    assert res_unloaded_mp.status_code == 403
