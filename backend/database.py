"""Backward-compatible facade for storage.supabase."""

try:
    from backend.storage.supabase import *  # noqa: F403
except ModuleNotFoundError:
    from storage.supabase import *  # noqa: F403
