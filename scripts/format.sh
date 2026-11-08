#!/usr/bin/env bash
set -euo pipefail

if [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

CHECK_MODE=false
BACKEND_ONLY=false
FRONTEND_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --check)
            CHECK_MODE=true
            ;;
        --backend-only)
            BACKEND_ONLY=true
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            ;;
    esac
done

echo "================================================="
if [ "$CHECK_MODE" = true ]; then
    echo "  Sloplomacy - Code Formatting Verification       "
else
    echo "  Sloplomacy - Code Formatting Application        "
fi
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

# 1. Backend Formatting (Ruff)
if [ "$FRONTEND_ONLY" = false ]; then
    echo -e "\n[1/2] Processing Python backend (Ruff)..."
    cd "$REPO_ROOT"
    RUFF_CMD="$PYTHON_CMD -m ruff"
    if ! $PYTHON_CMD -m ruff --version &>/dev/null && command -v ruff &>/dev/null; then
        RUFF_CMD="ruff"
    fi

    if [ "$CHECK_MODE" = true ]; then
        $RUFF_CMD format --check backend/
    else
        $RUFF_CMD format backend/
    fi
    echo "[✓] Backend formatting complete!"
fi

# 2. Frontend Formatting (Biome)
if [ "$BACKEND_ONLY" = false ]; then
    echo -e "\n[2/2] Processing Frontend (Biome)..."
    cd "$FRONTEND_DIR"
    if [ "$CHECK_MODE" = true ]; then
        npm run format:check
    else
        npm run format
    fi
    echo "[✓] Frontend formatting complete!"
fi

echo -e "\n================================================="
echo "  FORMATTING COMPLETED SUCCESSFULLY!"
echo "================================================="
