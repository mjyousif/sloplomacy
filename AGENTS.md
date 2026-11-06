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
  pip install -r requirements.txt
  ```
- **Run FastAPI Dev Server**:
  ```bash
  uvicorn main:app --reload --host 127.0.0.1 --port 8000
  ```
- **Execute Test Suite**:
  ```bash
  python -m pytest backend/ -v
  ```
  *(Runs all 10 test suites: `test_engine.py`, `test_adjudicator.py`, `test_admin.py`, `test_ai_and_private_lobbies.py`, `test_api_integration.py`, `test_database_persistence.py`, `test_phase_timer.py`, `test_surrender_leave.py`, `test_validator.py`, and `test_websocket_sync.py`)*

### Frontend Commands (`frontend/`)
- **Install Dependencies**:
  ```bash
  cd frontend
  npm install
  ```
- **Run Vite Dev Server** (`http://localhost:5173` with proxy `/api` -> `:8000`):
  ```bash
  npm run dev
  ```
- **Type Checking**:
  ```bash
  npx tsc --noEmit
  ```
- **Unit Testing (Vitest)**:
  ```bash
  npm test
  ```
- **Production Build**:
  ```bash
  npm run build
  ```

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
│   ├── models.py              # Pydantic v2 models (GameState, Order, Issues, Admin schemas)
│   ├── adjudicator.py         # Official DATC adjudication wrapper over `diplomacy` package
│   ├── phase_timer.py         # Multiplayer turn clock rules: votes, pausing, extensions & deadlines
│   ├── validator.py           # Real-time pre-flight legality and tactical blunder checks
│   ├── ai_engine.py           # Heuristic order generation for sandbox AI planning
│   ├── map_data.py            # Complete 76-province graph, dual coasts, 34 SC definitions
│   ├── requirements.txt       # Python dependencies
│   └── test_*.py              # Comprehensive pytest test harness (10 test suites)
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main state container, viewMode controller & API coordinator
│   │   ├── components/
│   │   │   ├── EuropeMap.tsx        # High-performance interactive SVG board & order arrows
│   │   │   ├── MacroSidebar.tsx     # Order builder, phase controls, diagnostics, admin/surrender
│   │   │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
│   │   │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
│   │   │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
│   │   │   ├── PhaseTimerWidget.tsx # Bottom-left turn clock, votes, ready-up & +5 minutes
│   │   │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
│   │   │   └── SanityCheckModal.tsx # Pre-finalization blunder gatekeeper modal
│   │   ├── data/
│   │   │   └── europeMapGeometry.ts # Authentic cartographic SVG paths & province coordinates
│   │   ├── lib/
│   │   │   └── supabase.ts          # Supabase client singleton & auth helpers
│   │   ├── types/
│   │   │   └── diplomacy.ts         # TypeScript interfaces synchronized with models.py
│   │   └── utils/
│   │       ├── orderHelpers.ts      # Move reachability, support targeting & retreat calculations
│   │       └── adminHelpers.ts      # Admin permission checks & payload formatters
│   ├── package.json
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
- **Backend Tests**: Run python -m pytest backend/ -v (must pass all 10 test suites: adjudicator, admin, ai_and_private_lobbies, api_integration, database_persistence, engine, phase_timer, surrender_leave, validator, websocket_sync).
- **Frontend Verification**: Run `npm test` (Vitest) and `npm run build` (Vite + TypeScript) in `frontend/`.

### 4. Preserve Documentation & Code Integrity
- Retain all existing code comments, docstrings, and architectural explanations unless directly superseded by new logic.
- Do not produce stale or misleading documentation when authoring or refactoring features.

### 5. Pull Request & Branch Protection Governance
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
