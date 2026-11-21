"""The lobby sync only evicts what it already knew of, and never a game with unsaved work."""

import contextlib
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from main import app
from storage.store import GAME_SUMMARIES, GAMES, PRESS_UNSAVED, check_game_capacity
from tests.integration.storage.helpers import _create_game

client = TestClient(app)

pytestmark = pytest.mark.usefixtures("forget_games_made_by_test")


def test_game_created_and_saved_during_the_read_is_not_evicted(supabase):
    first = _create_game()
    read_all = supabase.load_all
    new_id = "mp_made_during_read"

    async def new_game_saved_while_reading(client=None):
        rows_seen_by_read = await read_all()  # The read began before the new game existed.
        GAMES[new_id] = GAMES[first].model_copy(deep=True, update={"game_id": new_id})
        GAME_SUMMARIES[new_id] = GAME_SUMMARIES[first].model_copy(update={"game_id": new_id})
        return rows_seen_by_read  # ...and the save finished too, so it is no longer "unsaved".

    with patch(
        "storage.supabase.load_all_summaries_from_db", side_effect=new_game_saved_while_reading
    ):
        assert client.get("/api/games").status_code == 200

    assert new_id in GAMES
    assert new_id in GAME_SUMMARIES


def test_game_with_unsaved_press_is_not_evicted_by_the_lobby_sync(supabase):
    game_id = _create_game()
    del supabase.rows[game_id]  # Supabase holds no row, as for a game whose first save failed.
    PRESS_UNSAVED.add(game_id)
    try:
        client.get("/api/games")
        assert game_id in GAMES
        assert client.get(f"/api/games/{game_id}").status_code == 200
        assert game_id in GAMES
    finally:
        PRESS_UNSAVED.discard(game_id)

    client.get("/api/games")
    assert game_id not in GAMES  # Once nothing is unsaved a row-less game is a deleted one.


def test_capacity_sweep_keeps_a_finished_game_whose_press_is_unsaved(supabase):
    game_id = _create_game()
    GAME_SUMMARIES[game_id].status = "completed"
    PRESS_UNSAVED.add(game_id)
    try:
        with patch("storage.store.MAX_ACTIVE_GAMES", len(GAMES)):
            with contextlib.suppress(HTTPException):  # 429 once nothing else can be evicted
                check_game_capacity()
        assert game_id in GAMES
    finally:
        PRESS_UNSAVED.discard(game_id)


def test_unreadable_saved_summary_is_never_listed_and_never_evicts_a_loaded_game(supabase):
    loaded = _create_game()

    async def rows_with_unreadable_summaries(client=None):
        return {loaded: None, "mp_unreadable": None}

    with patch(
        "storage.supabase.load_all_summaries_from_db", side_effect=rows_with_unreadable_summaries
    ):
        listed = [g["game_id"] for g in client.get("/api/games").json()]

    assert "mp_unreadable" not in GAME_SUMMARIES
    assert "mp_unreadable" not in listed
    assert loaded in GAMES  # The row exists, so the game was not deleted; memory stays in charge.


def test_lobby_requests_arriving_together_share_one_table_read(supabase):
    import asyncio

    from api.games import sync_lobby_with_db

    _create_game()
    reads = 0
    read_all = supabase.load_all

    async def slow_counted_read(client=None):
        nonlocal reads
        reads += 1
        await asyncio.sleep(0.05)
        return await read_all()

    async def run():
        with patch("storage.supabase.load_all_summaries_from_db", side_effect=slow_counted_read):
            await asyncio.gather(*(sync_lobby_with_db() for _ in range(5)))
            assert reads == 1
            await sync_lobby_with_db()  # A later request reads again: nothing is served stale.
            assert reads == 2

    asyncio.run(run())
