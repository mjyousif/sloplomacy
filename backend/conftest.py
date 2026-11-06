import os
import pytest

TEST_JWT_SECRET = "test-secret-at-least-32-chars-long-12345"


@pytest.fixture(autouse=True)
def configure_test_environment(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
