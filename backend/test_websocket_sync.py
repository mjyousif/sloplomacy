import pytest
from starlette.testclient import TestClient

from main import app, GAMES, build_scenario
from models import Order, OrderType, Power, UnitType


def test_ws_game_connect_and_ping():
    client = TestClient(app)
    with client.websocket_connect("/ws/games/proto_1901") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "game_update"
        assert init_msg["game_id"] == "proto_1901"
        assert "state" in init_msg
        assert init_msg["state"]["season"] == "Spring"
        assert init_msg["state"]["year"] == 1901

        # Test ping/pong
        ws.send_json({"type": "ping"})
        pong_msg = ws.receive_json()
        assert pong_msg["type"] == "pong"

        # Test refresh
        ws.send_json({"type": "refresh"})
        refresh_msg = ws.receive_json()
        assert refresh_msg["type"] == "game_update"
        assert refresh_msg["game_id"] == "proto_1901"


def test_ws_game_not_found_closes():
    client = TestClient(app)
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/games/non_existent_game_xyz"):
            pass


def test_ws_live_order_sync_broadcast():
    client = TestClient(app)
    # Reset proto_1901 to clean state
    GAMES["proto_1901"] = build_scenario("standard_1901", Power.FRANCE, "proto_1901")

    with client.websocket_connect("/ws/games/proto_1901") as ws1:
        _ = ws1.receive_json()  # Initial state

        with client.websocket_connect("/ws/games/proto_1901") as ws2:
            _ = ws2.receive_json()  # Initial state

            # Submit an order via REST endpoint
            order_payload = {
                "order": {
                    "unit_id": "FRA_A_PAR",
                    "power": "FRANCE",
                    "unit_type": "A",
                    "origin": "PAR",
                    "order_type": "MOVE",
                    "target": "BUR",
                    "is_explicit": True,
                }
            }
            res = client.post("/api/order?game_id=proto_1901", json=order_payload)
            assert res.status_code == 200

            # Both websockets should receive the real-time update
            msg1 = ws1.receive_json()
            assert msg1["type"] == "game_update"
            assert msg1["state"]["orders"]["FRA_A_PAR"]["target"] == "BUR"

            msg2 = ws2.receive_json()
            assert msg2["type"] == "game_update"
            assert msg2["state"]["orders"]["FRA_A_PAR"]["target"] == "BUR"


def test_ws_finalize_and_adjudicate_broadcast():
    client = TestClient(app)
    GAMES["proto_1901"] = build_scenario("standard_1901", Power.FRANCE, "proto_1901")

    with client.websocket_connect("/ws/games/proto_1901") as ws:
        _ = ws.receive_json()  # Initial state

        # Finalize France
        fin_res = client.post("/api/finalize?game_id=proto_1901", json={"power": "FRANCE", "force": True})
        assert fin_res.status_code == 200

        fin_msg = ws.receive_json()
        assert fin_msg["type"] == "game_update"
        assert "FRANCE" in fin_msg["state"]["finalized_powers"]

        # Adjudicate turn
        adj_res = client.post("/api/adjudicate?game_id=proto_1901")
        assert adj_res.status_code == 200

        adj_msg = ws.receive_json()
        assert adj_msg["type"] == "game_update"
        assert adj_msg["state"]["season"] == "Fall"
        assert adj_msg["state"]["phase"] == "Movement"


def test_ws_lobby_live_sync():
    client = TestClient(app)

    with client.websocket_connect("/ws/lobby") as ws:
        init_lobby = ws.receive_json()
        assert init_lobby["type"] == "lobby_update"
        assert isinstance(init_lobby["games"], list)

        # Create a new game
        create_res = client.post(
            "/api/games",
            json={
                "name": "WebSocket Test Match",
                "creator_power": "AUSTRIA",
                "user_id": "ws_tester",
                "email": "tester@example.com",
            },
        )
        assert create_res.status_code == 200
        new_game = create_res.json()

        # Lobby websocket receives updated game list
        lobby_update = ws.receive_json()
        assert lobby_update["type"] == "lobby_update"
        game_ids = [g["game_id"] for g in lobby_update["games"]]
        assert new_game["game_id"] in game_ids


def test_ws_unfinalize_and_scenario_reset_broadcast():
    client = TestClient(app)
    GAMES["proto_1901"] = build_scenario("standard_1901", Power.FRANCE, "proto_1901")

    with client.websocket_connect("/ws/games/proto_1901") as ws:
        _ = ws.receive_json()  # Initial state

        client.post("/api/finalize?game_id=proto_1901", json={"power": "FRANCE", "force": True})
        assert "FRANCE" in ws.receive_json()["state"]["finalized_powers"]

        client.post("/api/unfinalize?game_id=proto_1901", json={"power": "FRANCE"})
        assert ws.receive_json()["state"]["finalized_powers"] == []

        client.post("/api/adjudicate?game_id=proto_1901")
        assert ws.receive_json()["state"]["season"] == "Fall"

        client.post("/api/scenario?game_id=proto_1901", json={"scenario_id": "standard_1901"})
        assert ws.receive_json()["state"]["season"] == "Spring"


def test_ws_lobby_hears_about_resolved_turns():
    client = TestClient(app)
    created = client.post(
        "/api/games",
        json={"name": "Lobby Turn", "creator_power": "FRANCE", "user_id": "host", "email": "host@test.com"},
    )
    game_id = created.json()["game_id"]

    with client.websocket_connect("/ws/lobby") as ws:
        _ = ws.receive_json()  # Initial lobby

        import jwt
        token = jwt.encode({"sub": "host", "email": "host@test.com"}, "test-jwt-secret-at-least-32-chars-long-12345", algorithm="HS256")
        client.post(f"/api/adjudicate?game_id={game_id}", headers={"Authorization": f"Bearer {token}"})

        update = ws.receive_json()
        assert update["type"] == "lobby_update"
        assert next(g for g in update["games"] if g["game_id"] == game_id)["season"] == "Fall"
