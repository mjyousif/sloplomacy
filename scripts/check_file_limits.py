#!/usr/bin/env python3
"""
check_file_limits.py

Enforces codebase modularity file-size thresholds and ratchets.
Rules:
1. Target size: 150 - 350 lines for source files (up to 500 for test suites).
2. Hard ceiling: 500 lines for new/refactored source files, 750 lines for test files.
3. Declarative data files are allowlisted exceptions (e.g. static geometry / topology).
4. Legacy files exceeding their ceiling are capped at a baseline ceiling. They cannot
   grow monolithically without modular decomposition (ratchet rule).
5. Files crossing their target size produce a non-blocking warning (or fail under --strict).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple

# Hard ceilings and target warning thresholds
CEILING_LINES = 500
WARN_LINES = 350
TEST_CEILING_LINES = 750
TEST_WARN_LINES = 500

# Allowlisted pure declarative static data files
ALLOWLIST_FILES: Set[str] = {
    "frontend/src/data/europeMapGeometry.ts",
    "backend/engine/topology/provinces.py",
}

# Baseline limits for known legacy files already exceeding their ceiling.
# These limits are ratcheted down as files get decomposed.
# Growth beyond the baseline + tolerance triggers a failure.
LEGACY_BASELINES: Dict[str, int] = {
    "frontend/src/App.tsx": 986,
    "frontend/src/components/MacroSidebar.tsx": 887,
    "frontend/src/components/ToolsSidebar.tsx": 738,
    "frontend/src/components/MapPiece.tsx": 665,
    "frontend/src/components/AdminToolsModal.tsx": 631,
    "frontend/src/components/LobbyView.tsx": 581,
}

# Permitted growth tolerance over baseline for minor urgent fixes (lines)
GROWTH_TOLERANCE = 10

CODE_EXTENSIONS = (".py", ".ts", ".tsx")
EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    "artifacts",
    "coverage",
}


def count_file_lines(file_path: Path) -> int:
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return sum(1 for _ in f)
    except Exception:
        return 0


def get_git_repo_root() -> Path:
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        return Path(out)
    except Exception:
        return Path.cwd()


def is_test_file(rel_path: str) -> bool:
    name = Path(rel_path).name
    return (
        name.startswith("test_")
        or ".test." in name
        or ".spec." in name
        or rel_path.startswith("backend/tests/")
        or rel_path.startswith("frontend/e2e/")
    )


def scan_repository(
    repo_root: Path,
) -> Tuple[List[Tuple[str, int, int]], List[Tuple[str, int, int]], List[Tuple[str, int]]]:
    """
    Scans the repository and returns:
    - errors: list of (rel_path, actual_lines, limit)
    - warnings: list of (rel_path, actual_lines, target)
    - ratchet_candidates: list of (rel_path, actual_lines) where a legacy file shrank!
    """
    errors: List[Tuple[str, int, int]] = []
    warnings: List[Tuple[str, int, int]] = []
    ratchet_candidates: List[Tuple[str, int]] = []

    for root, dirs, files in os.walk(repo_root):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if not f.endswith(CODE_EXTENSIONS):
                continue

            full_path = Path(root) / f
            rel_path = full_path.relative_to(repo_root).as_posix()

            # Skip allowlisted static tables
            if rel_path in ALLOWLIST_FILES:
                continue

            lines = count_file_lines(full_path)

            # Check legacy baseline files
            if rel_path in LEGACY_BASELINES:
                baseline = LEGACY_BASELINES[rel_path]
                allowed_max = baseline + GROWTH_TOLERANCE
                if lines > allowed_max:
                    errors.append((rel_path, lines, allowed_max))
                elif lines < baseline - 25:
                    # File shrank significantly: suggest ratcheting baseline down!
                    ratchet_candidates.append((rel_path, lines))
            else:
                ceiling = TEST_CEILING_LINES if is_test_file(rel_path) else CEILING_LINES
                target = TEST_WARN_LINES if is_test_file(rel_path) else WARN_LINES
                if lines > ceiling:
                    errors.append((rel_path, lines, ceiling))
                elif lines > target:
                    warnings.append((rel_path, lines, target))

    return errors, warnings, ratchet_candidates


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify codebase modularity and enforce file-size limits / ratchets."
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Treat warnings as errors (useful for strict CI pipelines).",
    )
    args = parser.parse_args()

    repo_root = get_git_repo_root()
    errors, warnings, ratchet_candidates = scan_repository(repo_root)

    print("=================================================")
    print("  Sloplomacy - Modularity & File Size Audit      ")
    print("=================================================")

    if ratchet_candidates:
        print("\n[i] Good news! Legacy files have been decomposed below their baselines:")
        for path, lines in sorted(ratchet_candidates):
            baseline = LEGACY_BASELINES[path]
            print(f"    - {path}: now {lines} lines (baseline was {baseline}). Ratchet down!")

    if warnings:
        print(f"\n[!] Notice: {len(warnings)} file(s) exceed their target size:")
        for path, lines, target in sorted(warnings, key=lambda x: x[1], reverse=True)[:10]:
            print(f"    - {path} ({lines} lines > {target} target)")
        if len(warnings) > 10:
            print(f"    ... and {len(warnings) - 10} more.")
        if args.strict:
            errors.extend(warnings)

    if errors:
        print(f"\n[x] Modularity Violation: {len(errors)} file(s) exceeded the size ceiling:")
        for path, lines, limit in sorted(errors, key=lambda x: x[1], reverse=True):
            print(f"    - {path}: {lines} lines (ceiling: {limit} lines)")
        print("\nPlease decompose touched modules or extract subcomponents/hooks.")
        print("Refer to .agents/skills/codebase-modularity/SKILL.md for guidelines.\n")
        return 1

    print("\n[✓] All files are within modularity thresholds and legacy baselines!\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
