"""Backward-compatible facade for domain.models."""

try:
    from backend.domain.models import *  # noqa: F403
except ModuleNotFoundError:
    from domain.models import *  # noqa: F403
