# Local Development & Testing Guide

This guide covers developer workflows, running the local development environment, testing, and debugging the Diplomacy 1901 Tactical Engine & Atlas.

## Contents

- [Prerequisites](#prerequisites)
- [Quickstart (Single Command)](#quickstart-single-command)
- [Individual Service Workflows](#individual-service-workflows)
- [Code Quality, Linting & Formatting](#code-quality-linting--formatting)
- [Running the Automated Test Suite](#running-the-automated-test-suite)
- [Comparing Rendered Styles Between Two Builds](#comparing-rendered-styles-between-two-builds)
- [LLM-Driven E2E Interactive Testing](#llm-driven-e2e-interactive-testing)
- [Agent Playtest Harness (`scripts/playtest/`)](#agent-playtest-harness-scriptsplaytest)
- [Repository Governance & Branch Protection (`main`)](#repository-governance--branch-protection-main)
- [Troubleshooting & FAQ](#troubleshooting--faq)

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
- `python scripts/quickstart.py --no-dev-login`: Start without the automatic local sign-in. See [Local Demo Sign-In](#local-demo-sign-in).
- `python scripts/quickstart.py --backend-only`: Start only the FastAPI backend on port `8000`.
- `python scripts/quickstart.py --frontend-only`: Start only the Vite dev server on port `5173`.
- `python scripts/quickstart.py --setup-only`: Install Python venv and npm packages without launching servers.
- `python scripts/quickstart.py --test`: Run the complete backend test suite and verify frontend build.

### Local Demo Sign-In
When Supabase is not configured, the sign-in form creates a local demo account. It is stored in the browser, and the frontend sends it to the backend as an unsigned `alg: none` token that expires an hour after each request. The backend refuses an unsigned token without an `exp`, so a hand-made one (a script, a Playwright spec) must carry one.

`backend/security/auth.py` rejects those tokens unless `ALLOW_INSECURE_DEV_AUTH=true`. `ENVIRONMENT=development` or `test` alone no longer enables them, and even with the flag the backend ignores it (and logs an error once) on Cloud Run (`K_SERVICE` is set) or under `ENVIRONMENT=production`. Every launcher above sets the flag, and `ENVIRONMENT=development` for the dev-game seeding, for the backend it starts, so a demo sign-in works out of the box:

- `scripts/quickstart.py` sets them in `backend_env()`. `scripts/start.sh`, `scripts/start.bat`, `scripts/dev.sh` and the default path of `scripts/start.ps1` and `scripts/dev.ps1` all run `scripts/quickstart.py`.
- `scripts/dev.ps1` sets them in the backend window for `-SeparateWindows`, which starts Uvicorn directly.

**Skipping the form.** On the dev server the app signs in a throwaway local player on load, with no form, so you can host and join right away. `getInitialAuthUser` in `frontend/src/lib/supabase.ts` creates a `local_dev_<tag>` player the first time a browser profile loads the app, and keeps it in `localStorage` like any demo sign-in. Each profile or incognito window gets its own id, so a second one is a different player and can claim its own seat. It runs only on the Vite dev server (`import.meta.env.DEV`) and only when Supabase is not configured, so a production build leaves it out, and Vitest (`MODE=test`) never runs it. The backend still needs `ALLOW_INSECURE_DEV_AUTH=true` to accept the token, which the launchers set.

To test the signed-out experience (the guest sandbox, the sign-in prompts), start with `python scripts/quickstart.py --no-dev-login` (`.\scripts\dev.ps1 -NoDevLogin`), or set `VITE_DEV_LOGIN=0` when you start Vite by hand. Clear the site's `localStorage` once if a dev player is already saved. `scripts/e2e_runner.py` sets it for the Vite it starts, because the specs expect to begin signed out.

A value already in your shell wins. To try the production behaviour locally, run `ALLOW_INSECURE_DEV_AUTH=false python scripts/quickstart.py` (or `ENVIRONMENT=production python scripts/quickstart.py`), and a demo sign-in gets a `401`.

> [!WARNING]
> With this flag the backend trusts unsigned tokens, and it also reads other tokens without checking their signature if it has no Supabase keys, so anyone who can reach it can act as any player. It belongs on a local machine only. Never set `ALLOW_INSECURE_DEV_AUTH=true`, `ENVIRONMENT=development` or `ENVIRONMENT=test` in `scripts/deploy.*`, `terraform/`, the `Dockerfile` or CI. The deployed container runs Uvicorn directly, so it never gets the flag from these launchers, and a flag that did leak into Cloud Run would be ignored.

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
export ENVIRONMENT=development ALLOW_INSECURE_DEV_AUTH=true      # macOS/Linux
```
```powershell
$env:ENVIRONMENT = "development"; $env:ALLOW_INSECURE_DEV_AUTH = "true"    # Windows PowerShell
```

#### Regenerating the Python lock
`backend/requirements-runtime.txt` holds the hand-edited version ranges. The Docker image installs `backend/requirements-runtime.lock` instead: every package and its dependencies pinned with hashes (`pip install --require-hashes`), so two builds of one commit install the same files. After changing a range, or to take newer releases, regenerate it on Python 3.11 (the image's version) with pip-tools installed:
```bash
./scripts/lock-requirements.sh            # keep pins, add what changed
./scripts/lock-requirements.sh --upgrade  # newest versions the ranges allow
```
The script refuses another Python version, because a lock made elsewhere can miss the dependencies only 3.11 pulls in. Commit the `.lock` with the change. `requirements.txt` and `requirements-dev.txt` (tests, linters) are not locked.

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

**Game links in dev.** A multiplayer match is at `/game/<id>` (for example `http://localhost:5173/game/mp_a1b2c3`), and the Vite dev server serves `index.html` for it, so a link or a reload opens the game. Use **Copy game link** in the in-game `Game Settings` menu to get one. A link holds only the game id: a private match asks for its passcode in Join with code. `?view=sandbox` (or `#sandbox`) still opens the Solo Sandbox. With the demo sign-in each browser profile is its own player, so open a link in a private window to see it as a signed-out visitor. See [Game Links & Routing](../frontend/state-management.md#game-links--routing-usegameroute).

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
- **Run Linters & Typecheck**:
  ```bash
  ./scripts/lint.sh
  # Windows PowerShell:
  .\scripts\lint.ps1
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

Adding a migration under `supabase/migrations/`: take a timestamp newer than the last file's, write it so a second run changes nothing (CI applies every file twice, and the deploy re-runs them all), and let `backend/tests/unit/test_migrations.py` catch a repeated version.

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

## Comparing Rendered Styles Between Two Builds

`scripts/compare_styles.mjs` compares every element's box, scroll size, computed style and active `::before`/`::after`, plus forced `:hover`, `:active`, `:focus` and `:focus-visible`, between two built `frontend/dist` folders (for example `main` and your branch) at 1440x900 (mouse) and 390x844 (touch and mouse). Use it to prove a stylesheet refactor shows no visible change.

```bash
# Build main's dist first and keep it outside your worktree, start the backend on :8000, then:
node scripts/compare_styles.mjs --main <main-dist-dir> --api-port 8000 --suite core
node scripts/compare_styles.mjs --main <main-dist-dir> --api-port 8000 --scenes <scenes.mjs> --mobile-only
```

`--suite` picks a built-in set (`tools`, `lobby`, `core`); `--scenes` takes a module exporting `{ forcedSelectors, includeSvg, run({ page, baseUrl, viewport, hasTouch, snap }) }`. `includeSvg: true` also records everything inside the map's `<svg>`, which is skipped by default. Selectors in a scenes file must work on both builds, so use attributes, roles and text, not module class names.

## LLM-Driven E2E Interactive Testing

Traitorous includes an interactive end-to-end (E2E) testing framework designed for AI coding agents and human developers. Unlike rigid visual regression tests that break when styling changes, this framework executes realistic user journeys, captures viewport screenshots at each step, logs runtime console/page telemetry, and allows visual and semantic inspection.

### Browser Prerequisites
By default, `frontend/playwright.config.ts` uses system Google Chrome (`channel: 'chrome'`). If Google Chrome is not installed on your machine, you can override the browser channel with `PLAYWRIGHT_CHANNEL=none` (or `PLAYWRIGHT_CHANNEL=chromium`) after installing Playwright's Chromium binary (`npx playwright install chromium` in `frontend/`).

### Running Interactive Scenarios
Use the cross-platform runner (`scripts/e2e_runner.py`), which auto-detects and launches the backend (with `ENVIRONMENT=development` and `ALLOW_INSECURE_DEV_AUTH=true`) and frontend dev servers if not already running:

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
| `lobby_home` | Homepage for a player with games: the map hero of the game that needs them, the other-games strip, the ⋯ leave menu, the phone layout, and a second player who is sent no board and no private game | `artifacts/e2e/lobby_home/` |
| `history` | Turn history: a resolved bounce shown with every nation's orders, nation chips, the read-only orders panel, back to live | `artifacts/e2e/turn_history/` |
| `press` | Press (chat) between three seated players in two browsers: public box, a private thread the third player is never served, anonymous messages in a group thread and the public box (never in a one-to-one thread), province links lighting the map, unread badges, and the phone drawer | `artifacts/e2e/press/`, `artifacts/e2e/press_phone/` |
| `lobby_browser` | Lobby game browser with two players (desktop 1440x900 and a phone guest at 390x844): open, full, country and turn filters, a private campaign never listed, opening a row and claiming a seat, the guest's seat strip turning taken live, the guest's claim asking to sign in, and Resume on the player's own game | `artifacts/e2e/lobby_browser/` |
| `spectate` | Watching without a seat: a signed-out visitor watches a public game from the browser (no hidden orders, nothing to order, public press only), a private game through Join with code, and on a phone; game links: `/game/<id>` watched signed out, reload keeps the game and Back returns to the lobby, Copy game link, a private link opening Join with code with the Game ID filled in, a seated player's link resuming their seat, and the link in the private-campaign dialog | `artifacts/e2e/spectate/` |
| `convoy_scenarios` | Authoritative convoy reachability: ocean-blue potential/chained vs solid-green active highlights + reticles, dead-end path filtering, broken chains, 4-ship Trans-Med convoy, and bicoastal landings | `artifacts/e2e/convoy_scenarios/` |
| `admin_resolve_turn` | Admin Direct-Edit board changes (ownership, spawn, relocate, undo) with concurrent player orders and finalization, Fog-of-War & order preservation, force-resolve turn, and `AdminActionWarningModal` acknowledgement (aliases: `admin`, `admin_board_edit`) | `artifacts/e2e/admin_resolve_turn/` |

Each scenario exports a `summary.json` containing the execution status (`PASSED`/`FAILED`), step-by-step screenshot paths, and any browser console or uncaught page runtime errors.

---

## Agent Playtest Harness (`scripts/playtest/`)

A Game Master agent can run a full game between seven agent players against the real backend, to find bugs that only show up in play. It talks to the API only, so it does not cover the UI, the game socket, the turn clock or Supabase persistence.

| File | Purpose |
| :--- | :--- |
| `GM_PROMPT.md` | The prompt for the Game Master session: budget rules, setup, the per-phase loop, what to check and what to deliver. |
| `sim_client.py` | The players' CLI for one seat: `state`, `orders`, `finalize`, `press-read`, `press-send`, `history`. Run it with no arguments for the order syntax. `--self-test` plays a scripted 1901 on a fresh game. |
| `selftest.py` | The scripted year behind `--self-test`: moves, a dislodgement and its retreat, builds, a waive and a disband, through the players' own commands. Run it before any agent starts: `SIM_API=http://127.0.0.1:8020 python3 scripts/playtest/sim_client.py --self-test`. |
| `gmtool.py` | Game Master views: one resolved turn with every order and its result (`hist N`), centre counts (`sc`), a fog-of-war check (`probe POWER`) and `units`. |
| `watch.py` | A read-only spectator page (`python3 scripts/playtest/watch.py 8021`) showing every power's live orders and all press. |

The scripts read `SIM_API` (default `http://127.0.0.1:8020`) and `SIM_GAME`; `sim_client.py` also reads `SIM_POWER`. They sign in with the local demo token, so the backend must run with `ALLOW_INSECURE_DEV_AUTH=true` (see [Local Demo Sign-In](#local-demo-sign-in)). Never point them at a deployed server. A run writes its notes, log and report to `artifacts/playtest/<timestamp>/`, which is gitignored.

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
- Start the app with one of the launchers, or set `ALLOW_INSECURE_DEV_AUTH=true` before running Uvicorn by hand.
- Check that your shell does not already export another value: `echo $ALLOW_INSECURE_DEV_AUTH` (or `$env:ALLOW_INSECURE_DEV_AUTH` in PowerShell), and that `ENVIRONMENT` is not `production`.

### Frontend API Proxy 502 / Connection Refused
- Confirm the backend is running at `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/game` in your browser to verify API health.
