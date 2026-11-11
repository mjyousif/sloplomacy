#!/usr/bin/env bash
set -euo pipefail

# Ensure ~/.local/bin is on PATH if present (e.g. for user-installed tools)
if [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

BACKEND_ONLY=false
FRONTEND_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --backend-only)
            BACKEND_ONLY=true
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            ;;
    esac
done

echo "================================================="
echo "  Sloplomacy - Code Quality & Linting Gates       "
echo "================================================="

# Locate Python
if [ -f "$BACKEND_DIR/.venv/bin/python" ]; then
    PYTHON_CMD="$BACKEND_DIR/.venv/bin/python"
elif [ -f "$BACKEND_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_CMD="$BACKEND_DIR/.venv/Scripts/python.exe"
elif command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
else
    PYTHON_CMD="python"
fi

# 1. Backend Linting (Ruff)
if [ "$FRONTEND_ONLY" = false ]; then
    echo -e "\n[1/3] Linting Python backend (Ruff)..."
    cd "$REPO_ROOT"
    if $PYTHON_CMD -m ruff --version &>/dev/null; then
        $PYTHON_CMD -m ruff check backend/
    elif command -v ruff &>/dev/null; then
        ruff check backend/
    else
        echo "[!] Ruff not found. Run pip install -r backend/requirements-dev.txt."
        exit 1
    fi
    echo "[✓] Backend lint checks passed!"
fi

# 2. Frontend Linting & Typecheck (Biome & tsc)
if [ "$BACKEND_ONLY" = false ]; then
    echo -e "\n[2/3] Linting & typechecking Frontend (Biome & tsc)..."
    cd "$FRONTEND_DIR"
    npm run lint
    npm run typecheck
    echo "[✓] Frontend lint and typecheck passed!"
fi

# 3. Modularity & File Size Audit
echo -e "\n[3/3] Checking codebase modularity and file-size ceilings..."
cd "$REPO_ROOT"
$PYTHON_CMD scripts/check_file_limits.py

echo -e "\n================================================="
echo "  ALL LINT CHECKS PASSED!"
echo "================================================="
