"""Backward-compatible facade for engine.validator."""

import sys

from engine import validator as _real_module

sys.modules[__name__] = _real_module
