"""Tests for the multiplayer phase clock: voting, pausing, extending and running out."""

import asyncio
import time

import jwt
import pytest
from fastapi.testclient import TestClient

import main
from main import GAME_HISTORY, GAME_SUMMARIES, GAMES, PRIVATE_SANDBOXES, app, tick_timer
from models import GameState, PhaseTimer, Power, TimerChoice, TimerStage
from phase_timer import FIXED_PHASE_MINUTES, VOTE_WINDOW_SECONDS, start_phase_clock, tally_votes

TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"
ALL_POWERS = ["FRANCE", "ENGLAND", "GERMANY", "ITALY", "AUSTRIA", "RUSSIA", "TURKEY"]
HOST_ID = "timer_host"
HOST_EMAIL = "host@example.com"


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


@pytest.fixture
def client():
    return TestClient(app)


def host_headers() -> dict:
    token = jwt.encode(
        {"sub": HOST_ID, "email": HOST_EMAIL, "exp": int(time.time()) + 3600, "aud": "authenticated"},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def make_match(client, powers=ALL_POWERS) -> str:
    created = client.post(
        "/api/games",
        json={"name": "Timer Test", "creator_power": powers[0], "user_id": HOST_ID, "email": HOST_EMAIL},
    )
    assert created.status_code == 200
    gid = created.json()["game_id"]
    for power in powers[1:]:
        joined = client.post(
            f"/api/games/{gid}/join",
            json={"power": power, "user_id": f"user_{power}", "email": f"{power}@example.com"},
        )
        assert joined.status_code == 200
    return gid


def start_clock(client, gid: str) -> dict:
    res = client.post(f"/api/games/{gid}/timer/start", headers=host_headers())
    assert res.status_code == 200, res.text
    return res.json()["timer"]


def vote(client, gid: str, power: str, choice: str):
    return client.post(f"/api/games/{gid}/timer/vote", json={"power": power, "choice": choice})


def run_vote(client, gid: str, choice: str = "15") -> None:
    for power in GAMES[gid].timer.players:
        assert vote(client, gid, power.value, choice).status_code == 200


def extend(client, gid: str, power: str, active: bool = True):
    return client.post(f"/api/games/{gid}/timer/extend", json={"power": power, "active": active})


def ready(client, gid: str, power: str, active: bool = True):
    return client.post(f"/api/games/{gid}/timer/ready", json={"power": power, "active": active})


def poll(client, gid: str) -> dict:
    res = client.get(f"/api/game?game_id={gid}")
    assert res.status_code == 200
    return res.json()["state"]


def run_out(gid: str) -> None:
    GAMES[gid].timer.deadline = time.time() - 1


def turn_label(gid: str) -> str:
    game = GAMES[gid]
    return f"{game.season} {game.year} {game.phase}"


@pytest.mark.parametrize(
    "votes, expected",
    [
        ({}, TimerChoice.PAUSE),
        ({Power.FRANCE: TimerChoice.MIN_15}, TimerChoice.MIN_15),
        # Most votes wins without needing more than half of them.
        (
            {
                Power.FRANCE: TimerChoice.MIN_15,
                Power.ENGLAND: TimerChoice.MIN_15,
                Power.GERMANY: TimerChoice.MIN_15,
                Power.ITALY: TimerChoice.MIN_20,
                Power.AUSTRIA: TimerChoice.MIN_20,
                Power.RUSSIA: TimerChoice.MIN_30,
                Power.TURKEY: TimerChoice.MIN_30,
            },
            TimerChoice.MIN_15,
        ),
        # Ties go to the longer option.
        ({Power.FRANCE: TimerChoice.MIN_15, Power.ENGLAND: TimerChoice.MIN_20}, TimerChoice.MIN_20),
        ({Power.FRANCE: TimerChoice.MIN_20, Power.ENGLAND: TimerChoice.MIN_30}, TimerChoice.MIN_30),
        ({Power.FRANCE: TimerChoice.MIN_30, Power.ENGLAND: TimerChoice.PAUSE}, TimerChoice.PAUSE),
    ],
)
def test_tally_votes(votes, expected):
    assert tally_votes(votes) == expected


@pytest.mark.parametrize("players, needed", [(7, 5), (6, 5), (5, 4), (4, 3), (3, 3), (2, 2), (1, 1)])
def test_extension_scales_with_players(players, needed):
    timer = PhaseTimer(stage=TimerStage.RUNNING, players=[Power(p) for p in ALL_POWERS[:players]])
    assert timer.extensions_needed == needed


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

    real_persist = main.persist_game

    async def slow_persist(game_id):
        await asyncio.sleep(0)
        await real_persist(game_id)

    monkeypatch.setattr(main, "persist_game", slow_persist)

    async def both():
        await asyncio.gather(tick_timer(GAMES[gid]), tick_timer(GAMES[gid]))

    asyncio.run(both())
    assert turn_label(gid) == "Fall 1901 Movement"
    assert len(GAME_HISTORY[gid]) == 1


@pytest.mark.parametrize("phase", ["Retreats", "Adjustments"])
def test_retreats_and_builds_get_a_fixed_clock_with_no_vote(client, phase):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    game = GAMES[gid]
    game.phase = phase
    start_phase_clock(game, [Power.FRANCE, Power.ENGLAND], time.time())

    assert game.timer.stage == TimerStage.RUNNING
    assert game.timer.minutes == FIXED_PHASE_MINUTES == 5
    assert FIXED_PHASE_MINUTES * 60 - 1 < game.timer.remaining_seconds <= FIXED_PHASE_MINUTES * 60


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


def test_a_late_finalize_cannot_lock_the_next_phase(client):
    gid = make_match(client, powers=["FRANCE", "ENGLAND"])
    start_clock(client, gid)
    run_vote(client, gid)
    turn = turn_label(gid)
    run_out(gid)
    poll(client, gid)

    res = client.post(f"/api/finalize?game_id={gid}", json={"power": "FRANCE", "force": True, "turn": turn})
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
    res = client.post(f"/api/order?game_id={gid}", json={"order": order, "turn": "Spring 1900 Movement"})
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
        json={"user_id": "user_GERMANY", "email": "GERMANY@example.com", "power": "GERMANY", "leave": False},
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
