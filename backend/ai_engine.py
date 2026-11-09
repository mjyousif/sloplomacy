"""Backward-compatible facade for engine.ai."""

try:
    from backend.engine.ai import *  # noqa: F403
except ModuleNotFoundError:
    from engine.ai import *  # noqa: F403
