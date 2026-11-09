# AGENTS.md — Agent & Contributor Operational Guide

Welcome to **Sloplomacy (1901 Tactical Engine & Multiplayer Chancellery)**. This document serves as the primary operational blueprint, architectural reference, and coding standard for AI coding agents and human contributors working within this repository.

---

## 1. Quick Reference Commands

### Running Locally
- **Single-command fullstack launcher (Windows PowerShell)**:
  ```powershell
  .\scripts\dev.ps1
  # Or run in separate terminal windows:
  .\scripts\dev.ps1 -SeparateWindows
  ```
- **Single-command cross-platform runner (Python)**:
  ```bash
  python scripts/quickstart.py
  # Flags: --no-open, --backend-only, --frontend-only, --setup-only, --test
  ```
- **macOS / Linux / WSL**:
  ```bash
  ./scripts/dev.sh
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
  *(Runs every `backend/tests/**/test_*.py` suite, including: `test_engine.py`, `test_adjudicator.py`, `test_admin.py`, `test_ai_and_private_lobbies.py`, `test_api_integration.py`, `test_database_persistence.py`, `test_match_guards.py`, `test_phase_timer.py`, `test_security.py`, `test_surrender_leave.py`, `test_validator.py`, and `test_websocket_sync.py`)*

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

## 3. Architecture Blueprint & Package Boundaries

Rather than maintaining a brittle, exhaustive file list that rots as features are added, this section defines the authoritative package boundaries, directory responsibilities, and structural invariants.

### Backend Packages (`backend/`)
- **Application Assembler (`backend/main.py`)**: Root FastAPI application initialization, CORS configuration, security headers, lifespan hooks, and router inclusion.
  - **Invariant**: `main.py` is an assembler (< 350 lines); never add route handlers (`@app.get`, `@app.post`) directly here.
- **API Routers (`backend/api/`)**: Domain-partitioned FastAPI routers. Every HTTP endpoint and WebSocket connection belongs in its domain router:
  - `games.py`: Match lifecycle, lobby creation, seat claiming, leaving, and surrender.
  - `orders.py`: Move/retreat/build order submission, atomic batch updates, and order confirmation.
  - `turns.py`: Finalization, turn adjudication, phase timer voting, and extension requests.
  - `sandbox.py`: Sandbox sessions, speculative simulation, and AI heuristics.
  - `admin.py`: Creator/admin overrides (teleport, turn rollback, unit spawning/deletion).
  - `history.py`: Read-only turn history for the turn selector (resolved phases and their records).
  - `websocket.py`: Live turn synchronization and WebSocket subscriptions.
- **Domain Models (`backend/domain/`)**: Authoritative Pydantic v2 schemas (`models.py`) defining `GameState`, `Order`, `Issue`, and request/response DTOs.
- **Core Rules Engine (`backend/engine/`)**: Pure adjudication (`adjudicator.py`), DATC/rulebook validation (`validator/`, one module per phase or concern), topological graph (`topology.py`), phase timer (`phase_timer.py`), AI heuristics (`ai.py`), and order helpers (`order_utils.py`). Completely decoupled from HTTP transport.
- **Persistence Layer (`backend/storage/`)**: Authoritative in-memory state store (`store.py`) and Supabase PostgREST client (`supabase.py`).
- **Security & Authorization (`backend/security/`)**: JWT verification and auth dependencies (`auth.py`) and viewer state secrecy sanitization (`secrecy.py`).
- **Scenarios & Presets (`backend/scenarios/`)**: Scenario definitions and match presets (`presets.py`).
- **Real-Time WebSockets (`backend/ws/`)**: Thread-safe WebSocket connection manager and broadcast dispatch (`connection_manager.py`).
- **Test Harness (`backend/tests/`)**: Categorized test suites (`unit/` and `integration/`).

### Frontend Packages (`frontend/src/`)
- **State Coordinator (`App.tsx`)**: Root state container, view mode switcher (Lobby, Game, Sandbox), and API coordination.
- **Components (`components/`)**:
  - Top-level feature views (`EuropeMap.tsx`, `MacroSidebar.tsx`, `ToolsSidebar.tsx`, `LobbyView.tsx`, `AdminToolsModal.tsx`).
  - Feature subdirectories (`map/`, `macro/`, `lobby/`, `admin/`) decomposing complex views into focused, single-responsibility subcomponents (e.g. SVG layers, card items, tab views).
- **Cartographic Data & Metrics (`data/`)**: Static map geometry paths (`europeMapGeometry.ts`), layout coordinates (`mapLayouts.ts`), and font metrics (`mapTextMetrics.ts`).
- **Custom Hooks (`hooks/`)**: Reusable React hooks for WebSockets (`useDiplomacyWebSocket`), phone layout media queries (`useCompactLayout`), display settings (`useDisplayPrefs`), and the turn selector (`useTurnHistory`).
- **Types (`types/`)**: TypeScript type contracts (`diplomacy.ts`), strictly synchronized with `backend/domain/models.py`.
- **Pure Utilities (`utils/`)**: Pure algorithmic helpers and math (`orderHelpers.ts`, `adminHelpers.ts`, `timerHelpers.ts`, `mapCameraHelpers.ts`, `sheetHelpers.ts`, `historyHelpers.ts`, `displayPrefs.ts`).
- **Responsive Layout (`compact.css`)**: Phone-specific styles grouped exclusively under `[data-layout='compact']`.

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
- Turn adjudication in `backend/engine/adjudicator.py` interfaces with the standard Python `diplomacy` package (`diplomacy.Game`).
- Custom conversions exist in `order_to_diplomacy_str` to translate internal Pydantic `Order` objects into official DATC order strings (e.g. `A PAR - BUR`, `F NTH S A BEL - HOL`, `A LON R WAL`, `A BUD B`).
- Do not bypass `create_diplomacy_game()` or hardcode ad-hoc combat resolution logic without verifying against the test suite.

### 3. Multi-Game Rooms & Scoped State
- The backend supports multiple concurrent games, lobbies, and sandboxes in `GAMES: Dict[str, GameState]`.
- All mutation endpoints (`/api/order`, `/api/finalize`, `/api/adjudicate`, etc.) accept an optional `?game_id=<id>` query parameter (defaults to `'proto_1901'`).
- Always pass `activeGameId` in frontend API requests.
- **Invariant**: A caller sees hidden orders only for a seat they hold. The server finds it from their token (`viewer_power_for`, `caller_holds_seat`); a `power` a client names only picks among its own seats. `sanitize_game_state_for_viewer` masks foreign orders and issues and rebuilds `last_resolution` from what the viewer may see. Every response or broadcast of a live match's `GameState` goes through it. The game socket learns who is connecting from an `auth` first message (`?handshake=1`), never from the URL.
- **Invariant**: Masking does not depend on `status`. A lobby nobody has joined yet, or a match that dropped back to one player, is `waiting` but still hides that player's orders.
- **Invariant**: Orders are public once their phase has resolved. `GET /api/history` serves only the `GAME_HISTORY` snapshots `_execute_adjudication` takes just before a phase resolves, so the phase being played is never among them (rollback pops the one it restores). It never serves a private sandbox (`sbx_`) id, whose snapshots hold its owner's live orders for the match's current turn, and it uses the same passcode rule as `GET /api/game` (`require_view_access`).
- **Invariant**: `GameState.active_power` is shared by everyone in a game, so it never identifies a multiplayer player. The client takes the player's power from `resolvePlayerPower` (their claimed seat), and `join` reports the joiner's power only in its own response.
- **Invariant**: Memory is authoritative for a loaded game. Supabase only supplies games this process has not loaded, so never replace `GAMES` or `GAME_SUMMARIES` entries for a loaded game with a database copy. Call `persist_game` after every change to a game.
- **Invariant**: A failed Supabase read raises `SupabaseUnavailable`, and must never be treated as "no such game". Only a successful read that lacks an already saved game means it was deleted; `UNSAVED_GAMES` marks the games that may have no row yet.
- The default game `proto_1901` is shared by all visitors and the app loads it on startup, so it can never be deleted or evicted.
- **Invariant**: Games live in one process, so the service runs a single instance (`--max-instances 1`, also set in `scripts/deploy.*` and Terraform). A second instance would overwrite resolved turns, and players on it would not see each other's updates.
- A live match resolves by itself once everyone it is waiting for has finalized (`everyone_is_ready`). This is checked after a turn resolves and after a player leaves or surrenders. A retreat or adjustment phase no player is involved in plays out at once, but a movement phase always waits, so a match with nobody left playing never runs on.

### 4. Sandbox ("War Room") Mode Isolation
- Sandbox mode allows a player to test orders for all 7 Great Powers without submitting real moves.
- **Multiplayer matches** are shared, so `POST /api/sandbox/enter` gives the player a private copy under its own `sbx_` game id, recorded in `PRIVATE_SANDBOXES`. Other powers start on default orders so the copy cannot reveal their plans, and it is never saved, listed or shown to other players. Later sandbox calls use that id. `POST /api/sandbox/exit` discards the copy and carries over the player's own changed orders if the match is still on the same turn and they still hold the seat.
- **Solo and saved sandboxes** have one player. Entering checkpoints an in-memory clone in `SANDBOX_CHECKPOINTS[game_id]` and its history in `SANDBOX_HISTORY_CHECKPOINTS[game_id]`; exiting restores both, strips foreign hypothetical moves, and merges back only the active power's orders.
- **Invariant**: A saved sandbox (`saved_` id, `is_sandbox`) belongs to the account that saved it. `saved_sandbox_guard`, a dependency on every HTTP router in `main.py`, refuses anyone else on any route that names it (path or `?game_id=`), and the game socket closes with `4403`. A guest's saved sandbox stays open, like a guest's seat. Frontend calls go through `authedFetch` so the owner's token always reaches the server.
- **Invariant**: Turns stepped through in a solo sandbox are hypothetical, so leaving it restores `GAME_HISTORY` too. Otherwise they would show in the turn selector as real turns and become admin rollback targets.
- **Invariant**: Never write foreign sandbox moves into authoritative non-sandbox match state. The sandbox write endpoints answer `409` when called on a live multiplayer match.

### 5. Surrender & Civil Disorder
- A player can surrender an active seat (`POST /api/games/{game_id}/surrender`).
- Surrendered powers are marked in `surrendered_powers: List[Power]`.
- Units belonging to surrendered powers enter **Civil Disorder**: they default to hold (`HOLD`), do not offer support, build nothing, and auto-disband if forced to retreat or if down in supply centers during Winter adjustments. `put_into_civil_disorder` also drops any retreat or build the player had already chosen.
- Empty seats behave the same way, because nobody ever gave those powers orders.

### 6. Turn Clock
- `GameState.timer` is `None` until the host starts the clock, so matches without one are untimed. The rules are in `backend/engine/phase_timer.py` and [docs/guides/rulebook-reference.md](docs/guides/rulebook-reference.md).
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

### 2. Monolith Prevention & File Size Guardrails
To prevent files from growing into unmaintainable monoliths, agents and contributors must observe these modular architectural rules:
- **File Size Ceiling**: Target 150–350 lines per file. Any logic or component file exceeding **500 lines** must be decomposed into sub-modules, subcomponents, or hooks. (Static declarative data constants, such as `europeMapGeometry.ts` or `topology.py`, are exempted if they contain zero tangled logic).
- **Backend Router Separation**: Never add new route handlers directly to `backend/main.py`. Add them to their respective router in `backend/api/` or create a new modular router.
- **Frontend Subcomponent Extraction**: High-complexity UI components must extract sub-layers, modals, or tab views into subdirectories under `frontend/src/components/<feature>/` (e.g. `map/`, `macro/`, `lobby/`, `admin/`).
- **The Ratchet Rule for Legacy Files**: When modifying an existing file that exceeds 500 lines (e.g., `EuropeMap.tsx`, `App.tsx`, `MacroSidebar.tsx`), do NOT append monolithic logic blocks. Extract touched features into helper modules, hooks, or subcomponents. Leave the file smaller or unchanged in size.
- **Skill Playbook**: Follow the detailed guide in `.agents/skills/codebase-modularity/SKILL.md`.

### 3. Preserve Type Contracts
- `frontend/src/types/diplomacy.ts` must strictly mirror `backend/domain/models.py`.
- Whenever adding fields or modifying schemas, update both files concurrently.
- Always run `npx tsc --noEmit` before committing frontend modifications.

### 4. Run Comprehensive Verification
- **Backend Tests**: Run python -m pytest backend/ -v (must pass every suite, currently: adjudicator, admin, ai_and_private_lobbies, api_integration, database_persistence, engine, match_guards, phase_timer, security, surrender_leave, validator, websocket_sync).
- **Frontend Verification**: Run `npm test` (Vitest) and `npm run build` (Vite + TypeScript) in `frontend/`.

### 5. Preserve Documentation & Code Integrity
- Retain all existing code comments, docstrings, and architectural explanations unless directly superseded by new logic.
- Do not produce stale or misleading documentation when authoring or refactoring features.

### 6. LLM-Driven Interactive E2E Verification Protocol
AI coding agents and contributors should run the **one relevant** interactive E2E scenario whenever touching the SVG map canvas (`EuropeMap.tsx`), tactical HUD/sidebars (`MacroSidebar.tsx`, `ToolsSidebar.tsx`), modal dialogs, or adjudication state flows. This includes backend changes to API responses, adjudication, phase flow, sandbox, validator or auth behavior, because the scenarios run against the real backend.
- **Workflow**:
  1. Run scenario: `python scripts/e2e_runner.py run <scenario_name>`.
  2. Inspect the generated step screenshots in `artifacts/e2e/<spec_file_name>/` (for example `artifacts/e2e/movement_and_orders/`) using multimodal vision (`read_file`).
  3. Verify visual sanity: ensure order vectors point to intended provinces, unit tokens and retreat rings render cleanly, and no console or page exceptions are logged in `summary.json`.
  4. Attach passing screenshot paths or summaries to the task review or PR.
- **Keep it targeted.** Pick the single scenario that covers the change and look only at the screenshots for the affected steps. Skip E2E only when nothing a user can see or click could change (docs, comments, test-only changes, fully covered refactors, infra scripts, or internals such as persistence or security headers that leave responses unchanged). Reserve `run --all` for broad changes (shared layout, App.tsx state flow, map rendering), since it is slow and reading screenshots costs tokens.

### 7. Project Skills & Working Style
Reusable playbooks live in `.agents/skills/`. Read the matching `SKILL.md` before starting that kind of work:

| Skill | Use when |
| :--- | :--- |
| `verify-change` | Finishing any change: picks the right pytest / tsc / vitest / build / E2E checks and the docs checklist |
| `codebase-modularity` | Adding, refactoring, or reviewing code to enforce file size ceilings and prevent monolithic files |
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

### 8. Pull Request & Branch Protection Governance
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
