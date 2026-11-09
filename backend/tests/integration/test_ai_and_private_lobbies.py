from domain.models import OrderType
from engine.ai import generate_tactical_orders
from engine.topology import get_initial_1901_units, get_initial_ownership
from fastapi.testclient import TestClient
from main import app


def test_ai_engine_generates_valid_non_conflicting_orders():
    units = get_initial_1901_units()
    ownership = get_initial_ownership()
    orders = generate_tactical_orders(units, ownership, "Spring", 1901, "Movement")

    assert len(orders) == len(units)
    # Check that no two units of the same power target the same province (no friendly self-bounce)
    by_power: dict = {}
    for o in orders.values():
        by_power.setdefault(o.power, []).append(o)

    for pwr, p_orders in by_power.items():
        move_targets = [o.target for o in p_orders if o.order_type == OrderType.MOVE and o.target]
        assert len(move_targets) == len(set(move_targets)), (
            f"Friendly self-bounce detected for {pwr}"
        )


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


def test_private_lobby_passcode_flow():
    client = TestClient(app)

    # 1. Create a private game with passcode
    create_res = client.post(
        "/api/games",
        json={
            "name": "Secret Cabal 1901",
            "creator_power": "AUSTRIA",
            "user_id": "user_host",
            "email": "host@vienna.at",
            "display_name": "Emperor Franz",
            "is_private": True,
            "passcode": "SecretPass123",
        },
    )
    assert create_res.status_code == 200
    game_summary = create_res.json()
    gid = game_summary["game_id"]
    assert game_summary["is_private"] is True
    assert game_summary["has_passcode"] is True
    assert "passcode" not in game_summary  # Passcode must never be exposed publicly

    # 2. Fetch specific game by ID via GET /api/games/{gid}
    get_res = client.get(f"/api/games/{gid}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Secret Cabal 1901"
    assert get_res.json()["has_passcode"] is True

    # 3. Join without passcode -> 403 Forbidden
    join_fail = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_intruder",
            "email": "intruder@rome.it",
            "display_name": "Intruder",
        },
    )
    assert join_fail.status_code == 403
    assert "passcode" in join_fail.json()["detail"].lower()

    # 4. Join with wrong passcode -> 403 Forbidden
    join_wrong = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_intruder",
            "email": "intruder@rome.it",
            "display_name": "Intruder",
            "passcode": "WrongPasscode",
        },
    )
    assert join_wrong.status_code == 403

    # 5. Join with correct passcode -> 200 OK
    join_ok = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_friend",
            "email": "friend@rome.it",
            "display_name": "Allied Victor",
            "passcode": "SecretPass123",
        },
    )
    assert join_ok.status_code == 200
    assert "ITALY" in join_ok.json()["summary"]["participants"]

    # 6. Re-entry by existing participant does not require passcode again
    rejoin_ok = client.post(
        f"/api/games/{gid}/join",
        json={
            "power": "ITALY",
            "user_id": "user_friend",
            "email": "friend@rome.it",
            "display_name": "Allied Victor",
        },
    )
    assert rejoin_ok.status_code == 200


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
