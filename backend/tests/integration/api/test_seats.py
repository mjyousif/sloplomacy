"""Seats: joining, re-entering, leaving and surrendering."""

import pytest
from domain.board import Power
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import seed_initial_multiplayer_lobbies
from storage.store import GAMES
from tests.integration.api.helpers import (
    _new_game,
)

client = TestClient(app)


def test_joining_does_not_change_the_power_other_players_see():
    game_id = _new_game("ENGLAND")

    joined = client.post(
        f"/api/games/{game_id}/join",
        json={"power": "RUSSIA", "user_id": "friend", "email": "friend@test.com"},
    )

    assert joined.status_code == 200
    assert joined.json()["state"]["active_power"] == "RUSSIA"
    assert GAMES[game_id].active_power == Power.ENGLAND
    assert client.get(f"/api/game?game_id={game_id}").json()["state"]["active_power"] == "ENGLAND"


def test_reentering_a_saved_sandbox_still_switches_its_power():
    game_id = _new_game("ENGLAND")
    saved = client.post(
        f"/api/games/save-sandbox?game_id={game_id}",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]

    client.post(
        f"/api/games/{saved}/join",
        json={"power": "TURKEY", "user_id": "host", "email": "host@test.com"},
    )

    assert GAMES[saved].active_power == Power.TURKEY


@pytest.fixture(autouse=True)
def reset_server():
    seed_initial_multiplayer_lobbies()


def test_leave_waiting_lobby_vacates_power():
    client = TestClient(app)

    # Mediterranean Crisis 1901 is waiting with ITALY claimed
    gid = "mp_med_crisis"
    res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "FRANCE",
            "user_id": "user_napoleon",
            "email": "napoleon@fr.gov",
            "display_name": "Napoleon",
        },
    )
    assert res.status_code == 200
    assert "FRANCE" in res.json()["summary"]["participants"]

    # Napoleon leaves the match
    leave_res = client.post(
        f"/api/games/{gid}/leave",
        json={"user_id": "user_napoleon", "email": "napoleon@fr.gov", "power": "FRANCE"},
    )
    assert leave_res.status_code == 200
    assert "FRANCE" not in leave_res.json()["summary"]["participants"]

    # Another player can now claim FRANCE without conflict
    join2_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "FRANCE",
            "user_id": "user_talleyrand",
            "email": "talleyrand@fr.gov",
            "display_name": "Talleyrand",
        },
    )
    assert join2_res.status_code == 200
    assert join2_res.json()["summary"]["participants"]["FRANCE"]["user_id"] == "user_talleyrand"


def test_leave_active_match_resets_orders_to_civil_disorder():
    client = TestClient(app)
    gid = "mp_concert_104"  # Active match: GERMANY and RUSSIA

    # First user (Tsar Nicholas / bot_romanov) sets a MOVE order for RUSSIA
    order_res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "RUS_A_WAR",
                "power": "RUSSIA",
                "unit_type": "A",
                "origin": "WAR",
                "order_type": "MOVE",
                "target": "GAL",
                "is_explicit": True,
            }
        },
    )
    assert order_res.status_code == 200
    assert order_res.json()["orders"]["RUS_A_WAR"]["target"] == "GAL"

    # Finalize Russia orders
    fin_res = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "RUSSIA", "force": True},
    )
    assert fin_res.status_code == 200
    assert "RUSSIA" in fin_res.json()["state"]["finalized_powers"]

    # Russian envoy leaves the campaign
    leave_res = client.post(
        f"/api/games/{gid}/leave",
        json={"user_id": "bot_romanov", "email": "tsar@diplomacy.eu", "power": "RUSSIA"},
    )
    assert leave_res.status_code == 200
    updated_state = leave_res.json()["state"]
    updated_summary = leave_res.json()["summary"]

    # Seat vacated
    assert "RUSSIA" not in updated_summary["participants"]
    # Orders unfinalized
    assert "RUSSIA" not in updated_state["finalized_powers"]
    # Units reset to civil disorder (HOLD)
    assert updated_state["orders"]["RUS_A_WAR"]["order_type"] == "HOLD"
    assert updated_state["orders"]["RUS_A_WAR"]["target"] is None


def test_surrender_power_with_and_without_leaving():
    client = TestClient(app)
    gid = "mp_concert_104"

    # Bismarck surrenders without leaving (spectating)
    surr1 = client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "GERMANY", "user_id": "bot_bismarck", "leave": False},
    )
    assert surr1.status_code == 200
    data1 = surr1.json()
    assert "GERMANY" in data1["state"]["surrendered_powers"]
    assert "GERMANY" in data1["summary"]["participants"]
    assert data1["summary"]["participants"]["GERMANY"]["surrendered"] is True

    # Bismarck now surrenders and leaves
    surr2 = client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "GERMANY", "user_id": "bot_bismarck", "leave": True},
    )
    assert surr2.status_code == 200
    data2 = surr2.json()
    assert "GERMANY" not in data2["summary"]["participants"]


def test_non_participant_cannot_surrender():
    client = TestClient(app)
    gid = "mp_concert_104"

    res = client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "GERMANY", "user_id": "random_intruder", "leave": True},
    )
    assert res.status_code == 403


def test_claim_surrendered_power_clears_surrender_status():
    client = TestClient(app)
    gid = "mp_concert_104"

    # Surrender and vacate Germany
    client.post(
        f"/api/games/{gid}/surrender",
        json={"power": "GERMANY", "user_id": "bot_bismarck", "leave": True},
    )

    # New player claims Germany
    claim_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "GERMANY",
            "user_id": "user_kaiser",
            "email": "kaiser@berlin.de",
            "display_name": "Wilhelm",
        },
    )
    assert claim_res.status_code == 200
    data = claim_res.json()
    assert "GERMANY" not in data["state"]["surrendered_powers"]
    assert data["summary"]["participants"]["GERMANY"]["display_name"] == "Wilhelm"


def test_leave_saved_sandbox_deletes_it():
    client = TestClient(app)

    # Save a sandbox first
    save_res = client.post(
        "/api/games/save-sandbox",
        json={
            "name": "Disposable Study",
            "user_id": "user_student",
            "email": "student@uni.eu",
            "display_name": "Student",
        },
    )
    assert save_res.status_code == 200
    saved_gid = save_res.json()["game_id"]

    # Leave/delete it
    del_res = client.post(
        f"/api/games/{saved_gid}/leave",
        json={"user_id": "user_student", "email": "student@uni.eu"},
    )
    assert del_res.status_code == 200

    # Ensure it no longer exists
    get_res = client.get(f"/api/game?game_id={saved_gid}")
    assert get_res.status_code == 404
