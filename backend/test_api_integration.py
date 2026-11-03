from fastapi.testclient import TestClient
from main import app
from models import OrderType, Power

client = TestClient(app)


def test_api_404_error_handling():
    """Verify that invalid game IDs or unknown unit IDs return 404 status codes."""
    # Unknown game lookup
    res_get = client.get("/api/game?game_id=ghost_game_9999")
    assert res_get.status_code == 404
    assert "not found" in res_get.json()["detail"].lower()

    # Unknown game join
    res_join = client.post(
        "/api/games/ghost_game_9999/join",
        json={
            "power": "FRANCE",
            "user_id": "usr_test",
            "email": "test@test.com",
            "display_name": "Tester",
        },
    )
    assert res_join.status_code == 404

    # Unknown unit order in valid default game
    res_order = client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "NON_EXISTENT_UNIT",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "PAR",
                "order_type": "MOVE",
                "target": "BUR",
                "is_explicit": True,
            }
        },
    )
    assert res_order.status_code == 404


def test_api_order_updates_finalize_and_unfinalize():
    """Test order updating, finalizing with warnings, and unfinalizing."""
    # Reset default scenario
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # Update FRA_A_PAR
    order_res = client.post(
        "/api/order",
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
    st = order_res.json()
    assert st["orders"]["FRA_A_PAR"]["target"] == "BUR"

    # Confirm all orders for France
    conf_res = client.post("/api/orders/confirm-all", json={"power": "FRANCE"})
    assert conf_res.status_code == 200
    assert conf_res.json()["orders"]["FRA_A_PAR"]["is_explicit"] is True

    # Finalize France
    fin_res = client.post("/api/finalize", json={"power": "FRANCE", "force": False})
    assert fin_res.status_code == 200
    assert "FRANCE" in fin_res.json()["state"]["finalized_powers"]

    # Unfinalize France
    unfin_res = client.post("/api/unfinalize", json={"power": "FRANCE"})
    assert unfin_res.status_code == 200
    assert "FRANCE" not in unfin_res.json()["finalized_powers"]


def test_api_adjudicate_and_advance_turn():
    """Adjudicating a turn advances the phase and logs to turn history."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # Adjudicate Spring 1901 Movement -> Fall 1901 Movement
    adj_res = client.post("/api/adjudicate")
    assert adj_res.status_code == 200
    new_state = adj_res.json()
    assert new_state["season"] == "Fall"
    assert new_state["year"] == 1901
    assert new_state["phase"] == "Movement"
    assert len(new_state["turn_history"]) >= 1
    assert "Spring 1901 Movement" in new_state["turn_history"][0]
    assert new_state["finalized_powers"] == []


def test_api_clear_foreign_pre_moves():
    """Clear foreign pre-moves wipes other powers' hypothetical orders while preserving active power orders."""
    client.post("/api/scenario", json={"scenario_id": "standard_1901", "active_power": "FRANCE"})

    # France move
    client.post(
        "/api/order",
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

    # Germany move
    client.post(
        "/api/order",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "MOVE",
                "target": "KIE",
                "is_explicit": True,
            }
        },
    )

    # Clear foreign orders for France
    clr_res = client.post("/api/sandbox/clear-foreign", json={"power": "FRANCE"})
    assert clr_res.status_code == 200
    st = clr_res.json()
    assert st["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert st["orders"]["FRA_A_PAR"]["target"] == "BUR"
    assert st["orders"]["GER_A_BER"]["order_type"] == "HOLD"
    assert st["orders"]["GER_A_BER"]["is_explicit"] is False
