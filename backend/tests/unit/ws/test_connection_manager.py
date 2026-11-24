"""Broadcasting a board: one masked copy per viewing power, concurrent sends, and no silent failures."""

import asyncio
import logging
import time

from domain.board import Power
from scenarios.presets import build_scenario
from starlette.websockets import WebSocketDisconnect
from ws import connection_manager as cm
from ws.connection_manager import (
    ConnectionManager,
    build_game_update_payload,
    build_lobby_update_payload,
)


class FakeSocket:
    def __init__(self, behaviour="ok"):
        self.behaviour = behaviour
        self.sent: list[dict] = []

    async def send_json(self, payload):
        if self.behaviour == "hang":
            await asyncio.sleep(3600)
        elif self.behaviour == "closed":
            raise WebSocketDisconnect()
        elif self.behaviour == "boom":
            raise ValueError("payload could not be serialized")
        self.sent.append(payload)


def _manager_with(game_id, sockets_by_power):
    manager = ConnectionManager()
    for ws, power in sockets_by_power:
        manager.register_game(game_id, ws, power)
    return manager


def test_state_is_masked_once_per_viewing_power_not_once_per_socket(monkeypatch):
    game = build_scenario("standard_1901", Power.FRANCE, "bc_cost")
    calls: list[Power | None] = []
    real = cm.sanitize_game_state_for_viewer

    def counting(state, power=None, viewer_ids=None):
        calls.append(power)
        return real(state, power, viewer_ids)

    monkeypatch.setattr(cm, "sanitize_game_state_for_viewer", counting)
    sockets = [
        (FakeSocket(), Power.FRANCE),
        (FakeSocket(), Power.FRANCE),
        (FakeSocket(), Power.FRANCE),
        (FakeSocket(), Power.GERMANY),
        (FakeSocket(), None),
        (FakeSocket(), None),
    ]
    manager = _manager_with("bc_cost", sockets)

    asyncio.run(manager.broadcast_game("bc_cost", state=game))

    assert sorted(calls, key=str) == sorted([Power.FRANCE, Power.GERMANY, None], key=str)
    assert all(len(ws.sent) == 1 for ws, _ in sockets)


def test_sockets_of_one_power_each_get_only_their_own_acknowledgements():
    from domain.game_state import AdminActionLogEntry

    game = build_scenario("standard_1901", Power.FRANCE, "bc_ack")
    game.admin_log = [
        AdminActionLogEntry(
            id="e1",
            timestamp="t",
            actor="host",
            season="Spring",
            year=1901,
            phase="Movement",
            acknowledged_by=["user-a", "a@x.com", "user-b", "b@x.com", "GERMANY", "guest"],
        )
    ]
    calls: list[Power | None] = []
    real = cm.sanitize_game_state_for_viewer

    def counting(state, power=None, viewer_ids=None):
        calls.append(power)
        return real(state, power, viewer_ids)

    a, b, nobody = FakeSocket(), FakeSocket(), FakeSocket()
    manager = ConnectionManager()
    manager.register_game("bc_ack", a, None, ("user-a",))
    manager.register_game("bc_ack", b, None, ("user-b",))
    manager.register_game("bc_ack", nobody, None)

    original = cm.sanitize_game_state_for_viewer
    cm.sanitize_game_state_for_viewer = counting
    try:
        asyncio.run(manager.broadcast_game("bc_ack", state=game))
    finally:
        cm.sanitize_game_state_for_viewer = original

    def acked(ws):
        return ws.sent[0]["state"]["admin_log"][0]["acknowledged_by"]

    assert acked(a) == ["user-a", "GERMANY", "guest"]
    assert acked(b) == ["user-b", "GERMANY", "guest"]
    assert acked(nobody) == ["GERMANY", "guest"]
    assert calls == [None]  # still masked once for the one viewing power


def test_each_power_still_gets_only_its_own_masked_copy():
    game = build_scenario("standard_1901", Power.FRANCE, "bc_masks")
    france, germany = FakeSocket(), FakeSocket()
    manager = _manager_with("bc_masks", [(france, Power.FRANCE), (germany, Power.GERMANY)])

    asyncio.run(manager.broadcast_game("bc_masks", state=game))

    assert france.sent[0]["state"] is not germany.sent[0]["state"]


def test_one_stalled_client_does_not_hold_up_the_others(monkeypatch):
    monkeypatch.setattr(cm, "SEND_TIMEOUT_SECONDS", 0.2)
    game = build_scenario("standard_1901", Power.FRANCE, "bc_slow")
    stalled, fast_a, fast_b = FakeSocket("hang"), FakeSocket(), FakeSocket()
    manager = _manager_with(
        "bc_slow", [(stalled, Power.FRANCE), (fast_a, Power.GERMANY), (fast_b, None)]
    )

    started = time.perf_counter()
    asyncio.run(manager.broadcast_game("bc_slow", state=game))
    elapsed = time.perf_counter() - started

    assert fast_a.sent and fast_b.sent
    assert elapsed < 2.0  # Bounded by the timeout, not by the stalled client.
    assert stalled not in manager.game_connections.get("bc_slow", {})


def test_a_closed_socket_is_dropped_quietly_and_an_unexpected_failure_is_logged(caplog):
    game = build_scenario("standard_1901", Power.FRANCE, "bc_log")
    closed, boom, fine = FakeSocket("closed"), FakeSocket("boom"), FakeSocket()
    manager = _manager_with(
        "bc_log", [(closed, Power.FRANCE), (boom, Power.GERMANY), (fine, Power.ENGLAND)]
    )

    with caplog.at_level(logging.DEBUG, logger="diplomacy.ws"):
        asyncio.run(manager.broadcast_game("bc_log", state=game))

    assert set(manager.game_connections["bc_log"]) == {fine}
    warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
    assert len(warnings) == 1
    assert "unexpected send error" in warnings[0].getMessage()
    assert warnings[0].exc_info is not None


def test_lobby_broadcast_also_survives_a_stalled_client(monkeypatch):
    monkeypatch.setattr(cm, "SEND_TIMEOUT_SECONDS", 0.2)
    manager = ConnectionManager()
    stalled, fast = FakeSocket("hang"), FakeSocket()
    manager.lobby_connections.update({stalled, fast})

    asyncio.run(manager.broadcast_lobby())

    assert fast.sent and fast.sent[0]["type"] == "lobby_update"
    assert stalled not in manager.lobby_connections


def test_payload_builders_produce_sanitized_game_and_lobby_updates(monkeypatch):
    from domain.game_state import MultiplayerGameSummary
    from storage.store import GAME_SUMMARIES, GAMES

    gid = "mp_ws_builder"
    game = build_scenario("standard_1901", Power.FRANCE, gid)
    summary = MultiplayerGameSummary(
        game_id=gid,
        name="Builder Match",
        created_by="secret@example.com",
        creator_id="22222222-2222-2222-2222-222222222222",
        created_at="2026-11-13T00:00:00Z",
    )
    monkeypatch.setitem(GAMES, gid, game)
    monkeypatch.setitem(GAME_SUMMARIES, gid, summary)

    game_payload = build_game_update_payload(gid, game, summary, Power.FRANCE)
    assert game_payload["type"] == "game_update"
    assert game_payload["game_id"] == gid
    assert game_payload["summary"]["created_by"] == "Envoy"
    assert game_payload["summary"]["board"] is None

    lobby_payload = build_lobby_update_payload()
    assert lobby_payload["type"] == "lobby_update"
    match_entry = next(g for g in lobby_payload["games"] if g["game_id"] == gid)
    assert match_entry["created_by"] == "Envoy"
