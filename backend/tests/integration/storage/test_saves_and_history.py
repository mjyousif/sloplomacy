"""Saving: saves never overlap, and turn history is saved, resent and moved into its own column."""

import asyncio
import os
from unittest.mock import patch

from domain.board import Power
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import build_scenario
from storage.store import (
    GAME_HISTORY,
    GAMES,
    HISTORY_UNSAVED,
    SAVES_RUNNING,
    UNSAVED_GAMES,
    persist_game,
)
from tests.integration.storage.helpers import (
    ARMY_PARIS_TO_BURGUNDY,
    BOB,
    _create_game,
    _join,
    _resolve_turn,
    _restart_container,
    _rollback_headers,
)

client = TestClient(app)


def test_saves_never_overlap_and_the_last_one_has_the_newest_state():
    async def run_test():
        game_id = "overlapping_saves"
        GAMES[game_id] = build_scenario("standard_1901", Power.FRANCE, game_id)
        running = 0
        most_running = 0
        saved_targets = []
        first_save_started = asyncio.Event()
        finish_first_save = asyncio.Event()

        async def slow_save(game_id, state, summary=None, history=None, passcode=None):
            nonlocal running, most_running
            running += 1
            most_running = max(most_running, running)
            target = state.orders["FRA_A_PAR"].target
            first_save_started.set()
            await finish_first_save.wait()
            saved_targets.append(target)
            running -= 1
            return True

        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with (
            patch.dict(os.environ, env),
            patch("storage.supabase.save_game_to_db", side_effect=slow_save),
        ):
            first = asyncio.create_task(persist_game(game_id))
            await first_save_started.wait()
            # These return at once, as the running save picks them up. The timeout turns a
            # regression, where they would wait on that save, into a failure and not a hang.
            GAMES[game_id].orders["FRA_A_PAR"].target = "BUR"
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            GAMES[game_id].orders["FRA_A_PAR"].target = "PIC"
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            finish_first_save.set()
            await asyncio.wait_for(first, timeout=1)

        assert most_running == 1
        assert saved_targets == [None, "PIC"]
        assert game_id not in UNSAVED_GAMES
        assert game_id not in SAVES_RUNNING
        GAMES.pop(game_id, None)

    asyncio.run(run_test())


def test_an_order_click_leaves_the_saved_history_alone(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    assert len(supabase.rows[game_id]["history"]) == 1
    supabase.saved_history.clear()

    order = {**ARMY_PARIS_TO_BURGUNDY, "origin": "PAR"}
    assert client.post(f"/api/order?game_id={game_id}", json={"order": order}).status_code == 200

    assert supabase.saved_history == [False]
    assert len(supabase.rows[game_id]["history"]) == 1


def test_history_survives_a_restart_and_rollback_still_works(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    client.post(f"/api/order?game_id={game_id}", json={"order": {**ARMY_PARIS_TO_BURGUNDY}})

    _restart_container(game_id)
    client.get(f"/api/game?game_id={game_id}")

    res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_rollback_headers())
    assert res.status_code == 200
    assert res.json()["season"] == "Spring"
    assert supabase.rows[game_id]["history"] == []


def test_a_scenario_reset_saves_the_emptied_history(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)

    res = client.post(
        f"/api/scenario?game_id={game_id}",
        json={"scenario_id": "standard_1901"},
        headers=_rollback_headers(),
    )

    assert res.status_code == 200
    assert supabase.rows[game_id]["history"] == []


def test_a_history_save_that_fails_is_sent_again(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    supabase.writes_fail = True
    _resolve_turn(game_id)
    assert supabase.rows[game_id]["history"] == []
    supabase.writes_fail = False

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})

    assert len(supabase.rows[game_id]["history"]) == 1
    assert game_id not in HISTORY_UNSAVED


def test_a_turn_resolved_during_a_save_still_saves_its_history():
    async def run_test():
        game_id = "history_during_save"
        GAMES[game_id] = build_scenario("standard_1901", Power.FRANCE, game_id)
        GAME_HISTORY[game_id] = []
        HISTORY_UNSAVED.add(game_id)
        histories = []
        started = asyncio.Event()
        finish = asyncio.Event()

        async def slow_save(game_id, state, summary=None, history=None, passcode=None):
            histories.append(None if history is None else len(history))
            started.set()
            await finish.wait()
            return True

        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with (
            patch.dict(os.environ, env),
            patch("storage.supabase.save_game_to_db", side_effect=slow_save),
        ):
            first = asyncio.create_task(persist_game(game_id))
            await started.wait()
            GAME_HISTORY[game_id].append(GAMES[game_id].model_copy(deep=True))
            HISTORY_UNSAVED.add(game_id)
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            finish.set()
            await asyncio.wait_for(first, timeout=1)

        assert histories == [0, 1]
        assert game_id not in HISTORY_UNSAVED
        GAMES.pop(game_id, None)
        GAME_HISTORY.pop(game_id, None)

    asyncio.run(run_test())


def test_history_kept_inside_an_older_row_moves_to_its_column_on_the_next_save(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    _restart_container(game_id)

    client.get(f"/api/game?game_id={game_id}")
    assert game_id in HISTORY_UNSAVED
    supabase.saved_history.clear()

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})
    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "GERMANY"})

    assert supabase.saved_history == [True, False]
    assert game_id not in HISTORY_UNSAVED
