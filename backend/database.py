"""Backward-compatible facade for storage.supabase."""

import sys

from storage import supabase as _real_module

sys.modules[__name__] = _real_module
