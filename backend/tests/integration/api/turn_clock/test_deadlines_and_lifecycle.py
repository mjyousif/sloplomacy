"""The multiplayer clock through the API: deadlines, stale requests, and the clock across rollbacks, seats, wins and restarts."""

import asyncio
import time

import api.turns as turns_api
import pytest
from api.turns import tick_timer
from domain.board import Power
from domain.game_state import GameState, TimerChoice, TimerStage
from engine.phase_timer import (
    FIXED_PHASE_MINUTES,
    start_phase_clock,
)
from storage.store import GAME_HISTORY, GAME_SUMMARIES, GAMES, PRIVATE_SANDBOXES
from tests.integration.api.turn_clock.helpers import (
    host_headers,
    make_match,
    poll,
    ready,
    run_out,
    run_vote,
    start_clock,
    turn_label,
    vote,
)


def test_deadline_resolves_with_the_orders_players_entered(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    game = GAMES[gid]
    army = next(u for u in game.units if u.province == "PAR")
    drafted = {
        "unit_id": army.id,
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "MOVE",
        "target": "BUR",
    }
    assert client.post(f"/api/order?game_id={gid}", json={"order": drafted}).status_code == 200

    run_out(gid)
    state = poll(client, gid)

    assert turn_label(gid) == "Fall 1901 Movement"
    assert any(u["province"] == "BUR" for u in state["units"])
    assert state["timer"]["stage"] == "voting"


def test_two_requests_cannot_resolve_one_deadline_twice(client, monkeypatch):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    run_out(gid)

    real_persist = turns_api.persist_game

    async def slow_persist(game_id):
        await asyncio.sleep(0)
        await real_persist(game_id)

    monkeypatch.setattr(turns_api, "persist_game", slow_persist)

    async def both():
        await asyncio.gather(tick_timer(GAMES[gid]), tick_timer(GAMES[gid]))

    asyncio.run(both())
    assert turn_label(gid) == "Fall 1901 Movement"
    assert len(GAME_HISTORY[gid]) == 1


def test_a_live_sync_refresh_resolves_a_deadline_that_has_passed(client):
    # The browser sends `refresh` over the socket when its countdown reaches zero.
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    with client.websocket_connect(f"/ws/games/{gid}") as ws:
        assert ws.receive_json()["type"] == "game_update"
        run_out(gid)
        ws.send_json({"type": "ping"})
        assert ws.receive_json()["type"] == "pong"
        assert turn_label(gid) == "Spring 1901 Movement"
        ws.send_json({"type": "refresh"})
        while True:
            msg = ws.receive_json()
            if msg["type"] == "game_update" and msg["state"]["season"] == "Fall":
                break
    assert turn_label(gid) == "Fall 1901 Movement"


def test_a_deadline_that_cannot_resolve_pauses_and_is_saved(client, monkeypatch):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    run_out(gid)

    async def broken(game):
        raise RuntimeError("adjudicator exploded")

    saved = []
    real_persist = turns_api.persist_game

    async def recording_persist(game_id):
        saved.append(GAMES[game_id].timer.stage if GAMES[game_id].timer else None)
        await real_persist(game_id)

    monkeypatch.setattr(turns_api, "_execute_adjudication", broken)
    monkeypatch.setattr(turns_api, "persist_game", recording_persist)
    asyncio.run(tick_timer(GAMES[gid]))

    assert GAMES[gid].timer.stage == TimerStage.PAUSED
    assert saved == [TimerStage.PAUSED]


@pytest.mark.parametrize("phase", ["Retreats", "Adjustments"])
def test_retreats_and_builds_get_a_fixed_clock_with_no_vote(client, phase):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    game = GAMES[gid]
    game.phase = phase
    start_phase_clock(game, [Power.FRANCE, Power.ENGLAND], time.time())

    assert game.timer.stage == TimerStage.RUNNING
    assert game.timer.minutes == FIXED_PHASE_MINUTES == 5
    assert FIXED_PHASE_MINUTES * 60 - 1 < game.timer.remaining_seconds <= FIXED_PHASE_MINUTES * 60


def test_a_late_finalize_cannot_lock_the_next_phase(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    turn = turn_label(gid)
    run_out(gid)
    poll(client, gid)

    res = client.post(
        f"/api/finalize?game_id={gid}", json={"power": "FRANCE", "force": True, "turn": turn}
    )
    assert res.status_code == 409
    assert GAMES[gid].finalized_powers == []

    current = client.post(
        f"/api/finalize?game_id={gid}",
        json={"power": "FRANCE", "force": True, "turn": turn_label(gid)},
    )
    assert current.status_code == 200
    assert GAMES[gid].finalized_powers == [Power.FRANCE]


def test_a_late_order_cannot_land_on_the_next_phase(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    game = GAMES[gid]
    army = next(u for u in game.units if u.province == "PAR")
    order = {
        "unit_id": army.id,
        "power": "FRANCE",
        "unit_type": "A",
        "origin": "PAR",
        "order_type": "MOVE",
        "target": "BUR",
    }
    res = client.post(
        f"/api/order?game_id={gid}", json={"order": order, "turn": "Spring 1900 Movement"}
    )
    assert res.status_code == 409


def test_rollback_starts_the_clock_over(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    run_out(gid)
    poll(client, gid)
    assert turn_label(gid) == "Fall 1901 Movement"

    res = client.post(f"/api/admin/rollback?game_id={gid}", headers=host_headers())
    assert res.status_code == 200
    timer = res.json()["timer"]
    assert timer["stage"] == "voting"
    assert timer["remaining_seconds"] > 0

    poll(client, gid)
    assert turn_label(gid) == "Spring 1901 Movement"


def test_rollback_leaves_an_untimed_match_untimed(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    client.post(f"/api/adjudicate?game_id={gid}", headers=host_headers())
    res = client.post(f"/api/admin/rollback?game_id={gid}", headers=host_headers())
    assert res.json()["timer"] is None


def test_set_turn_starts_the_clock_for_the_new_phase(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    res = client.post(
        f"/api/admin/set-turn?game_id={gid}",
        json={"season": "Winter", "year": 1901, "phase": "Adjustments"},
        headers=host_headers(),
    )
    assert res.status_code == 200
    assert res.json()["timer"]["stage"] == "running"
    assert res.json()["timer"]["minutes"] == FIXED_PHASE_MINUTES


def test_private_sandbox_carries_no_clock(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)

    res = client.post(f"/api/sandbox/enter?game_id={gid}", json={"power": "FRANCE"})
    sandbox_id = res.json()["game_id"]
    assert sandbox_id in PRIVATE_SANDBOXES
    assert res.json()["timer"] is None
    assert GAMES[gid].timer.stage == TimerStage.RUNNING


def test_surrender_can_complete_a_vote(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND", "GERMANY"])
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "30")
    vote(client, gid, "ENGLAND", "30")

    res = client.post(
        f"/api/games/{gid}/surrender",
        json={
            "user_id": "user_GERMANY",
            "email": "GERMANY@example.com",
            "power": "GERMANY",
            "leave": False,
        },
    )
    assert res.status_code == 200
    assert GAMES[gid].timer.stage == TimerStage.RUNNING
    assert Power.GERMANY not in GAMES[gid].timer.players


def test_leaving_can_complete_a_ready_up_and_lowers_the_extension_bar(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND", "GERMANY"])
    start_clock(client, gid)
    run_vote(client, gid, "pause")
    ready(client, gid, "FRANCE")
    ready(client, gid, "ENGLAND")

    res = client.post(
        f"/api/games/{gid}/leave",
        json={"user_id": "user_GERMANY", "email": "GERMANY@example.com", "power": "GERMANY"},
    )
    assert res.status_code == 200
    assert GAMES[gid].timer.stage == TimerStage.VOTING
    assert GAMES[gid].timer.extensions_needed == 2


def test_a_player_joining_mid_vote_gets_a_say(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "15")
    client.post(
        f"/api/games/{gid}/join",
        json={"power": "ITALY", "user_id": "user_ITALY", "email": "ITALY@example.com"},
    )
    assert vote(client, gid, "ENGLAND", "15").json()["timer"]["stage"] == "voting"
    assert vote(client, gid, "ITALY", "15").json()["timer"]["stage"] == "running"


def test_clock_stops_when_the_match_drops_to_one_player(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    client.post(
        f"/api/games/{gid}/leave",
        json={"user_id": "user_ENGLAND", "email": "ENGLAND@example.com", "power": "ENGLAND"},
    )
    assert GAME_SUMMARIES[gid].status == "waiting"
    assert GAMES[gid].timer is None


def test_an_eliminated_player_is_not_waited_for(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND", "GERMANY"])
    game = GAMES[gid]
    game.units = [u for u in game.units if u.power != Power.GERMANY]
    game.ownership = {p: o for p, o in game.ownership.items() if o != Power.GERMANY}
    timer = start_clock(client, gid)
    assert sorted(timer["players"]) == ["ENGLAND", "FRANCE"]


def test_winning_stops_the_clock(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    game = GAMES[gid]
    start_clock(client, gid)
    game.winner = Power.FRANCE
    start_phase_clock(game, [Power.FRANCE, Power.ENGLAND], time.time())
    assert game.timer is None


def test_clock_survives_being_saved_and_loaded(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "20")
    game = GAMES[gid]

    restored = GameState.model_validate(game.model_dump(mode="json"))
    assert restored.timer.stage == TimerStage.VOTING
    assert restored.timer.deadline == game.timer.deadline
    assert restored.timer.votes == {Power.FRANCE: TimerChoice.MIN_20}


def test_deadline_still_fires_on_a_game_reloaded_after_a_restart(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    GAMES[gid] = GameState.model_validate(GAMES[gid].model_dump(mode="json"))

    run_out(gid)
    state = poll(client, gid)

    assert (state["season"], state["year"]) == ("Fall", 1901)
    assert state["timer"]["stage"] == "voting"


def test_a_game_saved_before_the_clock_existed_still_loads(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    saved = GAMES[gid].model_dump(mode="json")
    del saved["timer"]
    assert GameState.model_validate(saved).timer is None
