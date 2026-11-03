import pytest
from fastapi.testclient import TestClient

from main import app, GAMES, GAME_HISTORY, GAME_SUMMARIES, seed_initial_multiplayer_lobbies
from models import Power, UnitType


@pytest.fixture(autouse=True)
def reset_server_state():
    seed_initial_multiplayer_lobbies()


def test_admin_status_solo_and_multiplayer():
    client = TestClient(app)

    # 1. Solo sandbox game
    res = client.get("/api/admin/status?game_id=proto_1901")
    assert res.status_code == 200
    data = res.json()
    assert data["is_creator"] is True

    # 2. Multiplayer Match #104: Creator is bismarck@diplomacy.eu / bot_bismarck
    res_bismarck = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers={"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"},
    )
    assert res_bismarck.status_code == 200
    assert res_bismarck.json()["is_creator"] is True

    # Non-creator (Tsar Nicholas / bot_romanov)
    res_romanov = client.get(
        "/api/admin/status?game_id=mp_concert_104",
        headers={"X-User-Id": "bot_romanov", "X-User-Email": "tsar@diplomacy.eu"},
    )
    assert res_romanov.status_code == 200
    assert res_romanov.json()["is_creator"] is False


def test_admin_security_enforcement():
    client = TestClient(app)
    headers_intruder = {"X-User-Id": "random_intruder", "X-User-Email": "intruder@evil.org"}
    game_id = "mp_concert_104"

    # Non-creator calls should all fail with 403 Forbidden
    r1 = client.post(f"/api/admin/rollback?game_id={game_id}", headers=headers_intruder)
    assert r1.status_code == 403
    assert "Administrator access denied" in r1.json()["detail"]

    r2 = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "MUN"},
        headers=headers_intruder,
    )
    assert r2.status_code == 403

    r3 = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "GERMANY", "unit_type": "A", "province": "SIL"},
        headers=headers_intruder,
    )
    assert r3.status_code == 403

    r4 = client.post(
        f"/api/admin/unit/destroy?game_id={game_id}",
        json={"unit_id": "GER_A_BER"},
        headers=headers_intruder,
    )
    assert r4.status_code == 403

    r5 = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1902, "phase": "Movement"},
        headers=headers_intruder,
    )
    assert r5.status_code == 403

    r6 = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "GERMANY"},
        headers=headers_intruder,
    )
    assert r6.status_code == 403


def test_admin_rollback_turn():
    client = TestClient(app)
    creator_headers = {"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"}
    game_id = "mp_concert_104"

    # Initially at Spring 1901 Movement
    initial_res = client.get(f"/api/game?game_id={game_id}")
    assert initial_res.json()["state"]["season"] == "Spring"
    assert initial_res.json()["state"]["year"] == 1901

    # Attempt rollback before any turns have advanced -> 400
    rb_fail = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_fail.status_code == 400

    # Adjudicate turn to advance to Fall 1901
    adj_res = client.post(f"/api/adjudicate?game_id={game_id}")
    assert adj_res.status_code == 200
    assert adj_res.json()["season"] == "Fall"
    assert adj_res.json()["year"] == 1901

    # Status check indicates can_rollback is True
    st_res = client.get(f"/api/admin/status?game_id={game_id}", headers=creator_headers)
    assert st_res.json()["can_rollback"] is True
    assert st_res.json()["history_count"] == 1

    # Roll back as creator
    rb_res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=creator_headers)
    assert rb_res.status_code == 200
    restored = rb_res.json()
    assert restored["season"] == "Spring"
    assert restored["year"] == 1901
    assert any("[ADMIN OVERRIDE] Rolled back turn" in h for h in restored["turn_history"])


def test_admin_move_unit():
    client = TestClient(app)
    creator_headers = {"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"}
    game_id = "mp_concert_104"

    # Move GER_A_BER to SIL
    res = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "SIL"},
        headers=creator_headers,
    )
    assert res.status_code == 200
    updated_state = res.json()
    unit = next(u for u in updated_state["units"] if u["id"] == "GER_A_BER")
    assert unit["province"] == "SIL"
    assert updated_state["orders"]["GER_A_BER"]["origin"] == "SIL"

    # Invalid moves:
    # 1. Army to Sea
    bad_sea = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "BAL"},
        headers=creator_headers,
    )
    assert bad_sea.status_code == 400
    assert "sea province" in bad_sea.json()["detail"]

    # 2. Fleet to Inland
    bad_land = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_F_KIE", "new_province": "MUN"},
        headers=creator_headers,
    )
    assert bad_land.status_code == 400
    assert "inland province" in bad_land.json()["detail"]

    # 3. Unit to Impassable
    bad_swi = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_BER", "new_province": "SWI"},
        headers=creator_headers,
    )
    assert bad_swi.status_code == 400
    assert "impassable" in bad_swi.json()["detail"]


def test_admin_spawn_and_destroy_units():
    client = TestClient(app)
    creator_headers = {"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"}
    game_id = "mp_concert_104"

    # Spawn Austrian Army in TYR
    spawn_res = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "AUSTRIA", "unit_type": "A", "province": "TYR"},
        headers=creator_headers,
    )
    assert spawn_res.status_code == 200
    state = spawn_res.json()
    spawned = next((u for u in state["units"] if u["province"] == "TYR"), None)
    assert spawned is not None
    assert spawned["power"] == "AUSTRIA"
    assert spawned["unit_type"] == "A"

    # Destroy the newly spawned unit
    destroy_res = client.post(
        f"/api/admin/unit/destroy?game_id={game_id}",
        json={"unit_id": spawned["id"]},
        headers=creator_headers,
    )
    assert destroy_res.status_code == 200
    state_after = destroy_res.json()
    assert not any(u["id"] == spawned["id"] for u in state_after["units"])


def test_admin_set_turn_and_ownership():
    client = TestClient(app)
    creator_headers = {"X-User-Id": "bot_bismarck", "X-User-Email": "bismarck@diplomacy.eu"}
    game_id = "mp_concert_104"

    # Set clock
    turn_res = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1905, "phase": "Retreats"},
        headers=creator_headers,
    )
    assert turn_res.status_code == 200
    assert turn_res.json()["season"] == "Fall"
    assert turn_res.json()["year"] == 1905
    assert turn_res.json()["phase"] == "Retreats"

    # Set ownership of BEL to GERMANY
    own_res = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": "GERMANY"},
        headers=creator_headers,
    )
    assert own_res.status_code == 200
    assert own_res.json()["ownership"]["BEL"] == "GERMANY"

    # Clear ownership of BEL (reset to Neutral)
    clear_res = client.post(
        f"/api/admin/ownership?game_id={game_id}",
        json={"province": "BEL", "power": None},
        headers=creator_headers,
    )
    assert clear_res.status_code == 200
    assert "BEL" not in clear_res.json()["ownership"]
