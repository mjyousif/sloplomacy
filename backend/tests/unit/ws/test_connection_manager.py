"""Broadcasting a board: one masked copy per viewing power, concurrent sends, and no silent failures."""

import asyncio
import logging
import time

from domain.board import Power
from scenarios.presets import build_scenario
from starlette.websockets import WebSocketDisconnect
from ws import connection_manager as cm
from ws.connection_manager import ConnectionManager


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

    def counting(state, power=None):
        calls.append(power)
        return real(state, power)

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
