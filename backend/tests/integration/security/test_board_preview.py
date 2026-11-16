"""The board preview on a game summary reaches a player's own games and nothing else.

`GET /api/games/mine` carries it. The public list, the lobby socket, the game's own summary
and a stranger's `mine` do not, and it never holds an order.
"""

import time

import pytest
from domain.game_state import PhaseTimer, TimerStage
from engine.adjudicator.territory import displayed_owners
from main import app
from starlette.testclient import TestClient
from storage.store import GAME_SUMMARIES, GAMES
from tests.ws_testing import receive_json

from .helpers import auth_headers

client = TestClient(app)

HOST = ("board_host", "boardhost@secret.test")
GUEST = ("board_guest", "boardguest@secret.test")
STRANGER = ("board_stranger", "stranger@elsewhere.test")
UNIT_KEYS = {"power", "unit_type", "province", "coast"}


@pytest.fixture
def match():
    """A public two-player match: HOST is France, GUEST is Germany."""
    gid = client.post(
        "/api/games",
        headers=auth_headers(*HOST),
        json={"name": "Mapped Table", "creator_power": "FRANCE"},
    ).json()["game_id"]
    joined = client.post(
        f"/api/games/{gid}/join", headers=auth_headers(*GUEST), json={"power": "GERMANY"}
    )
    assert joined.status_code == 200
    yield gid
    GAME_SUMMARIES.pop(gid, None)
    GAMES.pop(gid, None)


def _mine(who, gid):
    res = client.get("/api/games/mine", headers=auth_headers(*who))
    assert res.status_code == 200
    return next((g for g in res.json() if g["game_id"] == gid), None)


def _standing(state):
    return [u for u in state.units if not u.is_dislodged]


def test_mine_carries_the_board_for_a_player_in_the_game(match):
    board = _mine(HOST, match)["board"]
    state = GAMES[match]

    shown = displayed_owners(state.ownership)
    assert board["ownership"] == {prov: p.value for prov, p in shown.items()}
    # Home land nobody has claimed is coloured for its home power, as on the board.
    assert "BUR" not in state.ownership
    assert board["ownership"]["BUR"] == "FRANCE"
    assert len(board["units"]) == len(state.units)
    assert {"power": "FRANCE", "unit_type": "A", "province": "PAR", "coast": None} in board["units"]
    assert _mine(GUEST, match)["board"] == board


def test_a_stranger_gets_no_board(match):
    assert _mine(STRANGER, match) is None


def test_public_list_and_game_summary_carry_no_board(match):
    listed = next(g for g in client.get("/api/games").json() if g["game_id"] == match)
    details = client.get(f"/api/games/{match}", headers=auth_headers(*STRANGER)).json()
    bootstrap = client.get(f"/api/game?game_id={match}", headers=auth_headers(*STRANGER)).json()

    assert GAME_SUMMARIES[match].board is not None
    assert listed["board"] is None
    assert details["board"] is None
    assert bootstrap["summary"]["board"] is None
    assert "ownership" not in client.get("/api/games/browse", params={"seats": "all"}).text


def test_lobby_socket_carries_no_board(match):
    with client.websocket_connect("/ws/lobby") as ws:
        first = receive_json(ws)["games"]
        ws.send_json({"type": "refresh"})
        refreshed = receive_json(ws)["games"]

    for games in (first, refreshed):
        listed = next(g for g in games if g["game_id"] == match)
        assert listed["board"] is None


def _order_move(who, gid, power, origin, target):
    unit = next(u for u in GAMES[gid].units if u.power.value == power and u.province == origin)
    sent = client.post(
        f"/api/order?game_id={gid}",
        headers=auth_headers(*who),
        json={
            "active_power": power,
            "order": {
                "unit_id": unit.id,
                "power": power,
                "unit_type": unit.unit_type.value,
                "origin": origin,
                "order_type": "MOVE",
                "target": target,
                "is_explicit": True,
            },
        },
    )
    assert sent.status_code == 200, sent.text


def test_board_holds_no_orders(match):
    """Germany's secret move must not show in what France reads back."""
    _order_move(GUEST, match, "GERMANY", "MUN", "BUR")

    board = _mine(HOST, match)["board"]
    assert set(board) == {"ownership", "units"}
    assert all(set(u) == UNIT_KEYS for u in board["units"])
    assert "BUR" not in [u["province"] for u in board["units"]]


def test_board_follows_a_resolved_turn(match):
    _order_move(HOST, match, "FRANCE", "PAR", "BUR")
    resolved = client.post(f"/api/adjudicate?game_id={match}", headers=auth_headers(*HOST))
    assert resolved.status_code == 200, resolved.text

    board = _mine(HOST, match)["board"]
    provinces = [u["province"] for u in board["units"]]
    assert len(provinces) == len(_standing(GAMES[match]))
    assert "BUR" in provinces and "PAR" not in provinces


def test_deadline_is_set_only_while_the_phase_clock_runs(match):
    assert _mine(HOST, match)["deadline"] is None

    state = GAMES[match]
    state.timer = PhaseTimer(stage=TimerStage.RUNNING, deadline=time.time() + 3600, minutes=60)
    assert _mine(HOST, match)["deadline"] == state.timer.deadline

    state.timer = PhaseTimer(stage=TimerStage.VOTING, deadline=time.time() + 60)
    assert _mine(HOST, match)["deadline"] is None
