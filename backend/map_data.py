"""Backward-compatible facade for engine.topology."""

import sys

from engine import topology as _real_module

sys.modules[__name__] = _real_module
