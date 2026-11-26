"""The host's overrides of the clock (issue #393): pause, resume, retime, stop and lengths."""

import time

import jwt
import pytest
from storage.store import GAMES
from tests.integration.api.turn_clock.helpers import (
    ALL_POWERS,
    TEST_JWT_SECRET,
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

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")


def player_headers(power: str) -> dict:
    token = jwt.encode(
        {
            "sub": f"user_{power}",
            "email": f"{power}@example.com",
            "exp": int(time.time()) + 3600,
            "aud": "authenticated",
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def host(client, gid: str, action: str, json=None, method="post"):
    call = getattr(client, method)
    kwargs = {"headers": host_headers()}
    if json is not None:
        kwargs["json"] = json
    return call(f"/api/admin/timer/{action}?game_id={gid}", **kwargs)


def last_log_line(gid: str) -> str:
    return GAMES[gid].admin_log[-1].summary_lines[-1]


def test_only_the_host_may_override_the_clock(client):
    gid = make_match(client)
    start_clock(client, gid)
    routes = [
        ("pause", None, "post"),
        ("resume", None, "post"),
        ("deadline", {"seconds_left": 600}, "post"),
        ("stop", None, "post"),
        ("settings", {"vote_minutes": [5]}, "put"),
    ]
    for action, body, method in routes:
        call = getattr(client, method)
        kwargs = {"json": body} if body is not None else {}
        assert call(f"/api/admin/timer/{action}?game_id={gid}", **kwargs).status_code == 401
        res = call(
            f"/api/admin/timer/{action}?game_id={gid}", headers=player_headers("ENGLAND"), **kwargs
        )
        assert res.status_code == 403, action
    assert GAMES[gid].timer.stage == "voting"
    assert GAMES[gid].admin_log == []


def test_a_host_pause_holds_until_the_host_resumes(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid, "15")

    timer = host(client, gid, "pause").json()["timer"]
    assert timer["stage"] == "paused"
    assert timer["host_paused"] is True
    assert timer["remaining_seconds"] is None
    assert "Paused the turn clock" in last_log_line(gid)

    # Players cannot ready up out of it.
    for power in ALL_POWERS:
        assert ready(client, gid, power).status_code == 409
    assert GAMES[gid].timer.stage == "paused"

    timer = host(client, gid, "resume").json()["timer"]
    assert timer["stage"] == "voting"
    assert timer["host_paused"] is False
    assert turn_label(gid) == "Spring 1901 Movement"


def test_the_host_can_resume_a_pause_the_players_voted_for(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid, "pause")
    assert GAMES[gid].timer.stage == "paused"
    assert host(client, gid, "resume").json()["timer"]["stage"] == "voting"


def test_resume_needs_a_pause(client):
    gid = make_match(client)
    start_clock(client, gid)
    assert host(client, gid, "resume").status_code == 409


def test_setting_time_left_ends_the_vote_and_runs_the_clock(client):
    gid = make_match(client)
    start_clock(client, gid)
    vote(client, gid, "FRANCE", "30")

    timer = host(client, gid, "deadline", {"seconds_left": 90 * 60}).json()["timer"]
    assert timer["stage"] == "running"
    assert timer["minutes"] == 90
    assert timer["votes"] == {}
    assert 90 * 60 - 2 < timer["remaining_seconds"] <= 90 * 60
    assert last_log_line(gid).startswith("[ADMIN OVERRIDE] Ended the vote.")


def test_setting_time_left_lifts_a_host_pause(client):
    gid = make_match(client)
    start_clock(client, gid)
    host(client, gid, "pause")
    timer = host(client, gid, "deadline", {"seconds_left": 300}).json()["timer"]
    assert timer["stage"] == "running"
    assert timer["host_paused"] is False


def test_nudging_moves_the_running_deadline(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid, "15")
    before = GAMES[gid].timer.deadline

    host(client, gid, "deadline", {"adjust_seconds": 300})
    assert GAMES[gid].timer.deadline == before + 300
    assert "Added 5 min" in last_log_line(gid)

    host(client, gid, "deadline", {"adjust_seconds": -60})
    assert GAMES[gid].timer.deadline == before + 240
    assert "Took 1 min off" in last_log_line(gid)


def test_nudging_needs_a_running_clock(client):
    gid = make_match(client)
    start_clock(client, gid)
    assert host(client, gid, "deadline", {"adjust_seconds": 60}).status_code == 409


def test_a_wall_clock_deadline_is_kept_exactly(client):
    gid = make_match(client)
    start_clock(client, gid)
    at = time.time() + 2 * 3600
    timer = host(client, gid, "deadline", {"deadline": at}).json()["timer"]
    assert timer["deadline"] == at
    assert timer["stage"] == "running"


def test_a_deadline_must_be_ahead_and_within_thirty_days(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid, "15")
    deadline = GAMES[gid].timer.deadline
    assert host(client, gid, "deadline", {"seconds_left": 5}).status_code == 400
    assert host(client, gid, "deadline", {"deadline": time.time() - 60}).status_code == 400
    assert host(client, gid, "deadline", {"adjust_seconds": -20 * 60}).status_code == 400
    assert host(client, gid, "deadline", {"seconds_left": 31 * 86400}).status_code == 400
    assert host(client, gid, "deadline", {}).status_code == 422
    assert host(client, gid, "deadline", {"seconds_left": 60, "deadline": 1}).status_code == 422
    assert GAMES[gid].timer.deadline == deadline


def test_a_host_set_deadline_still_resolves_when_it_runs_out(client):
    gid = make_match(client)
    start_clock(client, gid)
    host(client, gid, "deadline", {"seconds_left": 600})
    run_out(gid)
    poll(client, gid)
    assert turn_label(gid) == "Fall 1901 Movement"
    assert GAMES[gid].timer.stage == "voting"


def test_turning_the_clock_off_leaves_the_match_untimed(client):
    gid = make_match(client)
    start_clock(client, gid)
    assert host(client, gid, "stop").json()["timer"] is None
    assert host(client, gid, "stop").status_code == 409
    assert host(client, gid, "pause").status_code == 409
    # The host can start it again.
    assert start_clock(client, gid)["stage"] == "voting"


def test_clock_lengths_apply_from_the_next_vote_and_phase(client):
    gid = make_match(client)
    start_clock(client, gid)
    res = host(
        client,
        gid,
        "settings",
        {"vote_minutes": [45, 10], "fixed_phase_minutes": 12, "vote_window_seconds": 120},
        method="put",
    )
    assert res.status_code == 200, res.text
    state = res.json()
    assert state["timer_settings"] == {
        "vote_minutes": [10, 45],
        "fixed_phase_minutes": 12,
        "vote_window_seconds": 120,
    }
    # The open vote keeps what it offered.
    assert state["timer"]["vote_minutes"] == [15, 20, 30]
    assert vote(client, gid, "FRANCE", "45").status_code == 400

    host(client, gid, "pause")
    timer = host(client, gid, "resume").json()["timer"]
    assert timer["vote_minutes"] == [10, 45]
    assert 110 < timer["remaining_seconds"] <= 120
    assert vote(client, gid, "FRANCE", "20").status_code == 400
    run_vote(client, gid, "45")
    assert GAMES[gid].timer.minutes == 45


def test_lengths_can_be_set_before_the_clock_starts(client):
    gid = make_match(client)
    res = host(client, gid, "settings", {"vote_minutes": [60]}, method="put")
    assert res.status_code == 200
    assert start_clock(client, gid)["vote_minutes"] == [60]


def test_bad_lengths_are_refused(client):
    gid = make_match(client)
    for body in (
        {"vote_minutes": []},
        {"vote_minutes": [10, 10]},
        {"vote_minutes": [1, 2, 3, 4]},
        {"vote_minutes": [0]},
        {"fixed_phase_minutes": 0},
        {"vote_window_seconds": 5},
    ):
        assert host(client, gid, "settings", body, method="put").status_code == 422, body


def test_a_rollback_keeps_the_hosts_lengths(client):
    gid = make_match(client)
    start_clock(client, gid)
    run_vote(client, gid, "15")
    run_out(gid)
    poll(client, gid)
    assert turn_label(gid) == "Fall 1901 Movement"
    host(client, gid, "settings", {"vote_minutes": [7]}, method="put")

    res = client.post(f"/api/admin/rollback?game_id={gid}", headers=host_headers())
    assert res.status_code == 200, res.text
    assert turn_label(gid) == "Spring 1901 Movement"
    assert GAMES[gid].timer_settings.vote_minutes == [7]
    assert GAMES[gid].timer.vote_minutes == [7]


def test_every_override_reaches_the_admin_log_for_players_to_acknowledge(client):
    gid = make_match(client)
    start_clock(client, gid)
    host(client, gid, "pause")
    host(client, gid, "resume")
    host(client, gid, "deadline", {"seconds_left": 600})
    host(client, gid, "stop")
    log = GAMES[gid].admin_log
    assert len(log) == 4
    # The host has acknowledged their own overrides; the other players have not.
    assert all("FRANCE" in entry.acknowledged_by for entry in log)
    assert not any("ENGLAND" in entry.acknowledged_by for entry in log)
    seen = client.get(f"/api/game?game_id={gid}", headers=player_headers("ENGLAND")).json()
    assert len(seen["state"]["admin_log"]) == 4


def test_the_default_board_has_no_clock_to_override(client):
    assert client.post("/api/admin/timer/pause?game_id=proto_1901").status_code == 409
    # No game_id means the default board, as on every admin route.
    assert client.post("/api/admin/timer/pause").status_code == 409


def test_long_lengths_are_logged_in_days_and_hours(client):
    gid = make_match(client)
    start_clock(client, gid)
    host(client, gid, "deadline", {"seconds_left": (2 * 24 * 60 + 3 * 60 + 39) * 60})
    assert "2 d 3 h left" in last_log_line(gid)
