"""Shared pytest fixtures."""

try:
    from backend.tests.conftest import *  # noqa: F403
except ModuleNotFoundError:
    from tests.conftest import *  # noqa: F403
