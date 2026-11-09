"""Backward-compatible facade for engine.adjudicator."""

try:
    from backend.engine.adjudicator import *  # noqa: F403
except ModuleNotFoundError:
    from engine.adjudicator import *  # noqa: F403
