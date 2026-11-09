"""Backward-compatible facade for security.auth."""

try:
    from backend.security.auth import *  # noqa: F403
except ModuleNotFoundError:
    from security.auth import *  # noqa: F403
