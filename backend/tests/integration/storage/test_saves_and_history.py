"""Saving: saves never overlap, and turn history is incrementally persisted in game_phases (#222, #342)."""

import asyncio
import os
from unittest.mock import patch

from domain.board import Power
from fastapi.testclient import TestClient
from main import app
from scenarios.presets import build_scenario
from storage.phases import (
    GAME_HISTORY_LOADED,
    append_resolved_phase,
    clear_phase_tracking,
)
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

        async def slow_save(
            game_id,
            state,
            summary=None,
            history=None,
            passcode=None,
            current_phase_index=None,
            sync_participants=True,
        ):
            nonlocal running, most_running
            del summary, history, passcode, current_phase_index, sync_participants
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
        clear_phase_tracking(game_id)

    asyncio.run(run_test())


def test_an_order_click_leaves_the_saved_phases_alone(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    assert list(supabase.phases[game_id]) == [0]
    supabase.saved_phase_batches.clear()

    order = {**ARMY_PARIS_TO_BURGUNDY, "origin": "PAR"}
    assert client.post(f"/api/order?game_id={game_id}", json={"order": order}).status_code == 200

    assert supabase.saved_phase_batches == []
    assert list(supabase.phases[game_id]) == [0]


def test_history_survives_a_restart_and_rollback_deletes_future_phases(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    client.post(f"/api/order?game_id={game_id}", json={"order": {**ARMY_PARIS_TO_BURGUNDY}})

    _restart_container(game_id)
    # Cold start loads the live board without downloading all phases up front.
    assert client.get(f"/api/game?game_id={game_id}").status_code == 200
    assert game_id not in GAME_HISTORY_LOADED

    # Rollback deletes phases >= target index and resets current_phase_index.
    res = client.post(f"/api/admin/rollback?game_id={game_id}", headers=_rollback_headers())
    assert res.status_code == 200
    assert res.json()["season"] == "Spring"
    assert supabase.phases[game_id] == {}
    assert supabase.rows[game_id]["current_phase_index"] == 0


def test_40_turn_campaign_survives_cold_start_and_appends_at_phase_index_40(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    for _ in range(40):
        _resolve_turn(game_id)

    assert len(supabase.phases[game_id]) == 40
    assert supabase.rows[game_id]["current_phase_index"] == 40

    _restart_container(game_id)
    res = client.get(f"/api/game?game_id={game_id}")
    assert res.status_code == 200
    # Cold start keeps history lazy while preserving total phase count.
    assert game_id not in GAME_HISTORY_LOADED

    supabase.saved_phase_batches.clear()
    _resolve_turn(game_id)
    assert supabase.saved_phase_batches == [[40]]
    assert sorted(supabase.phases[game_id]) == list(range(41))
    assert supabase.rows[game_id]["current_phase_index"] == 41

    entries = client.get(f"/api/history?game_id={game_id}").json()
    assert len(entries) == 41
    assert entries[0]["index"] == 0
    assert entries[40]["index"] == 40

    # First admin edit appends an "Admin" phase at index 41 (> old 30-phase cap);
    # a second consecutive admin edit consolidates into index 41 in place.
    g_state = GAMES[game_id]
    edit_payload = {
        "expected_revision": g_state.board_revision,
        "expected_season": g_state.season,
        "expected_year": g_state.year,
        "expected_phase": g_state.phase,
        "units": [u.model_dump(mode="json") for u in g_state.units],
        "ownership": {k: v.value for k, v in g_state.ownership.items()},
    }
    edit_res = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        headers=_rollback_headers(),
        json=edit_payload,
    )
    assert edit_res.status_code == 200
    assert sorted(supabase.phases[game_id]) == list(range(42))

    edit_res2 = client.post(
        f"/api/admin/board-edit?game_id={game_id}",
        headers=_rollback_headers(),
        json={**edit_payload, "expected_revision": GAMES[game_id].board_revision},
    )
    assert edit_res2.status_code == 200
    assert sorted(supabase.phases[game_id]) == list(range(42))


def test_a_scenario_reset_saves_the_emptied_phases(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)

    res = client.post(
        f"/api/scenario?game_id={game_id}",
        json={"scenario_id": "standard_1901"},
        headers=_rollback_headers(),
    )

    assert res.status_code == 200
    assert supabase.phases[game_id] == {}


def test_a_phase_save_that_fails_is_sent_again(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    supabase.writes_fail = True
    _resolve_turn(game_id)
    assert supabase.phases.get(game_id, {}) == {}
    assert game_id in HISTORY_UNSAVED
    supabase.writes_fail = False

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})

    assert list(supabase.phases[game_id]) == [0]
    assert game_id not in HISTORY_UNSAVED


def test_a_turn_resolved_during_a_save_still_saves_its_phase():
    async def run_test():
        game_id = "history_during_save"
        GAMES[game_id] = build_scenario("standard_1901", Power.FRANCE, game_id)
        clear_phase_tracking(game_id)
        GAME_HISTORY[game_id] = []
        GAME_HISTORY_LOADED.add(game_id)
        HISTORY_UNSAVED.add(game_id)
        phase_counts = []
        upserted_batches = []
        started = asyncio.Event()
        finish = asyncio.Event()

        async def slow_save(
            game_id,
            state,
            summary=None,
            history=None,
            passcode=None,
            current_phase_index=None,
            sync_participants=True,
        ):
            del state, summary, history, passcode, sync_participants
            phase_counts.append(current_phase_index)
            started.set()
            await finish.wait()
            return True

        async def record_upsert(gid, batch, client=None):
            del gid, client
            upserted_batches.append(sorted(batch))
            return True

        env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
        with (
            patch.dict(os.environ, env),
            patch("storage.supabase.save_game_to_db", side_effect=slow_save),
            patch("storage.phases.upsert_phases_to_db", side_effect=record_upsert),
        ):
            first = asyncio.create_task(persist_game(game_id))
            await started.wait()
            append_resolved_phase(game_id, GAMES[game_id].model_copy(deep=True))
            await asyncio.wait_for(persist_game(game_id), timeout=1)
            finish.set()
            await asyncio.wait_for(first, timeout=1)

        assert phase_counts == [0, 1]
        assert upserted_batches == [[0]]
        assert game_id not in HISTORY_UNSAVED
        GAMES.pop(game_id, None)
        clear_phase_tracking(game_id)

    asyncio.run(run_test())


def test_history_kept_inside_an_older_row_migrates_to_game_phases_on_next_save(supabase):
    game_id = _create_game()
    _join(game_id, "GERMANY", BOB)
    _resolve_turn(game_id)
    # Simulate an un-migrated legacy row whose single resolved phase lived inside legacy_history.
    supabase.rows[game_id]["legacy_history"] = [
        supabase.phases[game_id][0]["snapshot"],
    ]
    supabase.phases.pop(game_id, None)
    supabase.rows[game_id]["current_phase_index"] = 0
    _restart_container(game_id)

    client.get(f"/api/game?game_id={game_id}")
    assert game_id in HISTORY_UNSAVED
    supabase.saved_phase_batches.clear()

    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "FRANCE"})
    client.post(f"/api/unfinalize?game_id={game_id}", json={"power": "GERMANY"})

    assert supabase.saved_phase_batches == [[0]]
    assert list(supabase.phases[game_id]) == [0]
    assert game_id not in HISTORY_UNSAVED
