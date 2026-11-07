#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

RUN_E2E=false
for arg in "$@"; do
    if [ "$arg" == "--e2e" ] || [ "$arg" == "-e2e" ]; then
        RUN_E2E=true
    fi
done

echo "================================================="
echo "  Sloplomacy - Full Test Suite & Quality Gates    "
echo "================================================="

# 1. Backend Pytest
echo -e "\n[1/2] Running Backend Tests (Pytest)..."
cd "$REPO_ROOT"
if [ -f "$BACKEND_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$BACKEND_DIR/.venv/bin/python"
elif [ -f "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_CMD="$BACKEND_DIR/.venv/Scripts/python.exe"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

$PYTHON_CMD -m pytest backend/ -v
echo "[✓] Backend tests passed!"

# 2. Frontend Vitest & Build
echo -e "\n[2/2] Running Frontend Tests & Typecheck..."
cd "$FRONTEND_DIR"
npm test
echo "Running TypeScript typecheck & Vite build..."
npm run build
echo "[✓] Frontend tests and build passed!"

# 3. Optional E2E Scenario Suite
if [ "$RUN_E2E" = true ]; then
    echo -e "\n[3/3] Running Interactive E2E Scenario Suite..."
    cd "$REPO_ROOT"
    $PYTHON_CMD scripts/e2e_runner.py run --all
    echo "[✓] Interactive E2E suite passed!"
fi

echo -e "\n================================================="
echo "  ALL TESTS & CHECKS PASSED!"
echo "================================================="
