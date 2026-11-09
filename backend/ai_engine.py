"""Backward-compatible facade for engine.ai."""

import sys

from engine import ai as _real_module

sys.modules[__name__] = _real_module
