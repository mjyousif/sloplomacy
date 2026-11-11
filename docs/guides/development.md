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
.\scripts\dev.ps1
```
> To run each server in its own separate terminal window:
> ```powershell
> .\scripts\dev.ps1 -SeparateWindows
> ```

### macOS / Linux / WSL / Git Bash
```bash
./scripts/dev.sh
```

### Cross-Platform Python Runner
```bash
python scripts/quickstart.py
```

### CLI Flags for `quickstart.py`
- `python scripts/quickstart.py --no-open`: Run servers without launching the web browser.
- `python scripts/quickstart.py --backend-only`: Start only the FastAPI backend on port `8000`.
- `python scripts/quickstart.py --frontend-only`: Start only the Vite dev server on port `5173`.
- `python scripts/quickstart.py --setup-only`: Install Python venv and npm packages without launching servers.
- `python scripts/quickstart.py --test`: Run the complete backend test suite and verify frontend build.

### Local Demo Sign-In
When Supabase is not configured, the sign-in form creates a local demo account. It is stored in the browser, and the frontend sends it to the backend as an unsigned `alg: none` token.

`backend/security/auth.py` rejects those tokens unless `ENVIRONMENT` is `development` or `test`, or `ALLOW_INSECURE_DEV_AUTH=true`. Every launcher above sets `ENVIRONMENT=development` for the backend it starts, so a demo sign-in works out of the box:

- `scripts/quickstart.py` sets it in `backend_env()`. `scripts/start.sh`, `scripts/start.bat`, `scripts/dev.sh` and the default path of `scripts/start.ps1` and `scripts/dev.ps1` all run `scripts/quickstart.py`.
- `scripts/dev.ps1` sets it in the backend window for `-SeparateWindows`, which starts Uvicorn directly.

A value already in your shell wins. To try the production behaviour locally, run `ENVIRONMENT=production python scripts/quickstart.py`, and a demo sign-in gets a `401`.

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

# Install requirements (runtime packages plus pytest; install requirements-dev.txt for development linters)
pip install -r requirements-dev.txt

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

## Code Quality, Linting & Formatting

Static analysis, linting, and formatting checks are decoupled from runtime tests:

### Unified Linting & Formatting Runners
- **Run Linters, Typecheck & File-Size Audit**:
  ```bash
  ./scripts/lint.sh
  # Windows PowerShell:
  .\scripts\lint.ps1
  ```
- **Run File-Size Modularity Audit Standalone** (enforces the 500-line ceiling and legacy ratchets):
  ```bash
  python3 scripts/check_file_limits.py
  ```
- **Automatic Pre-Commit Hooks** (`.pre-commit-config.yaml` runs Ruff, Biome, and `check_file_limits.py` on commit; installed automatically by `scripts/setup.sh` / `scripts/setup.ps1`, or manually):
  ```bash
  pre-commit install
  ```
- **Check Formatting (Dry-Run)**:
  ```bash
  ./scripts/format.sh --check
  # Windows PowerShell:
  .\scripts\format.ps1 -Check
  ```
- **Apply Formatting**:
  ```bash
  ./scripts/format.sh
  # Windows PowerShell:
  .\scripts\format.ps1
  ```

### Individual Service Tooling
- **Backend (Python)**:
  - Linter & Formatter: **Ruff** (configured via `pyproject.toml`).
  - Run lint: `ruff check backend/`
  - Run format check: `ruff format --check backend/`
  - Apply format: `ruff format backend/`
- **Frontend (TypeScript & React)**:
  - Linter & Formatter: **Biome** (configured via `frontend/biome.jsonc`).
  - Typecheck: `npm run typecheck` (`tsc --noEmit`)
  - Run lint: `npm run lint`
  - Run format check: `npm run format:check`
  - Apply format: `npm run format`

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
The suites live in `backend/tests/`, split into `unit/` (one module at a time, mirroring the packages) and `integration/` (the app through HTTP and the game socket). [docs/backend/README.md](../backend/README.md#running-backend-tests) describes the layout.

WebSocket tests read messages with `receive_json(ws)` from `backend/tests/ws_testing.py` rather than `ws.receive_json()`. Starlette's test client waits forever for a message, so a broadcast the server never sends would hang the run; the helper fails the test after 5 seconds instead. In CI every job also has a `timeout-minutes` limit.

Run all tests from the repository root:
```bash
python -m pytest backend/ -v
```

### Running Frontend Tests (`Vitest`)
Run every frontend unit test:
```bash
cd frontend
npm test
```

Tests run in node by default. A hook or component test that needs a DOM starts with `// @vitest-environment jsdom` and uses Testing Library (`renderHook`, `render`, `screen` and `userEvent`). `src/test/setup.ts` loads the jest-dom matchers and cleans up after each test. `src/hooks/useDisplayPrefs.test.ts` is a worked example that mocks `lib/supabase` and uses fake timers. See [docs/frontend/README.md](../frontend/README.md#unit-testing-vitest).

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

### Adding a Scenario
Add `frontend/e2e/<topic>.spec.ts` that starts with two header comments, and the runner picks it up for `list`, `run <name>` and `run --all` with no other registration:
```ts
// @scenario <short name>
// @description <one line shown by 'list'>
// @alias <optional extra name>   (optional, repeatable)
// @order <optional number>       (optional position in 'list' and 'run --all')
```
Use the file name (without `.spec.ts`) as the `ScenarioRecorder` name, because that is the artifacts folder. The file name also works as a long alias, and duplicate names fail at startup. Then add a row to the catalog below.

### Scenario Catalog & Artifacts
| Scenario | Focus Area | Step Screenshots Saved In |
| :--- | :--- | :--- |
| `movement` | Map reticle moves, Support vectors, Hold toggles, turn advance, Admin rollback | `artifacts/e2e/movement_and_orders/` |
| `sandbox` | Lobby launch, the sign-up prompt on hosting while signed out, Hypothetical Mode foreign pre-move isolation | `artifacts/e2e/sandbox_isolation/` |
| `blunder` | Self-bounce detection, Sanity Check modal, override flow | `artifacts/e2e/blunder_sanity_modal/` |
| `retreats` | Dislodged unit ring, valid retreat selection, Fall advance | `artifacts/e2e/retreats_dislodgement/` |
| `builds` | Winter adjustments, Army/Fleet builds, bicoastal STP/NC Fleet build, deficit disband | `artifacts/e2e/winter_builds/` |
| `mobile` | Phone (390x844, touch taps): full-width map, order sheet, ≡ tools drawer, docked unit bar, card-to-map selection, a move by tap, a winter build, a past turn from the drawer with its map pill | `artifacts/e2e/mobile_compact_hud/`, `artifacts/e2e/mobile_winter_build/`, `artifacts/e2e/mobile_turn_history/` |
| `history` | Turn history: a resolved bounce shown with every nation's orders, nation chips, the read-only orders panel, back to live | `artifacts/e2e/turn_history/` |
| `convoy_scenarios` | Authoritative convoy reachability: ocean-blue potential/chained vs solid-green active highlights + reticles, dead-end path filtering, broken chains, 4-ship Trans-Med convoy, and bicoastal landings | `artifacts/e2e/convoy_scenarios/` |

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
- Run `python scripts/quickstart.py --setup-only` to automatically regenerate `.venv` and install all required packages.

### "Backend Connection Required" / "Backend returned 401" After a Demo Sign-In
- The backend is rejecting the unsigned demo token. See [Local Demo Sign-In](#local-demo-sign-in).
- Start the app with one of the launchers, or set `ENVIRONMENT=development` before running Uvicorn by hand.
- Check that your shell does not already export another value: `echo $ENVIRONMENT` (or `$env:ENVIRONMENT` in PowerShell).

### Frontend API Proxy 502 / Connection Refused
- Confirm the backend is running at `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/game` in your browser to verify API health.
