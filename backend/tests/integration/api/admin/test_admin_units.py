"""Admin board overrides: moving, spawning and destroying units, setting ownership."""

import pytest
from domain.board import UnitType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import make_auth_headers


def test_admin_move_unit():
    client = TestClient(app)
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
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
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
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
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
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


@pytest.mark.parametrize("province", ["NTH", "SWI"])
def test_ownership_rejects_sea_and_impassable(province):
    client = TestClient(app)

    res = client.post(
        "/api/admin/ownership?game_id=proto_1901",
        json={"province": province, "power": "FRANCE"},
    )

    assert res.status_code == 400
    assert province not in GAMES["proto_1901"].ownership


def test_ownership_allows_non_supply_center_land_territories():
    client = TestClient(app)

    res = client.post(
        "/api/admin/ownership?game_id=proto_1901",
        json={"province": "BUR", "power": "GERMANY"},
    )

    assert res.status_code == 200
    assert res.json()["ownership"]["BUR"] == "GERMANY"

    clear_res = client.post(
        "/api/admin/ownership?game_id=proto_1901",
        json={"province": "BUR", "power": None},
    )
    assert clear_res.status_code == 200
    assert "BUR" not in clear_res.json()["ownership"]


client = TestClient(app)


def _armies_and_fleets_at(game_id, province):
    return [(u.unit_type, u.coast) for u in GAMES[game_id].units if u.province == province]


@pytest.mark.parametrize("province", ["SPA", "STP", "BUL"])
def test_army_placed_by_admin_on_a_split_coast_province_has_no_coast(province):
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    moved = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_A_MUN", "new_province": province},
        headers=headers,
    )
    assert moved.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]

    GAMES[game_id].units = [u for u in GAMES[game_id].units if u.province != province]
    spawned = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "FRANCE", "unit_type": "A", "province": province, "coast": "SC"},
        headers=headers,
    )
    assert spawned.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]


def test_fleet_placed_by_admin_keeps_its_coast():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    chosen = client.post(
        f"/api/admin/unit/spawn?game_id={game_id}",
        json={"power": "FRANCE", "unit_type": "F", "province": "SPA", "coast": "SC"},
        headers=headers,
    )
    assert chosen.status_code == 200
    assert _armies_and_fleets_at(game_id, "SPA") == [(UnitType.FLEET, "SC")]

    defaulted = client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "GER_F_KIE", "new_province": "BUL"},
        headers=headers,
    )
    assert defaulted.status_code == 200
    assert _armies_and_fleets_at(game_id, "BUL") == [(UnitType.FLEET, "EC")]


def test_army_placed_by_admin_is_a_real_unit_that_captures_its_province():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    client.post(
        f"/api/admin/unit/move?game_id={game_id}",
        json={"unit_id": "FRA_A_MAR", "new_province": "SPA"},
        headers=headers,
    )
    game = GAMES[game_id]
    game.season = "Fall"

    resolved = client.post(f"/api/adjudicate?game_id={game_id}", headers=headers).json()

    assert resolved["ownership"]["SPA"] == "FRANCE"
    assert [u["province"] for u in resolved["units"] if u["id"] == "FRA_A_MAR"] == ["SPA"]
