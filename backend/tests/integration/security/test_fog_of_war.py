"""Fog of war: another seat's orders never reach you through the game, previews, sandboxes, the socket or history."""

import pytest
from domain.orders import OrderType
from fastapi.testclient import TestClient
from main import app
from storage.store import GAMES
from tests.integration.security.helpers import (
    ALICE_ID,
    BOB_ID,
    alice_headers,
    assert_plan_hidden,
    auth_headers,
    bob_headers,
    make_jwt,
    secret_plan_match,
    socket_state,
)

client = TestClient(app)


def test_fog_of_war_masks_opponent_orders():
    alice_id = "00000000-0000-0000-0000-000000000001"
    bob_id = "00000000-0000-0000-0000-000000000002"

    res_create = client.post(
        "/api/games",
        json={
            "name": "FoW Match",
            "creator_power": "FRANCE",
            "user_id": alice_id,
            "email": "alice@test.com",
        },
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    gid = res_create.json()["game_id"]

    client.post(
        f"/api/games/{gid}/join",
        json={"power": "GERMANY", "user_id": bob_id, "email": "bob@test.com"},
        headers=auth_headers(bob_id, "bob@test.com"),
    )

    # Alice plots a secret move to Burgundy
    res_order = client.post(
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
        headers=auth_headers(alice_id, "alice@test.com"),
    )
    assert res_order.status_code == 200

    # Bob views the game state (as GERMANY)
    bob_view = client.get(
        f"/api/game?game_id={gid}&power=GERMANY",
        headers=auth_headers(bob_id, "bob@test.com"),
    ).json()["state"]

    # Bob must see Alice's unit as HOLDing (masked)
    assert bob_view["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"
    assert bob_view["orders"]["FRA_A_PAR"]["target"] is None

    # Alice views the game state (as FRANCE)
    alice_view = client.get(
        f"/api/game?game_id={gid}&power=FRANCE",
        headers=auth_headers(alice_id, "alice@test.com"),
    ).json()["state"]

    # Alice sees her own true move
    assert alice_view["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert alice_view["orders"]["FRA_A_PAR"]["target"] == "BUR"


def test_naming_a_power_in_get_game_does_not_show_its_orders():
    gid = secret_plan_match()
    for headers in (bob_headers(), {}):
        res = client.get(f"/api/game?game_id={gid}&power=FRANCE", headers=headers)
        assert res.status_code == 200
        assert_plan_hidden(res.json()["state"])

    own = client.get(f"/api/game?game_id={gid}", headers=alice_headers()).json()["state"]
    assert own["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"
    assert own["last_resolution"]["resolutions"]["FRA_A_PAR"]["order_type"] == "MOVE"


def test_turn_preview_is_built_only_from_what_the_viewer_may_see():
    gid = secret_plan_match()
    state = client.get(f"/api/game?game_id={gid}", headers=bob_headers()).json()["state"]
    assert state["last_resolution"]["resolutions"]["FRA_A_PAR"]["order_type"] == "HOLD"

    for headers in (bob_headers(), {}):
        res = client.post(f"/api/simulate?game_id={gid}", headers=headers)
        assert res.status_code == 200
        assert res.json()["resolutions"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_set_power_does_not_return_hidden_orders():
    gid = secret_plan_match()
    res = client.post(f"/api/power?game_id={gid}", json={"power": "FRANCE"})
    assert res.status_code == 200
    assert_plan_hidden(res.json())


def test_saving_a_live_match_copies_only_what_the_caller_sees():
    gid = secret_plan_match()
    res = client.post(
        f"/api/games/save-sandbox?game_id={gid}",
        json={"name": "Peek", "user_id": BOB_ID, "email": "bob@test.com"},
        headers=bob_headers(),
    )
    assert res.status_code == 200
    copy_id = res.json()["game_id"]
    assert GAMES[copy_id].orders["FRA_A_PAR"].order_type == OrderType.HOLD


def test_private_sandbox_opens_only_for_your_own_seat():
    gid = secret_plan_match()
    for headers in (bob_headers(), {}):
        res = client.post(
            f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}, headers=headers
        )
        assert res.status_code == 403

    own = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "GERMANY"}, headers=bob_headers()
    )
    assert own.status_code == 200
    assert own.json()["orders"]["FRA_A_PAR"]["order_type"] == "HOLD"


def test_only_the_seat_holder_carries_sandbox_orders_into_the_match():
    gid = secret_plan_match()
    sandbox_id = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "GERMANY"}, headers=bob_headers()
    ).json()["game_id"]
    GAMES[sandbox_id].orders["GER_A_BER"] = (
        GAMES[sandbox_id]
        .orders["GER_A_BER"]
        .model_copy(update={"order_type": OrderType.MOVE, "target": "SIL", "is_explicit": True})
    )

    res = client.post(f"/api/sandbox/exit?game_id={sandbox_id}", json={"power": "GERMANY"})
    assert res.status_code == 200
    assert sandbox_id not in GAMES
    assert GAMES[gid].orders["GER_A_BER"].order_type == OrderType.HOLD


def test_socket_shows_hidden_orders_only_to_their_seat():
    gid = secret_plan_match()
    assert_plan_hidden(socket_state(f"/ws/games/{gid}?power=FRANCE"))
    assert_plan_hidden(
        socket_state(f"/ws/games/{gid}?power=FRANCE&handshake=1", make_jwt(BOB_ID, "bob@test.com"))
    )
    assert_plan_hidden(socket_state(f"/ws/games/{gid}?power=FRANCE&handshake=1", "not-a-token"))

    own = socket_state(f"/ws/games/{gid}?handshake=1", make_jwt(ALICE_ID, "alice@test.com"))
    assert own["orders"]["FRA_A_PAR"]["order_type"] == "MOVE"


def test_private_match_socket_admits_seated_players_without_the_passcode():
    from starlette.websockets import WebSocketDisconnect

    gid = secret_plan_match(private=True)
    own = socket_state(f"/ws/games/{gid}?handshake=1", make_jwt(BOB_ID, "bob@test.com"))
    assert own["orders"]["GER_A_BER"]["order_type"] == "HOLD"

    with pytest.raises(WebSocketDisconnect) as refused:
        socket_state(f"/ws/games/{gid}?handshake=1", None)
    assert refused.value.code == 4403

    assert_plan_hidden(socket_state(f"/ws/games/{gid}?passcode=Secret1901"))


def test_turn_history_never_shows_the_current_turns_orders():
    gid = secret_plan_match()
    # Nothing has resolved, so Alice's plan is in no history entry.
    assert client.get(f"/api/history?game_id={gid}", headers=bob_headers()).json() == []

    assert client.post(f"/api/adjudicate?game_id={gid}", headers=alice_headers()).status_code == 200
    # Alice plans her fall move; Bob must not see it.
    res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "FRA_A_PAR",
                "power": "FRANCE",
                "unit_type": "A",
                "origin": "BUR",
                "order_type": "MOVE",
                "target": "MUN",
                "is_explicit": True,
            }
        },
        headers=alice_headers(),
    )
    assert res.status_code == 200, res.text

    for headers in (bob_headers(), {}):
        entries = client.get(f"/api/history?game_id={gid}", headers=headers).json()
        assert [(e["season"], e["phase"]) for e in entries] == [("Spring", "Movement")]
        # The resolved spring move is public now.
        past = client.get(f"/api/history/0?game_id={gid}", headers=headers).json()
        assert past["orders"]["FRA_A_PAR"]["target"] == "BUR"
        assert past["resolution"]["resolutions"]["FRA_A_PAR"]["succeeded"] is True
        assert client.get(f"/api/history/1?game_id={gid}", headers=headers).status_code == 404
        french_targets = {o["target"] for o in past["orders"].values() if o["power"] == "FRANCE"}
        assert "MUN" not in french_targets


def test_turn_history_of_a_private_sandbox_is_never_served():
    gid = secret_plan_match()
    sandbox_id = client.post(
        f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"}, headers=alice_headers()
    ).json()["game_id"]
    # Alice steps her private copy forward, so its history holds her live plan.
    client.post(f"/api/adjudicate?game_id={sandbox_id}", headers=alice_headers())

    for headers in (bob_headers(), alice_headers(), {}):
        assert client.get(f"/api/history?game_id={sandbox_id}", headers=headers).status_code == 404
        assert (
            client.get(f"/api/history/0?game_id={sandbox_id}", headers=headers).status_code == 404
        )


def test_turn_history_of_a_private_match_needs_the_passcode():
    gid = secret_plan_match(private=True)
    client.post(f"/api/adjudicate?game_id={gid}", headers=alice_headers())

    for path in (f"/api/history?game_id={gid}", f"/api/history/0?game_id={gid}"):
        assert client.get(path).status_code == 403
        assert client.get(f"{path}&passcode=wrong").status_code == 403
        assert client.get(f"{path}&passcode=Secret1901").status_code == 200
        # Seated players need no passcode, as with GET /api/game.
        assert client.get(path, headers=alice_headers()).status_code == 200


def test_supporting_foreign_unit_never_leaks_and_allows_finalization():
    gid = secret_plan_match()
    # Alice (France) has secretly ordered FRA_A_PAR -> BUR.
    # Bob (Germany) orders Munich to support France's Paris army to Burgundy,
    # and assigns Berlin and Kiel to HOLD so there are no unassigned unit warnings:
    client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "GER_A_BER",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "BER",
                "order_type": "HOLD",
                "is_explicit": True,
            }
        },
        headers=bob_headers(),
    )
    client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "GER_F_KIE",
                "power": "GERMANY",
                "unit_type": "F",
                "origin": "KIE",
                "order_type": "HOLD",
                "is_explicit": True,
            }
        },
        headers=bob_headers(),
    )
    res = client.post(
        f"/api/order?game_id={gid}",
        json={
            "order": {
                "unit_id": "GER_A_MUN",
                "power": "GERMANY",
                "unit_type": "A",
                "origin": "MUN",
                "order_type": "SUPPORT",
                "aux_unit_origin": "PAR",
                "target": "BUR",
                "is_explicit": True,
            }
        },
        headers=bob_headers(),
    )
    assert res.status_code == 200
    bob_state = res.json()

    # Bob's issues must NOT leak whether Paris matched or what Paris is doing
    for issue in bob_state["issues"]:
        assert issue["severity"] == "info"
        assert "currently" not in issue["message"]

    # Bob can finalize his orders directly without being blocked by confirmation
    fin_res = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "GERMANY", "force": False},
        headers=bob_headers(),
    )
    assert fin_res.status_code == 200
    assert fin_res.json()["finalized"] is True
    assert fin_res.json()["requires_confirmation"] is False
