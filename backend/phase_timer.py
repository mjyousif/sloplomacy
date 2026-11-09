"""Backward-compatible facade for engine.phase_timer."""

import sys

from engine import phase_timer as _real_module

sys.modules[__name__] = _real_module
