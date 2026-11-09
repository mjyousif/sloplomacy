"""Fixtures shared by the API tests."""

import pytest


@pytest.fixture(autouse=True)
def setup_jwt_secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-at-least-32-chars-long-12345")
