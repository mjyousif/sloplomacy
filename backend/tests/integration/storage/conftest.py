"""Shared test fixtures for persistence integration tests (restarts, saves, press)."""

import os
from unittest.mock import patch

import pytest
from storage.phases import (
    GAME_HISTORY_LOADED,
    GAME_PHASE_COUNTS,
    PENDING_PHASE_TRUNCATE_FROM,
    PENDING_PHASE_UPSERTS,
    STATS_CACHE,
)
from storage.press import _PERSISTED_PRESS_SEQ, _PERSISTED_THREAD_IDS
from storage.store import (
    _LAST_PARTICIPANTS_SIG,
    GAME_SUMMARIES,
    GAMES,
    HISTORY_UNSAVED,
    PRESS_UNSAVED,
    UNSAVED_GAMES,
    evict_game,
)
from storage.supabase import GAME_DB_IDS
from tests.integration.storage.helpers import FakeSupabase


@pytest.fixture(autouse=True)
def restore_seeded_lobbies():
    """Keep tests independent even if a test triggers lobby pruning of a seeded game."""
    games_before = dict(GAMES)
    summaries_before = dict(GAME_SUMMARIES)
    yield
    for gid in set(GAMES) - set(games_before):
        evict_game(gid)
    GAMES.clear()
    GAMES.update(games_before)
    GAME_SUMMARIES.clear()
    GAME_SUMMARIES.update(summaries_before)


@pytest.fixture
def supabase():
    db = FakeSupabase()
    env = {"SUPABASE_URL": "https://proj.supabase.co", "SUPABASE_KEY": "test_key"}
    with (
        patch.dict(os.environ, env),
        patch("storage.supabase.save_game_to_db", side_effect=db.save),
        patch("storage.supabase.load_game_from_db", side_effect=db.load),
        patch("storage.supabase.load_all_summaries_from_db", side_effect=db.load_all),
        patch("storage.supabase.delete_game_from_db", side_effect=db.delete),
        patch("storage.supabase.resolve_game_db_id", side_effect=db.resolve_db_id),
        patch("storage.phases.load_phase_entries_from_db", side_effect=db.load_phase_entries),
        patch("storage.phases.load_phase_from_db", side_effect=db.load_phase),
        patch("storage.phases.load_all_phases_from_db", side_effect=db.load_all_phases),
        patch("storage.phases.upsert_phases_to_db", side_effect=db.upsert_phases),
        patch("storage.phases.delete_phases_from_db", side_effect=db.delete_phases),
        patch("storage.press.load_press_from_db", side_effect=db.load_press),
        patch("storage.press.save_press_to_db", side_effect=db.save_press),
    ):
        yield db
    UNSAVED_GAMES.clear()
    HISTORY_UNSAVED.clear()
    PRESS_UNSAVED.clear()
    GAME_DB_IDS.clear()
    GAME_PHASE_COUNTS.clear()
    GAME_HISTORY_LOADED.clear()
    PENDING_PHASE_UPSERTS.clear()
    PENDING_PHASE_TRUNCATE_FROM.clear()
    STATS_CACHE.clear()
    _LAST_PARTICIPANTS_SIG.clear()
    _PERSISTED_PRESS_SEQ.clear()
    _PERSISTED_THREAD_IDS.clear()
