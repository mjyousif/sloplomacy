#!/usr/bin/env bash
# Regenerates backend/requirements-runtime.lock, the hash-pinned list the Docker image installs.
#
#   ./scripts/lock-requirements.sh                      # re-resolve within the ranges, keep pins
#   ./scripts/lock-requirements.sh --upgrade            # pick the newest allowed versions
#   ./scripts/lock-requirements.sh --upgrade-package X  # move one package
#
# Run it on Python 3.11, the image's version: a lock made on another interpreter can drop the
# dependencies that only 3.11 pulls in. Set ALLOW_OTHER_PYTHON=1 to override that.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
cd "$REPO_ROOT/backend"

PYTHON="${PYTHON:-python3.11}"
if ! command -v "$PYTHON" >/dev/null 2>&1; then
    PYTHON="python3"
fi
VERSION="$("$PYTHON" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [ "$VERSION" != "3.11" ] && [ "${ALLOW_OTHER_PYTHON:-0}" != "1" ]; then
    echo "[!] $PYTHON is Python $VERSION; the image runs 3.11. Install 3.11 or set PYTHON=/path/to/python3.11" >&2
    echo "    (ALLOW_OTHER_PYTHON=1 skips this check, and the result must be checked by hand)." >&2
    exit 1
fi

if ! "$PYTHON" -m piptools --version >/dev/null 2>&1; then
    echo "[!] pip-tools is not installed for $PYTHON. Run: $PYTHON -m pip install pip-tools" >&2
    exit 1
fi

# --strip-extras folds uvicorn[standard] into plain pins, and --allow-unsafe pins setuptools-like
# packages too, so --require-hashes in the Dockerfile sees every dependency.
"$PYTHON" -m piptools compile --generate-hashes --strip-extras --allow-unsafe \
    --output-file=requirements-runtime.lock "$@" requirements-runtime.txt
echo "Wrote backend/requirements-runtime.lock. Commit it with the change to requirements-runtime.txt."
