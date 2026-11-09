"""Backward-compatible facade for engine.phase_timer."""

try:
    from backend.engine.phase_timer import *  # noqa: F403
except ModuleNotFoundError:
    from engine.phase_timer import *  # noqa: F403
