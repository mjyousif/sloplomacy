import pytest
from security.passcode import reset_passcode_tries

TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


@pytest.fixture(autouse=True)
def forget_wrong_passcodes():
    """Wrong passcodes are counted per client, and every test client shares one address."""
    reset_passcode_tries()
    yield
    reset_passcode_tries()


@pytest.fixture
def forget_games_made_by_test():
    """Evict the games a test creates, so tests that make many do not fill the server's capacity."""
    from storage.store import GAMES, evict_game

    before = set(GAMES)
    yield
    for game_id in set(GAMES) - before:
        evict_game(game_id)
