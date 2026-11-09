# AGENTS.md — Agent & Contributor Operational Guide

Welcome to **Sloplomacy (1901 Tactical Engine & Multiplayer Chancellery)**. This document serves as the primary operational blueprint, architectural reference, and coding standard for AI coding agents and human contributors working within this repository.

---

## 1. Quick Reference Commands

### Running Locally
- **Single-command fullstack launcher (Windows PowerShell)**:
  ```powershell
  .\start.ps1
  # Or run in separate terminal windows:
  .\start.ps1 -SeparateWindows
  ```
- **Single-command cross-platform runner (Python)**:
  ```bash
  python quickstart.py
  # Flags: --no-open, --backend-only, --frontend-only, --setup-only, --test
  ```
- **macOS / Linux / WSL**:
  ```bash
  ./start.sh
  ```

### Backend Commands (`backend/`)
- **Virtual Environment & Dependencies**:
  ```bash
  cd backend
  python -m venv .venv
  # Windows: .venv\Scripts\Activate.ps1 | macOS/Linux: source .venv/bin/activate
  pip install -r requirements-dev.txt # Or requirements.txt for tests only
  ```
- **Linting & Formatting (Ruff)**:
  ```bash
  ruff check backend/
  ruff format --check backend/ # Or: ruff format backend/
  ```
- **Run FastAPI Dev Server**:
  ```bash
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
  *(Set `ENVIRONMENT=development` first to use a local demo sign-in. The launchers do this for you. See [Local Demo Sign-In](docs/guides/development.md#local-demo-sign-in).)*
- **Execute Test Suite**:
  ```bash
  python -m pytest backend/ -v
  ```
  *(Runs every `backend/test_*.py` suite, including: `test_engine.py`, `test_adjudicator.py`, `test_admin.py`, `test_ai_and_private_lobbies.py`, `test_api_integration.py`, `test_database_persistence.py`, `test_phase_timer.py`, `test_security.py`, `test_surrender_leave.py`, `test_validator.py`, and `test_websocket_sync.py`)*

### Frontend Commands (`frontend/`)
- **Install Dependencies**:
  ```bash
  cd frontend
  npm install
  ```
- **Linting & Formatting (Biome)**:
  ```bash
  npm run lint
  npm run format:check # Or: npm run format
  ```
- **Type Checking**:
  ```bash
  npm run typecheck # Or: npx tsc --noEmit
  ```
- **Run Vite Dev Server** (`http://localhost:5173` with proxy `/api` -> `:8000`):
  ```bash
  npm run dev
  ```
- **Unit Testing (Vitest)**:
  ```bash
  npm test
  ```
- **Production Build**:
  ```bash
  npm run build
  ```

### Fullstack Linting & Formatting Scripts (`scripts/`)
- **Run Linters & Typecheck**:
  ```bash
  ./scripts/lint.sh
  # Windows: .\scripts\lint.ps1
  ```
- **Format Code Verification / Application**:
  ```bash
  ./scripts/format.sh --check # Verify formatting
  ./scripts/format.sh         # Apply formatting
  # Windows: .\scripts\format.ps1 [-Check]
  ```

### LLM-Driven Interactive E2E Verification (`scripts/e2e_runner.py`)
- **Prerequisites**: System Google Chrome (`channel: 'chrome'` by default; set `PLAYWRIGHT_CHANNEL=none` or `chromium` to use bundled Chromium after `npx playwright install chromium`).
- **List All Scenarios**:
  ```bash
  python scripts/e2e_runner.py list
  ```
- **Run Specific Scenario** (names come from `list`, e.g. `movement`, `sandbox`, `blunder`, `retreats`, `builds`, `mobile`):
  ```bash
  python scripts/e2e_runner.py run movement
  # Or run in a visible browser window:
  python scripts/e2e_runner.py run movement --headed
  ```
- **Execute Full E2E Scenario Suite** (only for broad changes; prefer one scenario):
  ```bash
  python scripts/e2e_runner.py run --all
  ```
  *(Captures step screenshots in `artifacts/e2e/<scenario>/` and logs console/page telemetry for multimodal inspection)*

### Cloud Run & Infrastructure (`scripts/deploy.*`, `terraform/`)
- **Automated Scale-to-Zero Deploy**:
  ```powershell
  .\scripts\deploy.ps1 -ProjectId "<gcp-project-id>"
  ```
  ```bash
  ./scripts/deploy.sh
  ```
- **Terraform IaC**:
  ```bash
  cd terraform
  terraform init
  terraform plan -var="project_id=<gcp-project-id>"
  terraform apply -var="project_id=<gcp-project-id>"
  ```

---

## 2. Architecture & Tech Stack

```
                                  BROWSER CLIENT
         React 19 + TypeScript + Vite + Lucide React + Supabase Auth
                                       │
                         REST JSON API (Proxied /api)
                                       ▼
                                 FASTAPI APP
                    Pydantic v2 Models + In-Memory Store
                   (Optional Cloud Run scale-to-zero container)
                         │                          │
                         ▼                          ▼
               ADJUDICATION ENGINE          VALIDATION ENGINE
             python 'diplomacy' lib         blunder & legality
         (Movement, Retreats, Builds)       diagnostic issues
                         │                          │
                         └──────────────┬───────────┘
                                        ▼
                               MAP TOPOLOGY GRAPH
                           76 Provinces, Coasts, SCs
```

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Backend Engine** | Python 3.10+, FastAPI, Pydantic v2, `diplomacy>=1.1.2`, Uvicorn | Authoritative state, official DATC adjudication, blunder diagnostics |
| **Frontend UI** | React 19, TypeScript, Vite, Lucide React, Vitest | GPU-accelerated SVG cartography, interactive tactical HUD, sandboxing |
| **Auth & Database** | Supabase Auth, PostgreSQL, Row-Level Security (RLS) | Optional multi-user authentication, social OAuth, profiles |
| **Deployment / IaC** | Docker, Google Cloud Run, Google Cloud Build, Terraform | Unified single-container deployment, scale-to-zero ($0 idle cost) |

---

## 3. Directory Layout & Key Files

```
.
├── AGENTS.md                  # This operational guide for AI agents
├── README.md                  # Project overview, quickstart & attribution
├── quickstart.py              # Cross-platform Python runner
├── start.ps1 / start.sh       # Native shell runners
├── Dockerfile                 # Multi-stage build (Vite build + FastAPI runner)
├── cloudbuild.yaml            # Google Cloud Build build & push pipeline
├── scripts/                  # Developer automation & operational QoL scripts
│   ├── dev.ps1 / dev.sh       # Local fullstack development launcher
│   ├── test.ps1 / test.sh     # Unified full test suite runner (pytest + vitest + build)
│   ├── setup.ps1 / setup.sh   # Environment bootstrap (Python venv & npm install)
│   ├── deploy.ps1 / deploy.sh # Scale-to-zero Cloud Run deployment scripts
│   └── setup-ci-cd.ps1 / .sh  # GCP IAM & GitHub Actions credentials setup
├── terraform/                 # Terraform GCP Cloud Run & Artifact Registry IaC
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
├── supabase/
│   └── migrations/            # Supabase PostgreSQL schema & profiles RLS
├── backend/
│   ├── main.py                # FastAPI endpoints, multi-game room registry & static SPA mount
│   ├── auth.py                # Supabase JWT verification (HS256 secret, ES256 key or JWKS)
│   ├── database.py            # Supabase PostgREST persistence: save, load, lobby columns, SupabaseUnavailable
│   ├── domain/                # Domain models & schemas (GameState, Order, Issues, Admin schemas)
│   ├── engine/                # DATC adjudication wrapper, validator, graph topology, phase clock, AI
│   ├── storage/               # Supabase PostgREST persistence and local store
│   ├── security/              # Auth & JWT verification, viewer state sanitization
│   ├── tests/                 # Categorized pytest harness (unit/ and integration/ test suites)
│   ├── models.py              # Root backward-compatible facade re-exporting domain/
│   ├── adjudicator.py         # Root backward-compatible facade re-exporting engine/
│   ├── phase_timer.py         # Root backward-compatible facade re-exporting engine/
│   ├── validator.py           # Root backward-compatible facade re-exporting engine/
│   ├── ai_engine.py           # Root backward-compatible facade re-exporting engine/
│   ├── map_data.py            # Root backward-compatible facade re-exporting engine/
│   ├── database.py            # Root backward-compatible facade re-exporting storage/
│   ├── auth.py                # Root backward-compatible facade re-exporting security/
│   ├── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main state container, viewMode controller & API coordinator
│   │   ├── compact.css        # Phone layout rules, all under [data-layout='compact']
│   │   ├── components/
│   │   │   ├── EuropeMap.tsx        # High-performance interactive SVG board & order arrows
│   │   │   ├── ToolsSidebar.tsx     # Left sidebar: legend, powers, sandbox & admin entry points
│   │   │   ├── MacroSidebar.tsx     # Order builder, phase controls, diagnostics, admin/surrender
│   │   │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
│   │   │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
│   │   │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
│   │   │   ├── BottomSheet.tsx      # Phone pull-up panel (peek, half, full) that holds the order sheet
│   │   │   ├── CompactTopBar.tsx    # Phone top bar: back, ≡ tools, turn, order-problem count & ⋯ menu
│   │   │   ├── DisplaySettingsMenu.tsx # Top bar menu for this player's piece style and marks
│   │   │   ├── MapPiece.tsx         # Draws unit pieces, stars, rings and hit areas for every style
│   │   │   ├── PhaseTimerWidget.tsx # Bottom-left turn clock, votes, ready-up & +5 minutes
│   │   │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
│   │   │   ├── ConfirmModal.tsx     # In-app confirmation for destructive actions (Shift+click skips it)
│   │   │   ├── VersionBadge.tsx     # Commit short SHA badge & link
│   │   │   └── SanityCheckModal.tsx # Pre-finalization blunder gatekeeper modal
│   │   ├── data/
│   │   │   ├── europeMapGeometry.ts # Authentic cartographic SVG paths & province coordinates
│   │   │   ├── mapLayouts.ts        # Unit, star and name placements for each piece style
│   │   │   └── mapTextMetrics.ts    # Libre Baskerville widths for sizing names without the DOM
│   │   ├── hooks/
│   │   │   ├── useDiplomacyWebSocket.ts # Live Sync socket: heartbeat, reconnect rules & clock refresh
│   │   │   ├── useCompactLayout.ts  # The phone breakpoint (COMPACT_LAYOUT_QUERY) as a live boolean
│   │   │   └── useDisplayPrefs.ts   # This player's display choice, saved on the device and account
│   │   ├── lib/
│   │   │   └── supabase.ts          # Supabase client singleton & auth helpers
│   │   ├── types/
│   │   │   └── diplomacy.ts         # TypeScript interfaces synchronized with models.py
│   │   └── utils/
│   │       ├── orderHelpers.ts      # Move reachability, support targeting & retreat calculations
│   │       ├── adminHelpers.ts      # Admin permission checks & payload formatters
│   │       ├── timerHelpers.ts      # Turn clock labels, vote counts & formatting
│   │       ├── mapCameraHelpers.ts  # Map pan and zoom bounds, zoom-at-point, pinch, phone camera & tap targets
│   │       ├── sheetHelpers.ts      # Phone order sheet stops: snap heights, release and tap stepping
│   │       └── displayPrefs.ts      # Display preference types, defaults, sanitizing & sign-in rules
│   ├── package.json         # Vitest suites sit next to their code as *.test.ts
│   └── vite.config.ts
└── docs/                      # Exhaustive technical documentation suite
```

---

## 4. Domain Knowledge & System Invariants

When reading or modifying code in this repository, always preserve these game rules and architectural invariants:

### 1. Game Phases & Resolution Cycle
The game cycles through three standard phases per year:
1. **Movement (`M`)**:
   - `Spring <Year> Movement` ➔ if dislodgements occur, advances to `Spring <Year> Retreats`, else advances directly to `Fall <Year> Movement`.
2. **Retreats (`R`)**:
   - Dislodged units must choose an unoccupied adjacent province that was not the attacker's origin and not contested by bounce, or `DISBAND`.
   - After resolving retreats, advances to `Fall <Year> Movement` (from Spring) or `Winter <Year> Adjustments` (from Fall).
   - A dislodged unit with no retreat order disbands. `create_default_orders` follows the rulebook: unordered units hold, dislodged units disband, and builds are waived. Nothing is built or retreated on a player's behalf.
3. **Winter Adjustments (`A`)**:
   - Compares total Supply Centers (SCs) owned with existing unit counts.
   - If `SC > Units`: Owning power builds units (`BUILD`) in vacant home SCs (`count` builds allowed).
   - If `SC < Units`: Owning power disbands surplus units (`DISBAND`) anywhere on the board (`count` disbands required).
   - If `SC == Units`: No adjustments needed.
   - Advances to `Spring <Year + 1> Movement`.

### 2. Adjudication Library (`diplomacy>=1.1.2`)
- Turn adjudication in `backend/adjudicator.py` interfaces with the standard Python `diplomacy` package (`diplomacy.Game`).
- Custom conversions exist in `order_to_diplomacy_str` to translate internal Pydantic `Order` objects into official DATC order strings (e.g. `A PAR - BUR`, `F NTH S A BEL - HOL`, `A LON R WAL`, `A BUD B`).
- Do not bypass `create_diplomacy_game()` or hardcode ad-hoc combat resolution logic without verifying against the test suite.

### 3. Multi-Game Rooms & Scoped State
- The backend supports multiple concurrent games, lobbies, and sandboxes in `GAMES: Dict[str, GameState]`.
- All mutation endpoints (`/api/order`, `/api/finalize`, `/api/adjudicate`, etc.) accept an optional `?game_id=<id>` query parameter (defaults to `'proto_1901'`).
- Always pass `activeGameId` in frontend API requests.
- **Invariant**: A caller sees hidden orders only for a seat they hold. The server finds it from their token (`viewer_power_for`, `caller_holds_seat`); a `power` a client names only picks among its own seats. `sanitize_game_state_for_viewer` masks foreign orders and issues and rebuilds `last_resolution` from what the viewer may see. Every response or broadcast of a live match's `GameState` goes through it. The game socket learns who is connecting from an `auth` first message (`?handshake=1`), never from the URL.
- **Invariant**: `GameState.active_power` is shared by everyone in a game, so it never identifies a multiplayer player. The client takes the player's power from `resolvePlayerPower` (their claimed seat), and `join` reports the joiner's power only in its own response.
- **Invariant**: Memory is authoritative for a loaded game. Supabase only supplies games this process has not loaded, so never replace `GAMES` or `GAME_SUMMARIES` entries for a loaded game with a database copy. Call `persist_game` after every change to a game.
- **Invariant**: A failed Supabase read raises `SupabaseUnavailable`, and must never be treated as "no such game". Only a successful read that lacks an already saved game means it was deleted; `UNSAVED_GAMES` marks the games that may have no row yet.
- The default game `proto_1901` is shared by all visitors and the app loads it on startup, so it can never be deleted or evicted.
- **Invariant**: Games live in one process, so the service runs a single instance (`--max-instances 1`, also set in `scripts/deploy.*` and Terraform). A second instance would overwrite resolved turns, and players on it would not see each other's updates.
- A live match resolves by itself once everyone it is waiting for has finalized (`everyone_is_ready`). This is checked after a turn resolves and after a player leaves or surrenders. A retreat or adjustment phase no player is involved in plays out at once, but a movement phase always waits, so a match with nobody left playing never runs on.

### 4. Sandbox ("War Room") Mode Isolation
- Sandbox mode allows a player to test orders for all 7 Great Powers without submitting real moves.
- **Multiplayer matches** are shared, so `POST /api/sandbox/enter` gives the player a private copy under its own `sbx_` game id, recorded in `PRIVATE_SANDBOXES`. Other powers start on default orders so the copy cannot reveal their plans, and it is never saved, listed or shown to other players. Later sandbox calls use that id. `POST /api/sandbox/exit` discards the copy and carries over the player's own changed orders if the match is still on the same turn and they still hold the seat.
- **Solo and saved sandboxes** have one player. Entering checkpoints an in-memory clone in `SANDBOX_CHECKPOINTS[game_id]`; exiting restores it, strips foreign hypothetical moves, and merges back only the active power's orders.
- **Invariant**: Never write foreign sandbox moves into authoritative non-sandbox match state. The sandbox write endpoints answer `409` when called on a live multiplayer match.

### 5. Surrender & Civil Disorder
- A player can surrender an active seat (`POST /api/games/{game_id}/surrender`).
- Surrendered powers are marked in `surrendered_powers: List[Power]`.
- Units belonging to surrendered powers enter **Civil Disorder**: they default to hold (`HOLD`), do not offer support, build nothing, and auto-disband if forced to retreat or if down in supply centers during Winter adjustments. `put_into_civil_disorder` also drops any retreat or build the player had already chosen.
- Empty seats behave the same way, because nobody ever gave those powers orders.

### 6. Turn Clock
- `GameState.timer` is `None` until the host starts the clock, so matches without one are untimed. The rules are in `backend/phase_timer.py` and [docs/guides/rulebook-reference.md](docs/guides/rulebook-reference.md).
- **Invariant**: Nothing runs in the background, because Cloud Run scales to zero and only gives CPU during requests. Deadlines are absolute times in the saved game, and `tick_timer` acts on them from `GET /api/game` and the game WebSocket.
- **Invariant**: `_execute_adjudication` resets the clock before its first `await`, so two polls can never both resolve one deadline.
- **Invariant**: The clock never holds a phase back. A phase still resolves as soon as everyone has finalized.
- History snapshots hold no clock, and a private sandbox never has one. Anything that moves a game to another turn outside `_execute_adjudication` must call `start_phase_clock`.

### 7. Cartography & Bicoastal Provinces
- Three provinces possess split coasts for Fleets:
  - `STP`: North Coast (`NC`) and South Coast (`SC`).
  - `SPA`: North Coast (`NC`) and South Coast (`SC`).
  - `BUL`: East Coast (`EC`) and South Coast (`SC`).
- Army movements ignore coasts; Fleet movements require explicit coast specifiers.
- Switzerland (`SWI`) is impassable terrain.

### 8. Display Preferences & Piece Styles
- Each player chooses a piece style and army and fleet marks in the top bar menu. The rules are in [docs/frontend/map-renderer.md](docs/frontend/map-renderer.md) and [docs/frontend/state-management.md](docs/frontend/state-management.md).
- **Invariant**: Display preferences change only what one player sees. They never enter `GameState` or reach the FastAPI backend.
- **Invariant**: Everything read back from `localStorage` or `user_metadata` goes through `sanitizeDisplayPrefs`, because players can edit both.
- **Invariant**: A failed account read must never be treated as "no saved value", because the upload that follows would overwrite the player's choice. Only a successful read that finds nothing means the account is empty.
- **Invariant**: Classic with `letters` stays pixel-identical to the original map, including `CLY.unitPos` in the North Atlantic. Fix layout problems in the other styles' rows in `mapLayouts.ts`.
- All piece bodies are drawn by `MapPiece`, and everything around them takes its size from `PieceFrame`. Don't hardcode ring radii or badge offsets in `EuropeMap.tsx`.

### 9. Phone Layout
- Phones get a compact layout, chosen by `useCompactLayout()` from `COMPACT_LAYOUT_QUERY` and written on the shell as `data-layout`. The rules are in [docs/frontend/styling-and-themes.md](docs/frontend/styling-and-themes.md#responsive--layout-specifications).
- **Invariant**: Every phone style lives in `src/compact.css` under `[data-layout='compact']`. Don't add width `@media` rules, so the breakpoint stays in one place.
- **Invariant**: The compact layout must not change the wide one. Check a change by comparing every element's box at 1440×900 before and after.
- **Invariant**: Phones have no sidebar rails. Orders live in the pull-up sheet (`MacroSidebar` with `variant="sheet"`, inside `BottomSheet`) and tools in the ≡ drawer (`ToolsSidebar` with `variant="drawer"`). Both variants arrange the desktop components' own pieces, so a change to an order control reaches both layouts. Don't copy one into the other.
- **Invariant**: The phone game area must never scroll. `.war-room-workspace` uses `overflow: clip`, because the lowered sheet runs off the bottom and a box with `overflow: hidden` can still be scrolled by focus, `scrollIntoView` or script, which slides the whole game screen up.
- Hover handlers use `onPointerEnter`/`onPointerLeave` and ignore `pointerType === 'touch'`, so a tap never leaves a hover highlight behind.

---

## 5. Agent Workflow & Development Rules

### 1. Mandatory Documentation Freshness Check
**Agents and contributors must actively inspect and maintain repository documentation.** Never leave documentation outdated when modifying code or discovering existing discrepancies.
- **Before Completing Tasks**: Check whether any changed APIs, models, components, phases, or deployment scripts affect existing docs.
- **Documentation Checklist**:
  - **API Endpoints Changed/Added**: Update both the Endpoint Summary table and detailed endpoint sections in [docs/backend/api-reference.md](docs/backend/api-reference.md).
  - **Data Models / Schemas Changed**: Update Pydantic and TypeScript definitions in [docs/architecture/data-models.md](docs/architecture/data-models.md).
  - **Adjudication or Rule Mechanics Changed**: Update [docs/backend/adjudicator.md](docs/backend/adjudicator.md) and [docs/guides/rulebook-reference.md](docs/guides/rulebook-reference.md).
  - **Validator Rules Changed**: Update issue tables and code listings in [docs/backend/validator.md](docs/backend/validator.md).
  - **Frontend Components, Layout, or State Changed**: Update [docs/frontend/README.md](docs/frontend/README.md), [docs/frontend/sidebar-and-controls.md](docs/frontend/sidebar-and-controls.md), [docs/frontend/map-renderer.md](docs/frontend/map-renderer.md), and [docs/frontend/state-management.md](docs/frontend/state-management.md).
  - **Infrastructure & Deployment Pipeline Changed**: Update [docs/guides/google-cloud-deployment.md](docs/guides/google-cloud-deployment.md).
  - **Developer Tools or Test Harness Changed**: Update [docs/guides/development.md](docs/guides/development.md) and [docs/backend/README.md](docs/backend/README.md).
  - **Top-Level Navigation**: Ensure newly added documents are indexed in both [README.md](README.md) and [docs/README.md](docs/README.md).

### 2. Preserve Type Contracts
- `frontend/src/types/diplomacy.ts` must strictly mirror `backend/models.py`.
- Whenever adding fields or modifying schemas, update both files concurrently.
- Always run `npx tsc --noEmit` before committing frontend modifications.

### 3. Run Comprehensive Verification
- **Backend Tests**: Run python -m pytest backend/ -v (must pass every suite, currently: adjudicator, admin, ai_and_private_lobbies, api_integration, database_persistence, engine, phase_timer, security, surrender_leave, validator, websocket_sync).
- **Frontend Verification**: Run `npm test` (Vitest) and `npm run build` (Vite + TypeScript) in `frontend/`.

### 4. Preserve Documentation & Code Integrity
- Retain all existing code comments, docstrings, and architectural explanations unless directly superseded by new logic.
- Do not produce stale or misleading documentation when authoring or refactoring features.

### 5. LLM-Driven Interactive E2E Verification Protocol
AI coding agents and contributors should run the **one relevant** interactive E2E scenario whenever touching the SVG map canvas (`EuropeMap.tsx`), tactical HUD/sidebars (`MacroSidebar.tsx`, `ToolsSidebar.tsx`), modal dialogs, or adjudication state flows. This includes backend changes to API responses, adjudication, phase flow, sandbox, validator or auth behavior, because the scenarios run against the real backend.
- **Workflow**:
  1. Run scenario: `python scripts/e2e_runner.py run <scenario_name>`.
  2. Inspect the generated step screenshots in `artifacts/e2e/<spec_file_name>/` (for example `artifacts/e2e/movement_and_orders/`) using multimodal vision (`read_file`).
  3. Verify visual sanity: ensure order vectors point to intended provinces, unit tokens and retreat rings render cleanly, and no console or page exceptions are logged in `summary.json`.
  4. Attach passing screenshot paths or summaries to the task review or PR.
- **Keep it targeted.** Pick the single scenario that covers the change and look only at the screenshots for the affected steps. Skip E2E only when nothing a user can see or click could change (docs, comments, test-only changes, fully covered refactors, infra scripts, or internals such as persistence or security headers that leave responses unchanged). Reserve `run --all` for broad changes (shared layout, App.tsx state flow, map rendering), since it is slow and reading screenshots costs tokens.

### 6. Project Skills & Working Style
Reusable playbooks live in `.agents/skills/`. Read the matching `SKILL.md` before starting that kind of work:

| Skill | Use when |
| :--- | :--- |
| `verify-change` | Finishing any change: picks the right pytest / tsc / vitest / build / E2E checks and the docs checklist |
| `secrecy-review` | Adding or changing an endpoint, WebSocket message, broadcast, save path, sandbox or admin action (fog of war and seat authorization) |
| `frontend-change` | Editing the map, sidebars, top bar, modals, CSS, display settings or phone layout |
| `open-pr` | Committing, opening or updating a PR, or resolving conflicts on a stacked PR |
| `supabase`, `supabase-postgres-best-practices` | Anything touching the database, RLS, migrations or Supabase Auth |

Working rules for agents:
- **Fetch first.** `main` moves quickly. Run `git fetch origin` and base your work on `origin/main`. Read the code as it is now, not as your checkout last saw it.
- **Reproduce before fixing.** For a bug, write the failing test (backend: pytest, frontend: Vitest, UI: E2E scenario) first, then fix it.
- **Test the adversary.** For any multiplayer feature, test with two players, where one tries to see or change the other's state.
- **A new path is a new leak.** Every response, broadcast, or save of a live match's state must go through `sanitize_game_state_for_viewer`. Fixes in #90, #91 and #101 were each for a path that skipped it.
- **Keep PRs single-topic** and say what you ran and what you could not run. Don't claim a check passed that you didn't run.
- **Record invariants you discover.** If a bug taught you a rule that isn't obvious from the code, add one bold **Invariant** line to the right subsection of section 4.
- **Grow the checks with the product.** If a change adds user-visible behavior no E2E scenario covers, add a scenario (or extend the closest one) in the same PR and register it by adding the two `// @scenario` and `// @description` header comments (the runner discovers specs in `frontend/e2e/`). The steps are in `verify-change` section 6. Add a new test for every bug you fix.
- **Keep skills current.** If you learn a rule the skills or invariants don't state, or find one that is wrong, update the matching skill or section 4 in the same PR and say so in the PR description.
- **Never hardcode counts** (tests, endpoints, scenarios) in prose when a list will do. They go stale.
- **Don't commit generated output**: `artifacts/`, `.pr_body.md`, `.venv`, `node_modules`, `dist`.

### 7. Pull Request & Branch Protection Governance
- **Branch Protection on `main`**: Direct pushes to `main` are prohibited. All modifications must be submitted via pull request.
- **Mandatory Review**: PRs require at least 1 approving code review before merging (`required_approving_review_count: 1`). Pushing new commits automatically dismisses previous reviews.
- **CI Quality Gates**: PRs must pass `Backend Tests (Pytest)` and `Frontend Tests & Build Check` before they are eligible for merge.
- **Squash & Merge & Auto-Delete**: Branches are squash-merged into `main` using PR titles and descriptions, and head branches are automatically deleted upon merge (`delete_branch_on_merge: true`).
- **PR Creation & Body Formatting Invariant (No Inline `--body`)**:
  - **NEVER** use inline `--body "..."` with multi-line or rich markdown in PowerShell. PowerShell interprets the backtick (`` ` ``) as an escape character (e.g., `` `b `` -> `\x08`, `` `f `` -> `\x0c`, `` `v `` -> `\x0b`) and expands `$variables`, corrupting code spans, file paths, and environment variable references into broken replacement characters and backslashes.
  - **ALWAYS** write the full PR description to a temporary file (e.g. `.pr_body.md` or a scratch markdown file) and dispatch GitHub CLI commands using `--body-file`:
    ```powershell
    gh pr create --title "<title>" --body-file "<path_to_body.md>"
    gh pr edit <pr-number> --body-file "<path_to_body.md>"
    ```
  - Clean up any local temporary body file immediately after execution.
