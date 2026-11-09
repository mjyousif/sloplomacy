"""Backward-compatible facade for security.auth."""

import sys

from security import auth as _real_module

sys.modules[__name__] = _real_module
