"""Suggested moves in press: a set of orders attached to a private message. Alice (France)
suggests a joint plan to Bob (Germany). Carol (England) is the outsider, and nobody's real
orders may change or leak because of it."""

import pytest
from api.press import _recent_posts
from storage.store import GAMES
from tests.integration.security.helpers import (
    BOB_ID,
    alice_headers,
    bob_headers,
    client,
    make_jwt,
)
from tests.integration.security.test_press_secrecy import (
    CAROL_ID,
    carol_headers,
    feed,
    three_player_match,
)
from tests.ws_testing import receive_json


@pytest.fixture(autouse=True)
def no_rate_limit_carryover():
    _recent_posts.clear()


@pytest.fixture
def match() -> str:
    """Alice hosts as France, Bob is Germany and Carol is England."""
    return three_player_match()


TURN = "Spring 1901 Movement"


def order(unit_id, order_type="MOVE", target=None, **extra):
    """An order as a client would send it. The power and origin are deliberately wrong: the
    server must take them from the unit."""
    return {
        "unit_id": unit_id,
        "power": "TURKEY",
        "unit_type": "A",
        "origin": "XXX",
        "order_type": order_type,
        "target": target,
        **extra,
    }


JOINT_PLAN = [
    order("GER_A_MUN", target="BUR"),
    order("FRA_A_PAR", "SUPPORT", target="BUR", aux_unit_origin="MUN"),
]


def suggest(gid, headers, power, orders, recipients=("GERMANY",), body="", anonymous=False):
    return client.post(
        f"/api/press?game_id={gid}",
        json={
            "power": power,
            "body": body,
            "recipients": list(recipients),
            "anonymous": anonymous,
            "orders": orders,
        },
        headers=headers,
    )


def real_orders(gid):
    return {uid: o.model_dump(mode="json") for uid, o in GAMES[gid].orders.items()}


def test_a_suggestion_reaches_its_thread_with_orders_rebuilt_from_the_units(match):
    sent = suggest(match, alice_headers(), "FRANCE", JOINT_PLAN)
    assert sent.status_code == 200, sent.text
    (message,) = feed(match, bob_headers(), "GERMANY")["messages"]
    assert message["body"] == ""
    by_unit = {o["unit_id"]: o for o in message["orders"]}
    assert set(by_unit) == {"GER_A_MUN", "FRA_A_PAR"}
    assert by_unit["GER_A_MUN"]["power"] == "GERMANY"
    assert by_unit["GER_A_MUN"]["origin"] == "MUN"
    assert by_unit["GER_A_MUN"]["target"] == "BUR"
    assert by_unit["FRA_A_PAR"]["power"] == "FRANCE"
    assert by_unit["FRA_A_PAR"]["origin"] == "PAR"
    assert all(o["is_explicit"] for o in message["orders"])


def test_a_third_player_is_served_no_part_of_a_suggestion(match):
    assert suggest(match, alice_headers(), "FRANCE", JOINT_PLAN, body="Our plan").status_code == 200
    served = feed(match, carol_headers(), "ENGLAND")
    assert served["messages"] == []
    assert "GER_A_MUN" not in str(served)


def test_the_socket_delivers_a_suggestion_only_to_its_thread(match):
    def connect(power, user_id, email):
        ws = client.websocket_connect(f"/ws/games/{match}?handshake=1&power={power}")
        socket = ws.__enter__()
        socket.send_json({"type": "auth", "token": make_jwt(user_id, email)})
        receive_json(socket)  # The board.
        return ws, socket

    bob_ws, bob = connect("GERMANY", BOB_ID, "bob@test.com")
    carol_ws, carol = connect("ENGLAND", CAROL_ID, "carol@test.com")
    try:
        assert suggest(match, alice_headers(), "FRANCE", JOINT_PLAN).status_code == 200
        # A public message afterwards is the first thing Carol's socket may be sent.
        client.post(
            f"/api/press?game_id={match}",
            json={"power": "FRANCE", "body": "Hello all"},
            headers=alice_headers(),
        )
        pushed = receive_json(bob)
        assert pushed["type"] == "press"
        assert {o["unit_id"] for o in pushed["messages"][0]["orders"]} == {
            "GER_A_MUN",
            "FRA_A_PAR",
        }
        to_carol = receive_json(carol)
        assert to_carol["messages"][0]["body"] == "Hello all"
        assert to_carol["messages"][0]["orders"] == []
    finally:
        bob_ws.__exit__(None, None, None)
        carol_ws.__exit__(None, None, None)


def test_a_suggestion_changes_nobodys_real_orders(match):
    # Alice's real order is a secret she does not put in the suggestion.
    posted = client.post(
        f"/api/order?game_id={match}",
        json={"order": {**order("FRA_A_MAR", target="SPA"), "power": "FRANCE"}},
        headers=alice_headers(),
    )
    assert posted.status_code == 200, posted.text
    before = real_orders(match)
    revision = GAMES[match].state_revision

    assert suggest(match, alice_headers(), "FRANCE", JOINT_PLAN).status_code == 200

    assert real_orders(match) == before
    assert GAMES[match].state_revision == revision
    # The suggestion holds only what Alice attached: her real Marseilles order is not in it.
    (message,) = feed(match, bob_headers(), "GERMANY")["messages"]
    assert "FRA_A_MAR" not in str(message)
    assert "SPA" not in str(message)


def test_a_suggestion_only_covers_units_of_the_thread(match):
    outsider = [order("ENG_F_LON", target="NTH")]
    refused = suggest(match, alice_headers(), "FRANCE", outsider)
    assert refused.status_code == 422
    assert "ENGLAND" in refused.json()["detail"]
    assert (
        suggest(match, alice_headers(), "FRANCE", [order("NOPE", target="BUR")]).status_code == 422
    )
    # In a thread with England, the same order is allowed.
    assert (
        suggest(match, alice_headers(), "FRANCE", outsider, ["GERMANY", "ENGLAND"]).status_code
        == 200
    )


def test_suggestion_rules(match):
    plan = [order("GER_A_MUN", target="BUR")]
    # Not in the public box, and not in an anonymous message.
    assert suggest(match, alice_headers(), "FRANCE", plan, recipients=()).status_code == 422
    assert (
        suggest(
            match, alice_headers(), "FRANCE", plan, ["GERMANY", "ENGLAND"], anonymous=True
        ).status_code
        == 422
    )
    # One order for each unit.
    assert suggest(match, alice_headers(), "FRANCE", plan + plan).status_code == 422
    # Only the orders of a Movement phase, and only provinces that exist.
    assert (
        suggest(match, alice_headers(), "FRANCE", [order("GER_A_MUN", "DISBAND")]).status_code
        == 422
    )
    assert (
        suggest(match, alice_headers(), "FRANCE", [order("GER_A_MUN", target="ZZZ")]).status_code
        == 400
    )
    # A message with no text and no orders is still empty.
    assert suggest(match, alice_headers(), "FRANCE", []).status_code == 422
    assert feed(match, bob_headers(), "GERMANY")["messages"] == []


def test_an_anonymous_backchannel_may_suggest_only_the_recipients_units(match):
    ok = suggest(
        match,
        alice_headers(),
        "FRANCE",
        [order("GER_A_MUN", target="BUR")],
        ["GERMANY"],
        anonymous=True,
    )
    assert ok.status_code == 200, ok.text
    (seen,) = client.get(f"/api/press?game_id={match}&power=GERMANY", headers=bob_headers()).json()[
        "messages"
    ]
    assert seen["sender"] is None
    assert seen["recipients"] == ["GERMANY"]
    assert seen["orders"][0]["unit_id"] == "GER_A_MUN"

    # Including the sender's own unit would reveal who sent the backchannel.
    leaks_sender = suggest(
        match,
        alice_headers(),
        "FRANCE",
        [order("FRA_A_PAR", target="BUR"), order("GER_A_MUN", target="RUH")],
        ["GERMANY"],
        anonymous=True,
    )
    assert leaks_sender.status_code == 422
    assert "FRANCE" in leaks_sender.json()["detail"]


def test_moves_can_only_be_suggested_in_a_movement_phase(match):
    GAMES[match].phase = "Retreats"
    refused = suggest(match, alice_headers(), "FRANCE", [order("GER_A_MUN", target="BUR")])
    assert refused.status_code == 409


def test_taking_a_suggestion_is_an_ordinary_batch_of_ones_own_orders(match):
    assert suggest(match, alice_headers(), "FRANCE", JOINT_PLAN).status_code == 200
    (message,) = feed(match, bob_headers(), "GERMANY")["messages"]
    mine = [o for o in message["orders"] if o["power"] == "GERMANY"]

    taken = client.post(
        f"/api/orders/batch?game_id={match}",
        json={"power": "GERMANY", "orders": mine, "turn": TURN},
        headers=bob_headers(),
    )
    assert taken.status_code == 200, taken.text
    assert GAMES[match].orders["GER_A_MUN"].target == "BUR"
    # France's half stays a claim: Bob taking the plan orders nothing for France.
    assert GAMES[match].orders["FRA_A_PAR"].order_type.value == "HOLD"

    # Bob cannot use the batch to order the French half of the plan.
    whole = client.post(
        f"/api/orders/batch?game_id={match}",
        json={"power": "GERMANY", "orders": message["orders"], "turn": TURN},
        headers=bob_headers(),
    )
    assert whole.status_code == 403


def test_a_batch_for_a_turn_that_has_passed_is_refused(match):
    stale = client.post(
        f"/api/orders/batch?game_id={match}",
        json={
            "power": "GERMANY",
            "orders": [{**order("GER_A_MUN", target="BUR"), "power": "GERMANY"}],
            "turn": "Fall 1900 Movement",
        },
        headers=bob_headers(),
    )
    assert stale.status_code == 409
    assert GAMES[match].orders["GER_A_MUN"].order_type.value == "HOLD"


def test_game_over_reveals_suggestions_with_the_rest_of_the_press(match):
    assert suggest(match, alice_headers(), "FRANCE", JOINT_PLAN).status_code == 200
    GAMES[match].winner = GAMES[match].units[0].power
    (message,) = feed(match, carol_headers(), "ENGLAND")["messages"]
    assert len(message["orders"]) == 2
