"""Solo and saved sandboxes: foreign pre-moves, the AI endpoints, and leaving a solo sandbox."""

from domain.board import Power
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.api.helpers import _remove_unit, _set_turn

client = TestClient(app)


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


def _solo_game_at(season, phase):
    """A saved sandbox: one player, so ai-step is allowed and its active power matters."""
    game_id = client.post(
        "/api/games/save-sandbox",
        json={"name": "Study", "user_id": "host", "email": "host@test.com"},
    ).json()["game_id"]
    _set_turn(game_id, season, phase)
    return game_id


def test_ai_step_plans_builds_for_a_player_who_chose_nothing():
    game_id = _solo_game_at("Winter", "Adjustments")
    GAMES[game_id].active_power = Power.FRANCE
    _remove_unit(game_id, "FRA_A_PAR")
    client.get(f"/api/game?game_id={game_id}")

    state = client.post(f"/api/sandbox/ai-step?game_id={game_id}").json()

    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 3


def test_ai_step_keeps_a_build_decision_the_player_made():
    game_id = _solo_game_at("Winter", "Adjustments")
    GAMES[game_id].active_power = Power.FRANCE
    _remove_unit(game_id, "FRA_A_PAR")
    client.get(f"/api/game?game_id={game_id}")
    waive = {
        "unit_id": "BUILD_FRANCE_PAR",
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "WAIVE",
        "is_explicit": True,
    }
    client.post(f"/api/order?game_id={game_id}", json={"order": waive})

    state = client.post(f"/api/sandbox/ai-step?game_id={game_id}").json()

    assert sum(u["power"] == "FRANCE" for u in state["units"]) == 2


def test_ai_sandbox_api_endpoints():
    client = TestClient(app)
    # 1. Test POST /api/sandbox/ai-orders
    res = client.post("/api/sandbox/ai-orders?game_id=proto_1901")
    assert res.status_code == 200
    data = res.json()
    assert "orders" in data
    # Ensure foreign powers received explicit AI tactical orders
    england_orders = [o for o in data["orders"].values() if o["power"] == "ENGLAND"]
    assert len(england_orders) == 3
    assert all(o["is_explicit"] is True for o in england_orders)

    # 2. Test POST /api/sandbox/ai-step advances turn
    prev_phase = data["phase"]
    prev_season = data["season"]
    step_res = client.post("/api/sandbox/ai-step?game_id=proto_1901")
    assert step_res.status_code == 200
    step_data = step_res.json()
    # It should have stepped from Spring 1901 Movement to Fall 1901 Movement (or Retreats if dislodgement)
    assert step_data["phase"] != prev_phase or step_data["season"] != prev_season


def test_leaving_a_solo_sandbox_drops_the_turns_it_played():
    from storage.store import GAME_HISTORY

    client = TestClient(app)
    gid = "proto_1901"
    assert (
        client.post(
            f"/api/scenario?game_id={gid}", json={"scenario_id": "standard_1901"}
        ).status_code
        == 200
    )
    assert client.post(f"/api/adjudicate?game_id={gid}").status_code == 200
    assert len(GAME_HISTORY[gid]) == 1

    assert (
        client.post(f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}).status_code
        == 200
    )
    assert client.post(f"/api/sandbox/ai-step?game_id={gid}").status_code == 200
    assert len(GAME_HISTORY[gid]) == 2

    assert (
        client.post(f"/api/sandbox/exit?game_id={gid}", json={"power": "FRANCE"}).status_code == 200
    )

    entries = client.get(f"/api/history?game_id={gid}").json()
    assert [(e["season"], e["year"], e["phase"]) for e in entries] == [("Spring", 1901, "Movement")]
