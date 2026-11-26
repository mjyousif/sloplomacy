"""Structural and schema-contract guardrails for the backend."""

import re
from enum import Enum
from pathlib import Path

import pytest
from domain.board import Power, ProvinceType, UnitType
from domain.game_state import TimerStage
from domain.issues import IssueCode, IssueSeverity
from domain.orders import OrderType

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
FRONTEND_TYPES_PATH = REPO_ROOT / "frontend" / "src" / "types" / "diplomacy.ts"

CEILING_LINES = 500
CEILING_ALLOWLIST = {"engine/topology/provinces.py"}


def test_production_modules_respect_500_line_ceiling():
    """Every production Python module in backend/ (except static province data) stays <= 500 lines."""
    offenders: list[str] = []
    for py_file in sorted(BACKEND_DIR.rglob("*.py")):
        if "tests" in py_file.parts or ".venv" in py_file.parts:
            continue
        rel = py_file.relative_to(BACKEND_DIR).as_posix()
        if rel in CEILING_ALLOWLIST:
            continue
        line_count = len(py_file.read_text(encoding="utf-8").splitlines())
        if line_count > CEILING_LINES:
            offenders.append(f"{rel}: {line_count} lines (ceiling {CEILING_LINES})")

    assert not offenders, (
        "Production modules exceeded the 500-line modularity ceiling:\n" + "\n".join(offenders)
    )


def _extract_ts_union_literals(ts_source: str, type_name: str) -> set[str]:
    pattern = rf"export\s+type\s+{re.escape(type_name)}\s*=\s*(.*?);"
    match = re.search(pattern, ts_source, flags=re.DOTALL)
    assert match is not None, f"Could not find `export type {type_name}` in {FRONTEND_TYPES_PATH}"
    return set(re.findall(r"'([^']+)'", match.group(1)))


@pytest.mark.parametrize(
    "py_enum, ts_name",
    [
        (Power, "Power"),
        (UnitType, "UnitType"),
        (ProvinceType, "ProvinceType"),
        (OrderType, "OrderType"),
        (IssueSeverity, "IssueSeverity"),
        (IssueCode, "IssueCode"),
        (TimerStage, "TimerStage"),
    ],
)
def test_backend_frontend_enum_contracts(py_enum: type[Enum], ts_name: str):
    """Backend enum values must match `frontend/src/types/diplomacy.ts` union types exactly."""
    ts_source = FRONTEND_TYPES_PATH.read_text(encoding="utf-8")
    ts_values = _extract_ts_union_literals(ts_source, ts_name)
    py_values = {member.value for member in py_enum}
    assert py_values == ts_values, (
        f"Contract mismatch for {ts_name}: "
        f"backend-only={sorted(py_values - ts_values)}, "
        f"frontend-only={sorted(ts_values - py_values)}"
    )
