"""Backward-compatible facade for engine.validator."""

try:
    from backend.engine.validator import *  # noqa: F403
except ModuleNotFoundError:
    from engine.validator import *  # noqa: F403
