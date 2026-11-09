"""Backward-compatible facade for engine.topology."""

try:
    from backend.engine.topology import *  # noqa: F403
except ModuleNotFoundError:
    from engine.topology import *  # noqa: F403
