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
  *(Runs all 6 test suites: `test_engine.py`, `test_adjudicator.py`, `test_admin.py`, `test_api_integration.py`, `test_surrender_leave.py`, and `test_validator.py`)*

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

### Cloud Run & Infrastructure (`deploy.*`, `terraform/`)
- **Automated Scale-to-Zero Deploy**:
  ```powershell
  .\deploy.ps1 -ProjectId "<gcp-project-id>"
  ```
  ```bash
  ./deploy.sh
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
├── deploy.ps1 / deploy.sh     # Infrastructure deployment automation scripts
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
│   ├── validator.py           # Real-time pre-flight legality and tactical blunder checks
│   ├── map_data.py            # Complete 76-province graph, dual coasts, 34 SC definitions
│   ├── requirements.txt       # Python dependencies
│   └── test_*.py              # Comprehensive pytest test harness (6 test suites)
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main state container, viewMode controller & API coordinator
│   │   ├── components/
│   │   │   ├── EuropeMap.tsx        # High-performance interactive SVG board & order arrows
│   │   │   ├── MacroSidebar.tsx     # Order builder, phase controls, diagnostics, admin/surrender
│   │   │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
│   │   │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
│   │   │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
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

### 4. Sandbox ("War Room") Mode Isolation
- Sandbox mode allows a player to test orders for all 7 Great Powers without submitting real moves.
- When entering sandbox (`POST /api/sandbox/enter`), an in-memory clone is checkpointed in `SANDBOX_CHECKPOINTS[game_id]`.
- When exiting sandbox (`POST /api/sandbox/exit`), the checkpoint is restored, foreign hypothetical moves are stripped, and only the active power's orders are merged back.
- **Invariant**: Never write foreign sandbox moves into authoritative non-sandbox match state.

### 5. Surrender & Civil Disorder
- A player can surrender an active seat (`POST /api/games/{game_id}/surrender`).
- Surrendered powers are marked in `surrendered_powers: List[Power]`.
- Units belonging to surrendered powers enter **Civil Disorder**: they default to hold (`HOLD`), do not offer support, and auto-disband if forced to retreat or if down in supply centers during Winter adjustments.

### 6. Cartography & Bicoastal Provinces
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
- rontend/src/types/diplomacy.ts must strictly mirror ackend/models.py.
- Whenever adding fields or modifying schemas, update both files concurrently.
- Always run 
px tsc --noEmit before committing frontend modifications.

### 3. Run Comprehensive Verification
- **Backend Tests**: Run python -m pytest backend/ -v (must pass all 6 test suites: adjudicator, admin, api_integration, engine, surrender_leave, validator).
- **Frontend Verification**: Run 
pm test (Vitest) and 
pm run build (Vite + TypeScript) in rontend/.

### 4. Preserve Documentation & Code Integrity
- Retain all existing code comments, docstrings, and architectural explanations unless directly superseded by new logic.
- Do not produce stale or misleading documentation when authoring or refactoring features.
