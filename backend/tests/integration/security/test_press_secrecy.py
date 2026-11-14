"""Press between three players: who can read a message, who can send as whom, and whether an
anonymous author stays hidden. Carol (England) is the outsider trying to read France and
Germany's private press."""

import pytest
from api.press import RATE_LIMIT_MESSAGES, _recent_posts
from domain.board import Power
from storage.store import GAME_PRESS, GAMES
from tests.integration.security.helpers import (
    ALICE_ID,
    BOB_ID,
    alice_headers,
    auth_headers,
    bob_headers,
    client,
    make_jwt,
)
from tests.ws_testing import receive_json

CAROL_ID = "00000000-0000-0000-0000-0000000ca401"
MALLORY_ID = "00000000-0000-0000-0000-00000000dead"


def carol_headers() -> dict:
    return auth_headers(CAROL_ID, "carol@test.com")


def mallory_headers() -> dict:
    return auth_headers(MALLORY_ID, "mallory@test.com")


@pytest.fixture(autouse=True)
def no_rate_limit_carryover():
    _recent_posts.clear()


@pytest.fixture
def match() -> str:
    """Alice hosts as France, Bob is Germany and Carol is England."""
    gid = client.post(
        "/api/games",
        json={
            "name": "Press",
            "creator_power": "FRANCE",
            "user_id": ALICE_ID,
            "email": "alice@test.com",
        },
        headers=alice_headers(),
    ).json()["game_id"]
    for power, user_id, email, headers in (
        ("GERMANY", BOB_ID, "bob@test.com", bob_headers()),
        ("ENGLAND", CAROL_ID, "carol@test.com", carol_headers()),
    ):
        joined = client.post(
            f"/api/games/{gid}/join",
            json={"power": power, "user_id": user_id, "email": email},
            headers=headers,
        )
        assert joined.status_code == 200, joined.text
    return gid


def send(gid, headers, power, body="hello", recipients=(), anonymous=False):
    return client.post(
        f"/api/press?game_id={gid}",
        json={
            "power": power,
            "body": body,
            "recipients": list(recipients),
            "anonymous": anonymous,
        },
        headers=headers,
    )


def feed(gid, headers, power, after=0):
    res = client.get(f"/api/press?game_id={gid}&power={power}&after={after}", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def bodies(gid, headers, power):
    return [m["body"] for m in feed(gid, headers, power)["messages"]]


def test_public_press_reaches_every_seated_player(match):
    sent = send(match, alice_headers(), "FRANCE", "Peace in our time")
    assert sent.status_code == 200, sent.text
    assert sent.json()["sender"] == "FRANCE"
    for headers, power in ((bob_headers(), "GERMANY"), (carol_headers(), "ENGLAND")):
        assert bodies(match, headers, power) == ["Peace in our time"]


def test_a_private_message_is_not_served_to_a_third_player(match):
    assert send(match, alice_headers(), "FRANCE", "Split Belgium?", ["GERMANY"]).status_code == 200
    assert bodies(match, bob_headers(), "GERMANY") == ["Split Belgium?"]
    assert bodies(match, carol_headers(), "ENGLAND") == []
    assert "Split Belgium?" not in str(feed(match, carol_headers(), "ENGLAND"))


def test_naming_another_power_does_not_open_its_press(match):
    send(match, alice_headers(), "FRANCE", "Split Belgium?", ["GERMANY"])
    res = client.get(f"/api/press?game_id={match}&power=GERMANY", headers=carol_headers())
    assert res.status_code == 403


def test_a_spectator_reads_and_sends_nothing(match):
    send(match, alice_headers(), "FRANCE", "Public word")
    for headers in (mallory_headers(), {}):
        assert client.get(f"/api/press?game_id={match}", headers=headers).status_code == 403
        assert (
            client.get(f"/api/press?game_id={match}&power=FRANCE", headers=headers).status_code
            == 403
        )
        assert send(match, headers, "FRANCE", "I am France").status_code == 403


def test_a_player_cannot_send_as_another_power(match):
    assert send(match, carol_headers(), "FRANCE", "England is lying").status_code == 403
    assert bodies(match, bob_headers(), "GERMANY") == []


def test_an_anonymous_author_is_hidden_from_other_players_and_the_host(match):
    sent = send(match, bob_headers(), "GERMANY", "Someone will stab France", anonymous=True)
    assert sent.status_code == 200
    assert sent.json()["sender"] == "GERMANY"
    for headers, power in ((alice_headers(), "FRANCE"), (carol_headers(), "ENGLAND")):
        payload = feed(match, headers, power)
        (seen,) = payload["messages"]
        assert seen["anonymous"] is True
        assert seen["sender"] is None
        assert "GERMANY" not in str(payload["messages"])
    (own,) = feed(match, bob_headers(), "GERMANY")["messages"]
    assert own["sender"] == "GERMANY"


def test_an_anonymous_note_reaches_only_its_recipients_unsigned(match):
    sent = send(match, bob_headers(), "GERMANY", "Watch the Channel", ["FRANCE"], anonymous=True)
    assert sent.status_code == 200
    (note,) = feed(match, alice_headers(), "FRANCE")["messages"]
    assert note["sender"] is None
    assert note["recipients"] == ["FRANCE"]
    assert bodies(match, carol_headers(), "ENGLAND") == []


def test_the_socket_delivers_press_only_to_players_who_may_read_it(match):
    def connect(user_id, email, power):
        ws = client.websocket_connect(f"/ws/games/{match}?handshake=1&power={power}")
        socket = ws.__enter__()
        socket.send_json({"type": "auth", "token": make_jwt(user_id, email)})
        assert receive_json(socket)["type"] == "game_update"
        return ws, socket

    bob_ctx, bob = connect(BOB_ID, "bob@test.com", "GERMANY")
    carol_ctx, carol = connect(CAROL_ID, "carol@test.com", "ENGLAND")
    spectator_ctx = client.websocket_connect(f"/ws/games/{match}")
    spectator = spectator_ctx.__enter__()
    assert receive_json(spectator)["type"] == "game_update"
    try:
        send(match, alice_headers(), "FRANCE", "For Germany only", ["GERMANY"], anonymous=True)
        send(match, alice_headers(), "FRANCE", "For everyone")

        private = receive_json(bob)
        assert private["type"] == "press"
        assert private["power"] == "GERMANY"
        assert private["messages"][0]["body"] == "For Germany only"
        assert private["messages"][0]["sender"] is None
        assert "FRANCE" not in str(private["messages"][0]["sender"])

        # The first press Carol is sent is the public one: the private one never came.
        first = receive_json(carol)
        assert first["type"] == "press"
        assert [m["body"] for m in first["messages"]] == ["For everyone"]

        # A socket without a seat is sent no press at all.
        spectator.send_json({"type": "ping"})
        assert receive_json(spectator)["type"] == "pong"
    finally:
        for ctx in (bob_ctx, carol_ctx, spectator_ctx):
            ctx.__exit__(None, None, None)


def test_game_over_reveals_all_press_and_closes_private_press(match):
    send(match, alice_headers(), "FRANCE", "Split Belgium?", ["GERMANY"])
    send(match, bob_headers(), "GERMANY", "Trust nobody", anonymous=True)
    GAMES[match].winner = Power.FRANCE

    payload = feed(match, carol_headers(), "ENGLAND")
    assert payload["revealed"] is True
    assert [(m["body"], m["sender"]) for m in payload["messages"]] == [
        ("Split Belgium?", "FRANCE"),
        ("Trust nobody", "GERMANY"),
    ]
    assert send(match, carol_headers(), "ENGLAND", "psst", ["FRANCE"]).status_code == 409
    assert send(match, carol_headers(), "ENGLAND", "psst", anonymous=True).status_code == 409
    assert send(match, carol_headers(), "ENGLAND", "Good game").status_code == 200


def test_after_returns_only_newer_messages(match):
    first = send(match, alice_headers(), "FRANCE", "one").json()
    send(match, alice_headers(), "FRANCE", "two")
    newer = feed(match, bob_headers(), "GERMANY", after=first["seq"])["messages"]
    assert [m["body"] for m in newer] == ["two"]


def test_messages_are_stamped_with_the_turn_they_were_sent_in(match):
    sent = send(match, alice_headers(), "FRANCE", "Opening").json()
    game = GAMES[match]
    assert (sent["season"], sent["year"], sent["phase"]) == (game.season, game.year, game.phase)


def test_message_rules(match):
    assert send(match, alice_headers(), "FRANCE", "   ").status_code == 422
    assert send(match, alice_headers(), "FRANCE", "x" * 1001).status_code == 422
    assert send(match, alice_headers(), "FRANCE", "to me", ["FRANCE"]).status_code == 422
    assert send(match, alice_headers(), "FRANCE", "hi", ["ATLANTIS"]).status_code == 422
    # The sender is dropped from a group, and recipients are stored once each, in order.
    group = send(match, alice_headers(), "FRANCE", "hi", ["ITALY", "FRANCE", "GERMANY", "ITALY"])
    assert group.json()["recipients"] == ["GERMANY", "ITALY"]


def test_a_surrendered_power_can_no_longer_send(match):
    surrendered = client.post(
        f"/api/games/{match}/surrender",
        json={"power": "ENGLAND", "user_id": CAROL_ID, "leave_seat": False},
        headers=carol_headers(),
    )
    assert surrendered.status_code == 200, surrendered.text
    assert send(match, carol_headers(), "ENGLAND", "Still here").status_code == 403


def test_a_flood_of_messages_is_slowed_down(match):
    for i in range(RATE_LIMIT_MESSAGES):
        assert send(match, alice_headers(), "FRANCE", f"spam {i}").status_code == 200
    assert send(match, alice_headers(), "FRANCE", "one too many").status_code == 429
    assert len(GAME_PRESS[match]) == RATE_LIMIT_MESSAGES
    # Another seat is not held back by France's flood.
    assert send(match, bob_headers(), "GERMANY", "calm").status_code == 200


def test_sandboxes_have_no_press(match):
    solo = client.post("/api/games/solo-sandbox").json()
    solo_id = solo.get("game_id") or solo["state"]["game_id"]
    assert client.get(f"/api/press?game_id={solo_id}&power=FRANCE").status_code == 409

    entered = client.post(
        f"/api/sandbox/enter?game_id={match}", json={"power": "FRANCE"}, headers=alice_headers()
    )
    assert entered.status_code == 200, entered.text
    sandbox_id = entered.json()["game_id"]
    assert sandbox_id.startswith("sbx_")
    res = client.get(f"/api/press?game_id={sandbox_id}&power=FRANCE", headers=alice_headers())
    assert res.status_code == 404
