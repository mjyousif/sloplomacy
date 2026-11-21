"""Watching a match without a seat: what a spectator sees, and how a private match's passcode
is guarded against guessing on every route that takes it."""

import pytest
from security.passcode import MAX_WRONG_PASSCODES
from starlette.websockets import WebSocketDisconnect
from storage.store import GAMES

from .helpers import (
    alice_headers,
    assert_plan_hidden,
    client,
    secret_plan_match,
    socket_state,
)

NOPE = {"X-Passcode": "nope"}
RIGHT = {"X-Passcode": "Secret1901"}


def _from(address: str) -> dict:
    return {"X-Forwarded-For": address}


def test_a_signed_out_spectator_watches_a_public_match_without_seeing_plans():
    gid = secret_plan_match()

    res = client.get(f"/api/game?game_id={gid}")
    assert res.status_code == 200
    assert_plan_hidden(res.json()["state"])
    assert res.json()["state"]["issues"] == []

    assert_plan_hidden(socket_state(f"/ws/games/{gid}?handshake=1"))
    assert client.get(f"/api/history?game_id={gid}").status_code == 200

    # The plan is still there for the player who made it.
    assert GAMES[gid].orders["FRA_A_PAR"].order_type.value == "MOVE"


def test_a_spectator_of_a_private_match_needs_its_passcode():
    gid = secret_plan_match(private=True)
    assert client.get(f"/api/game?game_id={gid}").status_code == 403
    res = client.get(f"/api/game?game_id={gid}", headers={"X-Passcode": "Secret1901"})
    assert res.status_code == 200
    assert_plan_hidden(res.json()["state"])


def test_wrong_passcodes_lock_out_view_history_join_and_socket():
    gid = secret_plan_match(private=True)
    for _ in range(MAX_WRONG_PASSCODES):
        assert client.get(f"/api/game?game_id={gid}", headers=NOPE).status_code == 403

    assert client.get(f"/api/game?game_id={gid}", headers=RIGHT).status_code == 429
    assert client.get(f"/api/history?game_id={gid}", headers=RIGHT).status_code == 429
    joined = client.post(
        f"/api/games/{gid}/join",
        json={"power": "ITALY", "user_id": "guest_x", "passcode": "Secret1901"},
    )
    assert joined.status_code == 429
    with pytest.raises(WebSocketDisconnect) as refused:
        socket_state(f"/ws/games/{gid}?handshake=1", None, "Secret1901")
    assert refused.value.code == 4429


def test_the_lockout_is_per_client_and_spares_seated_players():
    gid = secret_plan_match(private=True)
    for _ in range(MAX_WRONG_PASSCODES):
        client.get(f"/api/game?game_id={gid}", headers={**NOPE, **_from("198.51.100.1")})

    assert (
        client.get(
            f"/api/game?game_id={gid}", headers={**RIGHT, **_from("198.51.100.1")}
        ).status_code
        == 429
    )
    assert (
        client.get(
            f"/api/game?game_id={gid}", headers={**RIGHT, **_from("198.51.100.2")}
        ).status_code
        == 200
    )
    # A seated player never needs the passcode, so a guesser cannot lock them out.
    seated = {**alice_headers(), **_from("198.51.100.1")}
    assert client.get(f"/api/game?game_id={gid}", headers=seated).status_code == 200


def test_a_forged_forwarded_address_does_not_escape_the_lockout():
    gid = secret_plan_match(private=True)
    for i in range(MAX_WRONG_PASSCODES):
        client.get(
            f"/api/game?game_id={gid}",
            headers={**NOPE, **_from(f"10.9.9.{i}, 198.51.100.7")},
        )
    res = client.get(
        f"/api/game?game_id={gid}",
        headers={**RIGHT, **_from("10.9.9.200, 198.51.100.7")},
    )
    assert res.status_code == 429


def test_loading_a_private_match_without_the_passcode_uses_no_try():
    gid = secret_plan_match(private=True)
    for _ in range(MAX_WRONG_PASSCODES * 2):
        assert client.get(f"/api/game?game_id={gid}").status_code == 403
    assert client.get(f"/api/game?game_id={gid}", headers=RIGHT).status_code == 200


def test_a_refused_viewer_cannot_tick_the_clock(monkeypatch):
    import api.turns

    gid = secret_plan_match(private=True)
    ticked: list[str] = []

    async def record(game):
        ticked.append(game.game_id)

    monkeypatch.setattr(api.turns, "tick_timer", record)
    assert client.get(f"/api/game?game_id={gid}").status_code == 403
    assert ticked == []
    assert client.get(f"/api/game?game_id={gid}", headers=RIGHT).status_code == 200
    assert ticked == [gid]


def test_a_passcode_in_the_url_is_never_read():
    """URLs reach request logs, so a passcode there is as good as none, and counts no try."""
    gid = secret_plan_match(private=True)
    for _ in range(MAX_WRONG_PASSCODES * 2):
        assert client.get(f"/api/game?game_id={gid}&passcode=Secret1901").status_code == 403
        assert client.get(f"/api/game?game_id={gid}&passcode=nope").status_code == 403
    assert client.get(f"/api/game?game_id={gid}", headers=RIGHT).status_code == 200

    for path in (f"/api/history?game_id={gid}", f"/api/press?game_id={gid}"):
        assert client.get(f"{path}&passcode=Secret1901").status_code == 403

    with pytest.raises(WebSocketDisconnect) as refused:
        socket_state(f"/ws/games/{gid}?handshake=1&passcode=Secret1901")
    assert refused.value.code == 4403
    with pytest.raises(WebSocketDisconnect) as no_handshake:
        socket_state(f"/ws/games/{gid}?passcode=Secret1901")
    assert no_handshake.value.code == 4403


def test_the_socket_takes_the_passcode_in_its_auth_message_and_counts_wrong_ones():
    gid = secret_plan_match(private=True)
    assert_plan_hidden(socket_state(f"/ws/games/{gid}?handshake=1", None, "Secret1901"))

    for _ in range(MAX_WRONG_PASSCODES):
        with pytest.raises(WebSocketDisconnect) as wrong:
            socket_state(f"/ws/games/{gid}?handshake=1", None, "nope")
        assert wrong.value.code == 4403

    with pytest.raises(WebSocketDisconnect) as limited:
        socket_state(f"/ws/games/{gid}?handshake=1", None, "Secret1901")
    assert limited.value.code == 4429
    # The same guesses share one count across HTTP and the socket.
    assert client.get(f"/api/game?game_id={gid}", headers=RIGHT).status_code == 429
