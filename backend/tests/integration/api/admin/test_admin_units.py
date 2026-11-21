"""Admin board overrides through the Direct-Edit commit: placement rules, coasts, ownership and the clock."""

import pytest
from domain.board import UnitType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import direct_edit, make_auth_headers

client = TestClient(app)


def test_board_edit_moves_a_unit():
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    res = direct_edit(game_id, creator_headers, moves={"GER_A_BER": "SIL"})
    assert res.status_code == 200
    updated_state = res.json()
    unit = next(u for u in updated_state["units"] if u["id"] == "GER_A_BER")
    assert unit["province"] == "SIL"
    assert updated_state["orders"]["GER_A_BER"]["origin"] == "SIL"


def test_board_edit_rejects_units_the_board_cannot_hold():
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # 1. Army to Sea
    bad_sea = direct_edit(game_id, creator_headers, moves={"GER_A_BER": "BAL"})
    assert bad_sea.status_code == 400
    assert "sea province" in bad_sea.json()["detail"]

    # 2. Fleet to Inland
    bad_land = direct_edit(game_id, creator_headers, moves={"GER_F_KIE": "MUN"})
    assert bad_land.status_code == 400
    assert "inland province" in bad_land.json()["detail"]

    # 3. Unit to Impassable
    bad_swi = direct_edit(game_id, creator_headers, moves={"GER_A_BER": "SWI"})
    assert bad_swi.status_code == 400
    assert "impassable" in bad_swi.json()["detail"]


def test_board_edit_places_and_removes_a_unit():
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Place an Austrian Army in TYR
    spawn_res = direct_edit(game_id, creator_headers, place=[("AUSTRIA", "A", "TYR")])
    assert spawn_res.status_code == 200
    spawned = next((u for u in spawn_res.json()["units"] if u["province"] == "TYR"), None)
    assert spawned is not None
    assert spawned["power"] == "AUSTRIA"
    assert spawned["unit_type"] == "A"

    # Remove the newly placed unit
    removed = direct_edit(game_id, creator_headers, remove=[spawned["id"]])
    assert removed.status_code == 200
    assert not any(u["id"] == spawned["id"] for u in removed.json()["units"])


def test_admin_set_turn():
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    turn_res = client.post(
        f"/api/admin/set-turn?game_id={game_id}",
        json={"season": "Fall", "year": 1905, "phase": "Retreats"},
        headers=creator_headers,
    )
    assert turn_res.status_code == 200
    assert turn_res.json()["season"] == "Fall"
    assert turn_res.json()["year"] == 1905
    assert turn_res.json()["phase"] == "Retreats"


def test_board_edit_sets_and_clears_ownership():
    creator_headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    game_id = "mp_concert_104"

    # Set ownership of BEL to GERMANY
    own_res = direct_edit(game_id, creator_headers, owners={"BEL": "GERMANY"})
    assert own_res.status_code == 200
    assert own_res.json()["ownership"]["BEL"] == "GERMANY"

    # Clear ownership of BEL (reset to Neutral)
    clear_res = direct_edit(game_id, creator_headers, owners={"BEL": None})
    assert clear_res.status_code == 200
    assert "BEL" not in clear_res.json()["ownership"]


@pytest.mark.parametrize("province", ["NTH", "SWI"])
def test_ownership_rejects_sea_and_impassable(province):
    res = direct_edit("proto_1901", owners={province: "FRANCE"})

    assert res.status_code == 400
    assert province not in GAMES["proto_1901"].ownership


def test_ownership_allows_non_supply_center_land_territories():
    res = direct_edit("proto_1901", owners={"BUR": "GERMANY"})

    assert res.status_code == 200
    assert res.json()["ownership"]["BUR"] == "GERMANY"

    clear_res = direct_edit("proto_1901", owners={"BUR": None})
    assert clear_res.status_code == 200
    assert "BUR" not in clear_res.json()["ownership"]


def _armies_and_fleets_at(game_id, province):
    return [(u.unit_type, u.coast) for u in GAMES[game_id].units if u.province == province]


@pytest.mark.parametrize("province", ["SPA", "STP", "BUL"])
def test_army_placed_on_a_split_coast_province_has_no_coast(province):
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    moved = direct_edit(game_id, headers, moves={"GER_A_MUN": province})
    assert moved.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]

    placed = direct_edit(game_id, headers, place=[("FRANCE", "A", province, "SC")])
    assert placed.status_code == 200
    assert _armies_and_fleets_at(game_id, province) == [(UnitType.ARMY, None)]


def test_fleet_placed_by_admin_keeps_its_coast():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")

    chosen = direct_edit(game_id, headers, place=[("FRANCE", "F", "SPA", "SC")])
    assert chosen.status_code == 200
    assert _armies_and_fleets_at(game_id, "SPA") == [(UnitType.FLEET, "SC")]

    defaulted = direct_edit(game_id, headers, moves={"GER_F_KIE": "BUL"})
    assert defaulted.status_code == 200
    assert _armies_and_fleets_at(game_id, "BUL") == [(UnitType.FLEET, "EC")]


def test_army_moved_by_admin_is_a_real_unit_that_captures_its_province():
    game_id = "mp_concert_104"
    headers = make_auth_headers("bot_bismarck", "bismarck@diplomacy.eu")
    direct_edit(game_id, headers, moves={"FRA_A_MAR": "SPA"})
    game = GAMES[game_id]
    game.season = "Fall"

    resolved = client.post(f"/api/adjudicate?game_id={game_id}", headers=headers).json()

    assert resolved["ownership"]["SPA"] == "FRANCE"
    assert [u["province"] for u in resolved["units"] if u["id"] == "FRA_A_MAR"] == ["SPA"]
