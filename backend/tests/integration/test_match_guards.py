"""
Regression tests for holes found by playing odd games against the API.

- A match that drops back to one player (or has not been joined yet) still hides that
  player's orders from everyone else.
- A saved sandbox belongs to the account that saved it: nobody else can view, change,
  resolve or delete it.
- `/api/adjudicate` refuses a request for a turn that has already resolved, so a
  double-click cannot resolve two phases.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import seed_initial_multiplayer_lobbies
from starlette.websockets import WebSocketDisconnect
from storage.store import GAMES

JWT_SECRET = "test-secret-at-least-32-chars-long-12345"
ALICE_ID = "00000000-0000-0000-0000-00000000a11c"
BOB_ID = "00000000-0000-0000-0000-000000000b0b"
CAROL_ID = "00000000-0000-0000-0000-0000000ca201"

client = TestClient(app)


def token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "aud": "authenticated", "exp": time.time() + 3600}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def alice() -> dict:
    return {"Authorization": f"Bearer {token(ALICE_ID, 'alice@test.com')}"}


def bob() -> dict:
    return {"Authorization": f"Bearer {token(BOB_ID, 'bob@test.com')}"}


def carol() -> dict:
    return {"Authorization": f"Bearer {token(CAROL_ID, 'carol@test.com')}"}


@pytest.fixture(autouse=True)
def reset_server():
    seed_initial_multiplayer_lobbies()


def move(unit_id: str, origin: str, target: str) -> dict:
    unit_type = unit_id.split("_")[1]
    return {
        "order": {
            "unit_id": unit_id,
            "power": "FRANCE",  # The server takes the power from the unit.
            "unit_type": unit_type,
            "origin": origin,
            "order_type": "MOVE",
            "target": target,
            "is_explicit": True,
        }
    }


def create_match() -> str:
    res = client.post(
        "/api/games",
        json={"name": "Guards", "creator_power": "FRANCE", "user_id": ALICE_ID},
        headers=alice(),
    )
    assert res.status_code == 200
    return res.json()["game_id"]


def join(gid: str, power: str, headers: dict, user_id: str) -> None:
    res = client.post(
        f"/api/games/{gid}/join", json={"power": power, "user_id": user_id}, headers=headers
    )
    assert res.status_code == 200


def visible_order(gid: str, unit_id: str, headers: dict | None = None) -> str:
    res = client.get(f"/api/game?game_id={gid}", headers=headers or {})
    assert res.status_code == 200
    return res.json()["state"]["orders"][unit_id]["order_type"]


# ==============================================================================
# A lone player's orders stay hidden
# ==============================================================================


def test_orders_stay_hidden_when_a_match_drops_to_one_player():
    gid = create_match()
    join(gid, "GERMANY", bob(), BOB_ID)
    assert (
        client.post(
            f"/api/order?game_id={gid}", json=move("GER_A_MUN", "MUN", "BUR"), headers=bob()
        ).status_code
        == 200
    )

    left = client.post(f"/api/games/{gid}/leave", json={"user_id": ALICE_ID}, headers=alice())
    assert left.status_code == 200
    assert left.json()["summary"]["status"] == "waiting"

    assert visible_order(gid, "GER_A_MUN", carol()) == "HOLD"
    assert visible_order(gid, "GER_A_MUN") == "HOLD"
    assert visible_order(gid, "GER_A_MUN", bob()) == "MOVE"


def test_host_orders_stay_hidden_before_anyone_joins():
    gid = create_match()
    assert (
        client.post(
            f"/api/order?game_id={gid}", json=move("FRA_A_PAR", "PAR", "BUR"), headers=alice()
        ).status_code
        == 200
    )

    assert visible_order(gid, "FRA_A_PAR", carol()) == "HOLD"
    assert visible_order(gid, "FRA_A_PAR") == "HOLD"
    assert visible_order(gid, "FRA_A_PAR", alice()) == "MOVE"


# ==============================================================================
# Saved sandboxes belong to their owner
# ==============================================================================


def saved_sandbox() -> str:
    res = client.post(
        "/api/games/save-sandbox",
        json={"name": "Alice's study", "user_id": ALICE_ID, "email": "alice@test.com"},
        headers=alice(),
    )
    assert res.status_code == 200
    gid = res.json()["game_id"]
    assert (
        client.post(
            f"/api/order?game_id={gid}", json=move("FRA_A_PAR", "PAR", "BUR"), headers=alice()
        ).status_code
        == 200
    )
    return gid


STRANGER_CALLS = [
    ("get", "/api/game?game_id={gid}", None),
    ("post", "/api/order?game_id={gid}", move("FRA_A_PAR", "PAR", "PIC")),
    ("post", "/api/finalize?game_id={gid}", {"power": "FRANCE", "force": True}),
    ("post", "/api/simulate?game_id={gid}", None),
    ("post", "/api/adjudicate?game_id={gid}", None),
    ("post", "/api/power?game_id={gid}", {"power": "ENGLAND"}),
    ("post", "/api/sandbox/enter?game_id={gid}", {"power": "FRANCE"}),
    ("post", "/api/sandbox/ai-step?game_id={gid}", {}),
    ("post", "/api/scenario?game_id={gid}", {"scenario_id": "standard_1901"}),
    (
        "post",
        "/api/admin/unit/spawn?game_id={gid}",
        {"power": "FRANCE", "unit_type": "A", "province": "PIC"},
    ),
    ("post", "/api/games/{gid}/join", {"power": "ENGLAND", "user_id": CAROL_ID}),
    ("post", "/api/games/save-sandbox?game_id={gid}", {"name": "Copy", "user_id": CAROL_ID}),
    ("get", "/api/history?game_id={gid}", None),
    ("delete", "/api/games/{gid}", None),
]


@pytest.mark.parametrize("method,path,body", STRANGER_CALLS)
def test_a_stranger_cannot_touch_someone_elses_saved_sandbox(method, path, body):
    gid = saved_sandbox()
    url = path.format(gid=gid)
    kwargs = {"json": body} if body is not None else {}

    assert client.request(method, url, headers=carol(), **kwargs).status_code == 403
    assert client.request(method, url, **kwargs).status_code in (401, 403)

    assert gid in GAMES
    game = GAMES[gid]
    assert game.season == "Spring"
    assert game.orders["FRA_A_PAR"].target == "BUR"
    assert all(u.province != "PIC" for u in game.units)


def test_saved_sandboxes_socket_refuses_a_stranger():
    gid = saved_sandbox()
    with pytest.raises(WebSocketDisconnect) as refused:
        with client.websocket_connect(f"/ws/games/{gid}?handshake=1") as ws:
            ws.send_json({"type": "auth", "token": token(CAROL_ID, "carol@test.com")})
            ws.receive_json()
    assert refused.value.code == 4403

    with client.websocket_connect(f"/ws/games/{gid}?handshake=1") as ws:
        ws.send_json({"type": "auth", "token": token(ALICE_ID, "alice@test.com")})
        assert ws.receive_json()["state"]["orders"]["FRA_A_PAR"]["target"] == "BUR"


def test_the_owner_still_uses_and_deletes_their_saved_sandbox():
    gid = saved_sandbox()
    assert client.get(f"/api/game?game_id={gid}", headers=alice()).status_code == 200
    assert client.post(f"/api/adjudicate?game_id={gid}", headers=alice()).status_code == 200
    assert client.delete(f"/api/games/{gid}", headers=alice()).status_code == 200
    assert gid not in GAMES


# ==============================================================================
# One resolve per turn
# ==============================================================================


def test_adjudicate_refuses_a_turn_that_already_resolved():
    gid = create_match()
    join(gid, "GERMANY", bob(), BOB_ID)
    spring = "Spring 1901 Movement"

    first = client.post(f"/api/adjudicate?game_id={gid}&turn={spring}", headers=alice())
    assert first.status_code == 200
    assert first.json()["season"] == "Fall"

    second = client.post(f"/api/adjudicate?game_id={gid}&turn={spring}", headers=alice())
    assert second.status_code == 409
    assert GAMES[gid].season == "Fall"
    assert GAMES[gid].year == 1901
