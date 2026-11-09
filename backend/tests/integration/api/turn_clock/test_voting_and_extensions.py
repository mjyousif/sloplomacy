"""The multiplayer clock through the API: starting it, voting, pausing, finishing early and extensions."""

import time

from domain.board import Power
from domain.game_state import TimerChoice, TimerStage
from engine.phase_timer import (
    VOTE_WINDOW_SECONDS,
)
from storage.store import GAMES
from tests.integration.api.turn_clock.helpers import (
    ALL_POWERS,
    extend,
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


def test_only_the_host_starts_the_clock_and_only_once(client):
    gid = make_match(client)
    assert client.post(f"/api/games/{gid}/timer/start").status_code == 401

    timer = start_clock(client, gid)
    assert timer["stage"] == "voting"
    assert 0 < timer["remaining_seconds"] <= VOTE_WINDOW_SECONDS
    assert sorted(timer["players"]) == sorted(ALL_POWERS)

    again = client.post(f"/api/games/{gid}/timer/start", headers=host_headers())
    assert again.status_code == 409


def test_clock_cannot_start_before_the_match_is_active(client):
    gid = make_match(client, powers=["FRANCE"])
    res = client.post(f"/api/games/{gid}/timer/start", headers=host_headers())
    assert res.status_code == 409


def test_a_match_with_no_clock_is_never_timed(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    assert poll(client, gid)["timer"] is None
    assert turn_label(gid) == "Spring 1901 Movement"


def test_vote_closes_as_soon_as_everyone_has_voted(client):
    gid = make_match(client)
    start_clock(client, gid)
    for power in ALL_POWERS[:6]:
        res = vote(client, gid, power, "20")
        assert res.json()["timer"]["stage"] == "voting"

    timer = vote(client, gid, ALL_POWERS[6], "30").json()["timer"]
    assert timer["stage"] == "running"
    assert timer["minutes"] == 20
    assert 19 * 60 < timer["remaining_seconds"] <= 20 * 60


def test_a_player_can_change_their_vote_until_it_closes(client):
    gid = make_match(client)
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "15")
    vote(client, gid, "FRANCE", "30")
    assert GAMES[gid].timer.votes == {Power.FRANCE: TimerChoice.MIN_30}


def test_vote_window_running_out_counts_the_votes_cast(client):
    gid = make_match(client)
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "15")
    vote(client, gid, "ENGLAND", "30")
    run_out(gid)

    timer = poll(client, gid)["timer"]
    assert timer["stage"] == "running"
    assert timer["minutes"] == 30


def test_nobody_voting_pauses_and_ready_up_opens_a_new_vote(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND", "GERMANY"])
    start_clock(client, gid)
    run_out(gid)

    timer = poll(client, gid)["timer"]
    assert timer["stage"] == "paused"
    assert timer["remaining_seconds"] is None

    assert ready(client, gid, "FRANCE").json()["timer"]["ready_powers"] == ["FRANCE"]
    assert ready(client, gid, "ENGLAND").json()["timer"]["stage"] == "paused"
    assert ready(client, gid, "ENGLAND", active=False).json()["timer"]["ready_powers"] == ["FRANCE"]
    ready(client, gid, "ENGLAND")

    timer = ready(client, gid, "GERMANY").json()["timer"]
    assert timer["stage"] == "voting"
    assert timer["votes"] == {}
    assert timer["ready_powers"] == []


def test_voting_to_pause_pauses(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "pause")
    assert vote(client, gid, "ENGLAND", "15").json()["timer"]["stage"] == "paused"


def test_a_pause_never_expires(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid, "pause")
    poll(client, gid)
    assert GAMES[gid].timer.stage == TimerStage.PAUSED
    assert turn_label(gid) == "Spring 1901 Movement"


def test_finishing_early_resolves_at_once_and_opens_the_next_vote(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    for power in ("FRANCE", "ENGLAND"):
        client.post(f"/api/finalize?game_id={gid}", json={"power": power, "force": True})

    assert turn_label(gid) == "Fall 1901 Movement"
    assert GAMES[gid].timer.stage == TimerStage.VOTING
    assert GAMES[gid].timer.votes == {}


def test_finishing_during_a_pause_still_resolves(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid, "pause")
    for power in ("FRANCE", "ENGLAND"):
        client.post(f"/api/finalize?game_id={gid}", json={"power": power, "force": True})
    assert turn_label(gid) == "Fall 1901 Movement"


def test_extension_adds_five_minutes_once_five_of_seven_ask(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid)
    before = GAMES[gid].timer.deadline

    for power in ALL_POWERS[:4]:
        assert extend(client, gid, power).status_code == 200
    assert GAMES[gid].timer.deadline == before
    assert len(GAMES[gid].timer.extend_requests) == 4

    extend(client, gid, ALL_POWERS[4])
    assert GAMES[gid].timer.deadline == before + 300
    assert GAMES[gid].timer.extend_requests == []

    # The button can be used again.
    for power in ALL_POWERS[:5]:
        extend(client, gid, power)
    assert GAMES[gid].timer.deadline == before + 600


def test_extension_can_be_taken_back_and_one_player_counts_once(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid)
    extend(client, gid, "FRANCE")
    extend(client, gid, "FRANCE")
    assert GAMES[gid].timer.extend_requests == [Power.FRANCE]
    extend(client, gid, "FRANCE", active=False)
    assert GAMES[gid].timer.extend_requests == []


def test_extension_scales_with_a_smaller_table(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    before = GAMES[gid].timer.deadline
    extend(client, gid, "FRANCE")
    assert GAMES[gid].timer.deadline == before
    extend(client, gid, "ENGLAND")
    assert GAMES[gid].timer.deadline == before + 300


def test_extension_landing_after_the_deadline_gives_real_time(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    GAMES[gid].timer.deadline = time.time() - 30
    extend(client, gid, "FRANCE")
    extend(client, gid, "ENGLAND")
    assert GAMES[gid].timer.remaining_seconds > 290


def test_timer_actions_check_the_stage_and_the_player(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    assert vote(client, gid, "FRANCE", "15").status_code == 409  # Not started

    start_clock(client, gid)
    assert extend(client, gid, "FRANCE").status_code == 409  # Still voting
    assert ready(client, gid, "FRANCE").status_code == 409
    assert vote(client, gid, "TURKEY", "15").status_code == 403  # Not seated
    assert vote(client, gid, "FRANCE", "45").status_code == 422  # Not an option
