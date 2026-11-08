# Local Development & Testing Guide

This guide covers developer workflows, running the local development environment, testing, and debugging the Diplomacy 1901 Tactical Engine & Atlas.

---

## Prerequisites

- **Python**: Version 3.10 or newer (with `pip` and `venv`).
- **Node.js**: Version 18.0 or newer (with `npm`).
- **Git** (optional).

---

## Quickstart (Single Command)

Launch both the FastAPI backend (`:8000`) and the Vite React frontend (`:5173`) with a single command:

### Windows (PowerShell)
```powershell
.\start.ps1
```
> To run each server in its own separate terminal window:
> ```powershell
> .\start.ps1 -SeparateWindows
> ```

### macOS / Linux / WSL / Git Bash
```bash
./start.sh
```

### Cross-Platform Python Runner
```bash
python quickstart.py
```

### CLI Flags for `quickstart.py`
- `python quickstart.py --no-open`: Run servers without launching the web browser.
- `python quickstart.py --backend-only`: Start only the FastAPI backend on port `8000`.
- `python quickstart.py --frontend-only`: Start only the Vite dev server on port `5173`.
- `python quickstart.py --setup-only`: Install Python venv and npm packages without launching servers.
- `python quickstart.py --test`: Run the complete backend test suite and verify frontend build.

### Local Demo Sign-In
When Supabase is not configured, the sign-in form creates a local demo account. It is stored in the browser, and the frontend sends it to the backend as an unsigned `alg: none` token.

`backend/auth.py` rejects those tokens unless `ENVIRONMENT` is `development` or `test`, or `ALLOW_INSECURE_DEV_AUTH=true`. Every launcher above sets `ENVIRONMENT=development` for the backend it starts, so a demo sign-in works out of the box:

- `quickstart.py` sets it in `backend_env()`. `start.sh`, `start.bat`, `scripts/dev.sh` and the default path of `start.ps1` and `scripts/dev.ps1` all run `quickstart.py`.
- `scripts/dev.ps1` sets it in the backend window for `-SeparateWindows`, which starts Uvicorn directly.

A value already in your shell wins. To try the production behaviour locally, run `ENVIRONMENT=production python quickstart.py`, and a demo sign-in gets a `401`.

> [!WARNING]
> With this flag the backend trusts unsigned tokens, and it also reads other tokens without checking their signature if it has no Supabase keys, so anyone who can reach it can act as any player. It belongs on a local machine only. Never set `ENVIRONMENT=development`, `ENVIRONMENT=test` or `ALLOW_INSECURE_DEV_AUTH=true` in `scripts/deploy.*`, `terraform/`, the `Dockerfile` or CI. The deployed container runs Uvicorn directly, so it never gets the flag from these launchers.

---

## Individual Service Workflows

### 1. Backend Service (`backend/`)
```bash
cd backend

# Create virtual environment (first time)
python -m venv .venv

# Activate virtual environment
# Windows:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

# Install requirements (runtime packages plus pytest; the Docker image installs requirements-runtime.txt only)
pip install -r requirements.txt

# Run dev server with auto-reload
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Starting Uvicorn by hand skips the launchers, so to use a [local demo sign-in](#local-demo-sign-in) set the flag yourself first:
```bash
export ENVIRONMENT=development      # macOS/Linux
```
```powershell
$env:ENVIRONMENT = "development"    # Windows PowerShell
```

### 2. Frontend Application (`frontend/`)
```bash
cd frontend

# Install npm dependencies (first time)
npm install

# Start Vite dev server with Hot Module Replacement (HMR)
npm run dev

# Run TypeScript typecheck and production build
npm run build
```

### 3. Configuring Supabase Auth (Optional)
To test cloud authentication locally rather than default local dev mode:
1. Create `frontend/.env` (modeled after `frontend/.env.example`):
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
   ```
2. Restart the frontend dev server. The app will detect the credentials and switch to cloud Supabase authentication.

---

## Running the Automated Test Suite

### Unified Test Runner (Single Command)
Run all backend pytest suites, frontend Vitest unit tests, TypeScript typechecks, and production bundle verification in one shot:
```powershell
# Windows
.\scripts\test.ps1
```
```bash
# Linux / macOS
./scripts/test.sh
```

### Running Backend Tests (`pytest`)
The backend includes 11 test suites covering the entire engine:
- `test_engine.py`: Graph symmetry and connectivity.
- `test_adjudicator.py`: Official DATC combat scenarios and retreat path mechanics.
- `test_admin.py`: Administrator privileges and board mutation operations.
- `test_ai_and_private_lobbies.py`: Tactical AI orders and passcode-protected lobbies.
- `test_api_integration.py`: FastAPI endpoints, multi-game room query parameters, and private multiplayer sandboxes.
- `test_database_persistence.py`: Supabase saving, restarts, outages, and what the lobby keeps from memory.
- `test_phase_timer.py`: Turn clock votes, pauses, extensions, deadlines and late requests.
- `test_security.py`: JWT cryptographic validation, seat authorization, Fog of War secrecy, and IDOR protection.
- `test_surrender_leave.py`: Concessions, civil disorder, and room departures.
- `test_validator.py`: Pre-flight blunder diagnostics across Movement, Retreats, and Adjustments.
- `test_websocket_sync.py`: Live game and lobby broadcasts.

WebSocket tests read messages with `receive_json(ws)` from `backend/ws_testing.py` rather than `ws.receive_json()`. Starlette's test client waits forever for a message, so a broadcast the server never sends would hang the run; the helper fails the test after 5 seconds instead. In CI every job also has a `timeout-minutes` limit.

Run all tests from the repository root:
```bash
python -m pytest backend/ -v
```

### Running Frontend Tests (`Vitest`)
Run frontend unit tests verifying order reachability and admin utilities:
```bash
cd frontend
npm test
```

### Running Frontend Typechecks & Build Verification
Ensure zero type regressions or API model drifts exist:
```bash
cd frontend
npx tsc --noEmit
npm run build
```

---

## LLM-Driven E2E Interactive Testing

Sloplomacy includes an interactive end-to-end (E2E) testing framework designed for AI coding agents and human developers. Unlike rigid visual regression tests that break when styling changes, this framework executes realistic user journeys, captures viewport screenshots at each step, logs runtime console/page telemetry, and allows visual and semantic inspection.

### Browser Prerequisites
By default, `frontend/playwright.config.ts` uses system Google Chrome (`channel: 'chrome'`). If Google Chrome is not installed on your machine, you can override the browser channel with `PLAYWRIGHT_CHANNEL=none` (or `PLAYWRIGHT_CHANNEL=chromium`) after installing Playwright's Chromium binary (`npx playwright install chromium` in `frontend/`).

### Running Interactive Scenarios
Use the cross-platform runner (`scripts/e2e_runner.py`), which auto-detects and launches the backend (with `ENVIRONMENT=development`) and frontend dev servers if not already running:

```bash
# List all available scenarios:
python scripts/e2e_runner.py list

# Run a specific scenario:
python scripts/e2e_runner.py run movement
python scripts/e2e_runner.py run sandbox
python scripts/e2e_runner.py run blunder
python scripts/e2e_runner.py run retreats
python scripts/e2e_runner.py run builds
python scripts/e2e_runner.py run mobile

# Watch the browser interactively (headed mode):
python scripts/e2e_runner.py run movement --headed

# Run the complete E2E scenario suite:
python scripts/e2e_runner.py run --all
```

### Scenario Catalog & Artifacts
| Scenario | Focus Area | Step Screenshots Saved In |
| :--- | :--- | :--- |
| `movement` | Map reticle moves, Support vectors, Hold toggles, turn advance, Admin rollback | `artifacts/e2e/movement_and_orders/` |
| `sandbox` | Lobby launch, Hypothetical Mode foreign pre-move isolation | `artifacts/e2e/sandbox_isolation/` |
| `blunder` | Self-bounce detection, Sanity Check modal, override flow | `artifacts/e2e/blunder_sanity_modal/` |
| `retreats` | Dislodged unit ring, valid retreat selection, Fall advance | `artifacts/e2e/retreats_dislodgement/` |
| `builds` | Winter adjustments, Army/Fleet builds, bicoastal STP/NC Fleet build, deficit disband | `artifacts/e2e/winter_builds/` |
| `mobile` | Phone layout (390x844), CompactTopBar, issue badge modal, 3-dots menu | `artifacts/e2e/mobile_compact_hud/` |

Each scenario exports a `summary.json` containing the execution status (`PASSED`/`FAILED`), step-by-step screenshot paths, and any browser console or uncaught page runtime errors.

---

## Repository Governance & Branch Protection (`main`)

The `main` branch is protected with automated quality gates and configuration-as-code managed via [`.github/settings.yml`](../../.github/settings.yml):

- **Pull Request Required**: Direct pushes to `main` are blocked; all changes must arrive via a pull request.
- **Mandatory PR Approvals**: Requires at least 1 approving code review before merging (`required_approving_review_count: 1`).
- **Dismiss Stale Approvals**: New commits pushed to an open pull request automatically invalidate previous approvals.
- **Required Status Checks**: Continuous integration checks must pass prior to merge:
  - `Backend Tests (Pytest)`
  - `Frontend Tests & Build Check`
- **Squash and Merge Enforced**: All PRs are squash-merged into clean, single-commit summaries using the PR title and description body. Merge commits and rebase merges are disabled.
- **Automatic Branch Cleanup**: Head branches are automatically deleted upon PR merge (`delete_branch_on_merge: true`).

---

## Troubleshooting & FAQ

### Port 8000 or 5173 Already in Use
- Terminate dangling Python or Node processes:
  ```powershell
  # Windows PowerShell
  Get-Process -Name python, node -ErrorAction SilentlyContinue | Stop-Process
  ```
  ```bash
  # Linux/macOS
  killall python uvicorn node
  ```

### Backend Virtual Environment Not Found
- Run `python quickstart.py --setup-only` to automatically regenerate `.venv` and install all required packages.

### "Backend Connection Required" / "Backend returned 401" After a Demo Sign-In
- The backend is rejecting the unsigned demo token. See [Local Demo Sign-In](#local-demo-sign-in).
- Start the app with one of the launchers, or set `ENVIRONMENT=development` before running Uvicorn by hand.
- Check that your shell does not already export another value: `echo $ENVIRONMENT` (or `$env:ENVIRONMENT` in PowerShell).

### Frontend API Proxy 502 / Connection Refused
- Confirm the backend is running at `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/game` in your browser to verify API health.
