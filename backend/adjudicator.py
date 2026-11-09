"""Backward-compatible facade for engine.adjudicator."""

import sys

from engine import adjudicator as _real_module

sys.modules[__name__] = _real_module
