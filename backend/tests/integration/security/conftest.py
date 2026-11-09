"""Fixtures for the security tests."""

import pytest
from scenarios.presets import seed_initial_multiplayer_lobbies


@pytest.fixture(autouse=True)
def reset_server():
    seed_initial_multiplayer_lobbies()
