"""Backward-compatible facade for domain.models."""

import sys

from domain import models as _real_module

sys.modules[__name__] = _real_module
