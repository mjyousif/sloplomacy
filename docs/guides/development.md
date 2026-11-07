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

# Install requirements
pip install -r requirements.txt

# Run dev server with auto-reload
uvicorn main:app --reload --host 127.0.0.1 --port 8000
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

Sloplomacy includes an interactive end-to-end (E2E) testing framework designed for AI coding agents and human developers. Unlike rigid visual regression tests that break when styling changes, this framework executes realistic user journeys, captures high-resolution screenshots at each step, logs runtime console telemetry, and allows visual and semantic inspection.

### Running Interactive Scenarios
Use the cross-platform runner (`scripts/e2e_runner.py`), which auto-detects and launches the backend and frontend dev servers if not already running:

```bash
# List all available scenarios:
python scripts/e2e_runner.py list

# Run a specific scenario:
python scripts/e2e_runner.py run movement
python scripts/e2e_runner.py run sandbox
python scripts/e2e_runner.py run blunder
python scripts/e2e_runner.py run retreats
python scripts/e2e_runner.py run builds

# Watch the browser interactively (headed mode):
python scripts/e2e_runner.py run movement --headed

# Run the complete E2E scenario suite:
python scripts/e2e_runner.py run --all
```

### Scenario Catalog & Artifacts
| Scenario | Focus Area | Step Screenshots Saved In |
| :--- | :--- | :--- |
| `movement` | Tactical movement, Hold orders, SVG arrows, turn advance | `artifacts/e2e/movement_and_orders/` |
| `sandbox` | Lobby launch, War Room hypothetical orders, multi-power control | `artifacts/e2e/sandbox_isolation/` |
| `blunder` | Self-bounce detection, Sanity Check modal, override flow | `artifacts/e2e/blunder_sanity_modal/` |
| `retreats` | Dislodged unit ring, valid retreat selection, Fall advance | `artifacts/e2e/retreats_dislodgement/` |
| `builds` | Winter adjustments, surplus SC calculations, home SC build placement | `artifacts/e2e/winter_builds/` |

Each scenario exports a `summary.json` containing the execution status (`PASSED`/`FAILED`), step-by-step screenshot paths, and any browser console/runtime errors.

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

### Frontend API Proxy 502 / Connection Refused
- Confirm the backend is running at `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/game` in your browser to verify API health.
