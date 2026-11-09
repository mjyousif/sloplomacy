"""Fixtures for the admin tests."""

import pytest
from scenarios.presets import seed_initial_multiplayer_lobbies
from tests.integration.api.helpers import TEST_JWT_SECRET


@pytest.fixture(autouse=True)
def reset_server_state(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    seed_initial_multiplayer_lobbies()
