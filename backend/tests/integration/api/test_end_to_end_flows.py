"""Broad flows through the API: a blunder scenario to finalize, and a lobby from create to saved sandbox."""

import pytest
from scenarios.presets import seed_initial_multiplayer_lobbies


@pytest.fixture(autouse=True)
def seeded_lobbies():
    # The lobby flow expects the seeded lobbies. It used to get them from whichever tests ran
    # before it, so on its own it failed.
    seed_initial_multiplayer_lobbies()


def test_fastapi_endpoints_and_finalize_sanity_check():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # Load tactical blunders demo scenario
    r = client.post(
        "/api/scenario", json={"scenario_id": "tactical_blunders_demo", "active_power": "FRANCE"}
    )
    assert r.status_code == 200
    state = r.json()
    assert state["active_power"] == "FRANCE"
    assert any(i["code"] == "SELF_BOUNCE" for i in state["issues"])

    # Attempt to finalize France without force -> should require confirmation ("Are You Sure?")
    fin_res = client.post("/api/finalize", json={"power": "FRANCE", "force": False})
    assert fin_res.status_code == 200
    fin_data = fin_res.json()
    assert fin_data["finalized"] is False
    assert fin_data["requires_confirmation"] is True
    assert len(fin_data["issues"]) >= 1

    # Force finalize ("Yes, I'm Sure")
    fin_force = client.post("/api/finalize", json={"power": "FRANCE", "force": True})
    assert fin_force.status_code == 200
    assert fin_force.json()["finalized"] is True
    assert "FRANCE" in fin_force.json()["state"]["finalized_powers"]

    # Simulate pre-moves
    sim_res = client.post("/api/simulate")
    assert sim_res.status_code == 200
    assert sim_res.json()["resolutions"]["FRA_A_PAR"]["bounced"] is True

    # Reset back to standard 1901
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "RUSSIA"})

    # Test Sandbox Enter/Exit isolation: Russia enters sandbox, plots German & Austrian moves, then exits
    client.post("/api/sandbox/enter", json={"power": "RUSSIA"})
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "RUS_A_MOS",
                "power": "RUSSIA",
                "unit_type": "A",
                "origin": "MOS",
                "order_type": "MOVE",
                "target": "UKR",
                "is_explicit": True,
            }
        },
    )
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "MOVE",
                "target": "PRU",
                "is_explicit": True,
            }
        },
    )
    exit_res = client.post("/api/sandbox/exit", json={"power": "RUSSIA"})
    assert exit_res.status_code == 200
    after_exit = exit_res.json()
    # Russia's own move persists, while Germany's hypothetical move is wiped back to default HOLD
    assert after_exit["orders"]["RUS_A_MOS"]["order_type"] == "MOVE"
    assert after_exit["orders"]["RUS_A_MOS"]["target"] == "UKR"
    assert after_exit["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert after_exit["orders"]["GER_A_BER"]["is_explicit"] is False

    # Reset back to standard 1901 as France
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})


def test_multiplayer_lobby_create_join_and_save_sandbox():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. List seeded multiplayer lobbies
    list_res = client.get("/api/games")
    assert list_res.status_code == 200
    games = list_res.json()
    assert len(games) >= 2

    # 2. Create a new multiplayer match as ENGLAND
    create_res = client.post(
        "/api/games",
        json={
            "name": "Autumn Clashes 1901",
            "creator_power": "ENGLAND",
            "user_id": "user_churchill",
            "email": "winston@uk.gov",
            "display_name": "Churchill",
        },
    )
    assert create_res.status_code == 200
    created_game = create_res.json()
    gid = created_game["game_id"]
    assert created_game["name"] == "Autumn Clashes 1901"
    assert "ENGLAND" in created_game["participants"]
    assert created_game["participants"]["ENGLAND"]["user_id"] == "user_churchill"

    # 3. Another user attempts to claim ENGLAND -> should fail with 409 Conflict
    conflict_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ENGLAND",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert conflict_res.status_code == 409

    # 4. Second user claims FRANCE -> succeeds and transitions match status to active
    join_res = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "FRANCE",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert join_res.status_code == 200
    joined_payload = join_res.json()
    assert joined_payload["summary"]["status"] == "active"
    assert "FRANCE" in joined_payload["summary"]["participants"]
    assert joined_payload["state"]["active_power"] == "FRANCE"

    # 5. Issue order in that specific multiplayer game
    order_res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
    )
    assert order_res.status_code == 200
    assert order_res.json()["orders"]["FRA_A_PAR"]["target"] == "BUR"

    # 6. Save sandbox game to account
    save_res = client.post(
        "/api/games/save-sandbox",
        json={
            "name": "My French Opening Study",
            "user_id": "user_clemenceau",
            "email": "georges@fr.gov",
            "display_name": "Clemenceau",
        },
    )
    assert save_res.status_code == 200
    saved_summary = save_res.json()
    assert saved_summary["is_sandbox"] is True
    assert saved_summary["name"] == "My French Opening Study"
