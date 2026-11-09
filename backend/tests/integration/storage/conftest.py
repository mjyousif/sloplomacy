"""Fixtures for the persistence tests: the fake Supabase, and the seeded lobbies put back after each test."""

import os
from unittest.mock import patch

import pytest
from storage.store import (
    HISTORY_UNSAVED,
    UNSAVED_GAMES,
)
from tests.integration.storage.helpers import FakeSupabase


@pytest.fixture(autouse=True)
def restore_seeded_lobbies():
    from scenarios.presets import seed_initial_multiplayer_lobbies

    yield
    seed_initial_multiplayer_lobbies()


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
    ):
        yield db
    UNSAVED_GAMES.clear()
    HISTORY_UNSAVED.clear()
