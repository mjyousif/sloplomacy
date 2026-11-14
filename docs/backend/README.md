# Backend Architecture (FastAPI)

The backend service is located in the `backend/` directory. It is built with **FastAPI** and **Pydantic**, providing a stateless-capable, high-speed tactical evaluation, DATC adjudication, Supabase PostgreSQL persistence, and multiplayer lobby management engine for Diplomacy 1901.

---

## Directory Structure

```
backend/
├── main.py                  # FastAPI app instance, CORS/security headers, router inclusion
├── api/                     # Modular FastAPI routers
│   ├── games.py             # Match rooms: lobby list, creation, loading, deletion, saving a sandbox
│   ├── lobby.py             # Lobby browser: paged public matches with filters, and the caller's own games
│   ├── seats.py             # Seats: joining/claiming, leaving, surrendering, picking the active power
│   ├── orders.py            # Single order submission, batch atomic updates, confirm-all, clear-all
│   ├── turns.py             # Finalization, turn adjudication, phase timer votes and extensions
│   ├── sandbox.py           # Isolated sandbox mode ("War Room"), hypothetical simulation, AI order generation
│   ├── admin.py             # Administrator turn controls (status, rollback, jumps, unfinalize-all, test seed)
│   ├── admin_units.py       # Administrator board overrides (unit spawner/teleport/destroy, ownership)
│   ├── history.py           # Read-only turn history: resolved phases with every power's orders and outcomes
│   ├── press.py             # Press (chat): the public box, private threads and anonymous notes of a match
│   └── websocket.py         # Real-time WebSockets for turn state updates and lobby room events
├── domain/                  # Core Pydantic domain models & schemas
│   ├── board.py             # Power, UnitType, ProvinceType, ProvinceInfo, Unit
│   ├── orders.py            # OrderType, Order, OrderResolution, SimulationResult
│   ├── issues.py            # IssueSeverity, IssueCode, ValidationIssue
│   ├── game_state.py        # GameState, PhaseTimer, turn history, seats and lobby summaries
│   ├── press.py             # PressMessage (stored), PressMessageView (what one player sees), PressFeed
│   └── requests.py          # Request/response bodies (incl. GameBootstrapResponse) and WebSocket messages
├── engine/                  # Authoritative rules & simulation engine
│   ├── adjudicator/         # DATC turn adjudication over python 'diplomacy', one module per phase
│   │   ├── resolver.py      # create_diplomacy_game, compute_current_builds, adjudicate_turn
│   │   ├── translator.py    # Order and phase name <-> engine string conversion
│   │   ├── context.py       # ResolutionContext shared by the phase modules
│   │   ├── movement.py      # Movement: engine orders, strengths, dislodgements
│   │   ├── retreats.py      # Retreats: engine orders and where each unit went
│   │   └── adjustments.py   # Builds, disbands, waivers and civil disorder disbands
│   ├── validator/           # Pre-flight tactical blunder checker (Movement, Retreats, Builds)
│   │   ├── orchestrator.py  # validate_orders: runs the phase's checks in a fixed order
│   │   ├── issues.py        # IssueCollector: numbers issues and filters by power
│   │   ├── retreats.py      # Retreat destinations, retreat self-bounces
│   │   ├── adjustments.py   # Build and disband quotas
│   │   ├── legality.py      # Movement, per unit: legality, supports, convoys
│   │   ├── diagnostics.py   # Movement, across units: self-bounces and direct swaps
│   │   └── convoys.py       # has_active_convoy_chain
│   ├── reachability/        # Authoritative move, convoy chain and support options per unit
│   │   ├── __init__.py      # compute_unit_options orchestrator (Movement, Retreats, Adjustments)
│   │   ├── moves.py         # Direct adjacent moves and retreat destination codes
│   │   ├── sea_graph.py     # Sea-zone connectivity tables and Menger simple-path routing
│   │   ├── convoys.py       # Army active/potential convoys and fleet direct/chained options
│   │   └── supports.py      # Legal support options (hold and move) per unit
│   ├── topology/            # Europe 1901 map
│   │   ├── provinces.py     # Province records, adjacencies & coasts, 1901 units and ownership (data)
│   │   └── graph.py         # Movement, support & convoy reachability rules, coast parsing
│   ├── phase_timer.py       # Multiplayer turn clock rules: votes, pausing, extensions & deadlines
│   ├── ai.py                # Authoritative Diplomacy Tactical AI engine (DATC-compliant heuristics)
│   └── order_utils.py       # Civil disorder rules, default orders, and build/disband calculations
├── storage/                 # Persistence layer & authoritative in-memory state store
│   ├── store.py             # Global room dictionaries (GAMES, GAME_SUMMARIES, etc.) & lifecycle helpers
│   ├── lobby.py             # Which games the public lobby lists, a player's own games, browse filters & paging
│   └── supabase.py          # Supabase PostgreSQL PostgREST upsert & read-through cache
├── security/                # Authentication, authorization, and viewer secrecy
│   ├── auth.py              # Supabase JWT token verification (HS256/ES256/JWKS)
│   └── secrecy.py           # Fog-of-war spectator masking & seat privilege validation
├── scenarios/               # Historical scenario presets & multiplayer lobby seeding
│   └── presets.py           # SCENARIO_IDS, build_scenario, and default lobby seeds
├── ws/                      # WebSocket connection management & broadcasts
│   └── connection_manager.py # Thread-safe connection tracking & JSON message delivery
├── tests/                   # pytest suites, laid out as described in "Running Backend Tests"
│   ├── unit/                # One module at a time, mirroring the packages (unit/engine/adjudicator/, ...)
│   └── integration/         # The app through HTTP and the game socket (integration/api/, ...)
├── requirements-runtime.txt # Python runtime dependencies (what the Docker image installs)
├── requirements.txt         # Runtime dependencies plus test tools, for CI tests
└── requirements-dev.txt     # Runtime + test + code quality tools (Ruff) for development
```

---

## Technical Dependencies

Runtime packages are listed in `backend/requirements-runtime.txt`, each capped below its next major version:
```txt
fastapi>=0.162.0,<1.0
uvicorn[standard]>=0.54.0,<1.0
pydantic>=2.14.2,<3.0
httpx>=0.28.1,<1.0
diplomacy>=1.1.2,<2.0
PyJWT>=2.8.0,<3.0
cryptography>=42.0.0,<51.0
```
`backend/requirements.txt` includes that file and adds `pytest>=9.2.0,<10.0`. Install `requirements.txt` for development and tests.

---

## Core Execution Flow

```
HTTP Request (e.g. POST /api/order?game_id=...)
               │
               ▼
        FastAPI Router (main.py -> api/*.py)
               │
               ├─► Update in-memory GAMES[game_id].orders (backend/storage/store.py)
               │
               ├─► refresh_diagnostics_and_simulation(game)
               │     ├── 1. validator.validate_orders(...) -> list[ValidationIssue]
               │     └── 2. adjudicator.adjudicate_turn(..., is_simulation=True) -> SimulationResult
               │
               ├─► persist_game(game_id) -> backend/storage/supabase.py (Supabase PostgreSQL JSONB upsert)
               │
               ├─► ConnectionManager.broadcast_game(...) (WebSocket /ws/games/{id})
               │
               ▼
     Return GameState / Response Model (JSON)
```

### In-Memory State & Supabase Persistence

The backend maintains active match sessions in scoped memory dictionaries acting as an L1 fast-access cache in `backend/storage/store.py`:
- `GAMES: Dict[str, GameState]`: Live game states keyed by `game_id`.
- `SANDBOX_CHECKPOINTS: Dict[str, Optional[GameState]]`: Checkpoints stored when entering Sandbox mode.
- `GAME_HISTORY: Dict[str, List[GameState]]`: Historical snapshots preserved for creator rollback operations.
- `GAME_SUMMARIES: Dict[str, MultiplayerGameSummary]`: Room registry for match browser and lobby display.
- `PRIVATE_SANDBOXES: Dict[str, Tuple[str, Power]]`: Private what-if copies of multiplayer matches, as sandbox id -> (match id, the player's power). The copies themselves live in `GAMES`.
- `UNSAVED_GAMES: Set[str]`: Games whose newest state is not confirmed saved, so Supabase may have no row for them yet.
- `SAVES_RUNNING: Dict[str, bool]`: Games with a save running, and whether that save must repeat because the game changed during it.
- `HISTORY_UNSAVED: Set[str]`: Games whose rollback history differs from what is saved.
- `GAME_PRESS: Dict[str, List[PressMessage]]`: Each match's press (chat), oldest first, kept outside `GameState` so it is never broadcast with the board, copied into a snapshot or sandbox, or undone by a rollback. `PRESS_UNSAVED` marks games whose press is not confirmed saved.

When `SUPABASE_URL` and the service role key (`SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_KEY` holding the service role key) are configured, the backend automatically operates a **read-through / write-through** persistence layer via [`backend/storage/supabase.py`](../../backend/storage/supabase.py):
- On state mutation, the game state, summary, history, and passcodes are serialized to JSONB and persisted to Supabase's `public.multiplayer_games` table. Only one save runs per game, so an older write cannot land after a newer one, and a change made during a save is written when that save repeats.
- On container cold start (such as Google Cloud Run scale-to-zero wakeups), any request for a game absent from RAM is transparently fetched and restored from Supabase.
- Memory is authoritative for a loaded game. `GET /api/games` uses Supabase only to pick up games this process has not loaded and to drop games deleted from Supabase, never to replace a loaded game.
- A failed read raises `SupabaseUnavailable`, so it is never mistaken for a missing game. The lobby falls back to memory, and a game that cannot be loaded answers `503`, not `404`. A game is only treated as deleted when a read succeeded without it and it is not in `UNSAVED_GAMES`.
- Rollback history is stored in the row's `history` column and only sent when it changes, which is when a turn resolves, rolls back or resets. Every other save leaves it out, so an order click writes about 26 KB rather than the whole history. Snapshots leave out previews and diagnostics, which rollback recomputes.
- The lobby reads only `LOBBY_COLUMNS`, so a refresh downloads about 1 KB per game and no game states. If Supabase answers `400` to those columns, it falls back to whole rows.
- Each process keeps its own copy of a loaded game, so running several instances against one database lets them overwrite each other's turns. Every deploy path therefore sets a maximum of one instance.
- Press is saved by `storage/press.py` in the row's own `press` column, with a write that touches nothing else, so a game save and a press save cannot overwrite each other. It is read the first time a game's press is asked for; a failed read raises `SupabaseUnavailable` (a `503`), because treating it as empty would let the next message overwrite the saved press. The oldest messages are dropped past `MAX_PRESS_MESSAGES`. If the column is missing (the migration has not run), press is kept in memory only and a warning is logged once.
- If credentials are not supplied (e.g. offline local development), the server gracefully falls back to ephemeral in-memory mode.
- The anon key never enables persistence. RLS on `multiplayer_games` allows only `service_role`, so with the anon key every read would succeed with zero rows and the lobby would drop every saved game. `get_supabase_key` refuses a key that equals `VITE_SUPABASE_ANON_KEY` or `SUPABASE_ANON_KEY`, a `sb_publishable_` key, or a JWT whose `role` claim is not `service_role`, and logs an error once. A missing key with `SUPABASE_URL` set is logged the same way.

---

## Running the Backend

### Using the Python Quickstart
```bash
python scripts/quickstart.py --backend-only
```

### Manual Execution with Uvicorn
Activate the virtual environment and start Uvicorn directly from the `backend/` directory:
```bash
cd backend
source .venv/bin/activate       # macOS/Linux
# or .venv\Scripts\Activate.ps1 # Windows PowerShell

uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Unlike the launchers, this does not set `ENVIRONMENT=development`, so a local demo sign-in gets a `401`. See [Local Demo Sign-In](../guides/development.md#local-demo-sign-in).

### Interactive OpenAPI Documentation
Once running, OpenAPI documentation is automatically served by Swagger UI at:
- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## Running Backend Tests

Tests live in `backend/tests/` and follow the code they cover:
- `tests/unit/` tests one module directly and mirrors its package: `tests/unit/engine/adjudicator/test_movement.py` covers `engine/adjudicator/movement.py`, and `tests/unit/engine/test_phase_timer.py` covers `engine/phase_timer.py`.
- `tests/integration/` drives the FastAPI app through `TestClient` and the game socket. API flows go under `tests/integration/api/`, grouped by router or feature (the turn clock's are in `tests/integration/api/turn_clock/`).
- Fixtures shared by a folder go in its `conftest.py`, plain helpers in a `helpers.py` next to the tests that use them. Every test folder is a package (`__init__.py`), because file names repeat across packages (`test_retreats.py` exists for both the adjudicator and the validator).
- Every test file passes on its own (`python -m pytest backend/tests/path/to/test_file.py`), not only in the full run. A test that needs seeded lobbies or a fresh board sets them up itself.

Run all tests from the repository root:
```bash
python -m pytest backend/ -v
```
