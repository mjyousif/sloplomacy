#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

echo "================================================="
echo "  Sloplomacy - Developer Environment Setup       "
echo "================================================="

# 1. Backend venv
echo -e "\n[1/2] Setting up Python backend..."
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    python3 -m venv "$BACKEND_DIR/.venv" || python -m venv "$BACKEND_DIR/.venv"
fi
PIP_CMD="$BACKEND_DIR/.venv/bin/pip"
if [ ! -f "$PIP_CMD" ]; then PIP_CMD="pip"; fi
"$PIP_CMD" install --upgrade pip
"$PIP_CMD" install -r "$BACKEND_DIR/requirements.txt"
echo "[✓] Backend environment ready!"

# 2. Frontend npm
echo -e "\n[2/2] Setting up Frontend dependencies..."
cd "$FRONTEND_DIR"
npm install
echo "[✓] Frontend environment ready!"

echo -e "\n================================================="
echo "  SETUP COMPLETE! Run ./start.sh to launch dev."
echo "================================================="
