"""Fixtures for the clock tests."""

import pytest
from fastapi.testclient import TestClient
from main import app
from tests.integration.api.turn_clock.helpers import TEST_JWT_SECRET


@pytest.fixture(autouse=True)
def jwt_secret(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)


@pytest.fixture
def client():
    return TestClient(app)
