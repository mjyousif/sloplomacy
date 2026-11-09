# Backend Architecture (FastAPI)

The backend service is located in the `backend/` directory. It is built with **FastAPI** and **Pydantic**, providing a stateless-capable, high-speed tactical evaluation, DATC adjudication, Supabase PostgreSQL persistence, and multiplayer lobby management engine for Diplomacy 1901.

---

## Directory Structure

```
backend/
├── main.py                  # FastAPI app instance, CORS/security headers, router inclusion
├── api/                     # Modular FastAPI routers
│   ├── games.py             # Match room creation, seat joining/claiming/surrendering, public/private lobbies
│   ├── orders.py            # Single order submission, batch atomic updates, confirm-all
│   ├── turns.py             # Finalization, turn adjudication, phase timer votes and extensions
│   ├── sandbox.py           # Isolated sandbox mode ("War Room"), hypothetical simulation, AI order generation
│   ├── admin.py             # Administrator controls (turn rollback, jumps, unit spawner/teleport, ownership)
│   ├── history.py           # Read-only turn history: resolved phases with every power's orders and outcomes
│   └── websocket.py         # Real-time WebSockets for turn state updates and lobby room events
├── domain/                  # Core Pydantic domain models & schemas
│   └── models.py            # GameState, Order, Unit, Resolution, Diagnostics, Timer schemas
├── engine/                  # Authoritative rules & simulation engine
│   ├── adjudicator.py       # DATC turn adjudication & simulation wrapper over python 'diplomacy'
│   ├── validator.py         # Pre-flight tactical blunder checker (Movement, Retreats, Builds)
│   ├── topology.py          # Europe 1901 graph topology, province records & coastline rules
│   ├── phase_timer.py       # Multiplayer turn clock rules: votes, pausing, extensions & deadlines
│   ├── ai.py                # Authoritative Diplomacy Tactical AI engine (DATC-compliant heuristics)
│   └── order_utils.py       # Civil disorder rules, default orders, and build/disband calculations
├── storage/                 # Persistence layer & authoritative in-memory state store
│   ├── store.py             # Global room dictionaries (GAMES, GAME_SUMMARIES, etc.) & lifecycle helpers
│   └── supabase.py          # Supabase PostgreSQL PostgREST upsert & read-through cache
├── security/                # Authentication, authorization, and viewer secrecy
│   ├── auth.py              # Supabase JWT token verification (HS256/ES256/JWKS)
│   └── secrecy.py           # Fog-of-war spectator masking & seat privilege validation
├── scenarios/               # Historical scenario presets & multiplayer lobby seeding
│   └── presets.py           # SCENARIO_IDS, build_scenario, and default lobby seeds
├── ws/                      # WebSocket connection management & broadcasts
│   └── connection_manager.py # Thread-safe connection tracking & JSON message delivery
├── tests/                   # Categorized pytest test suite
│   ├── unit/                # Unit test suites (adjudicator, engine, validator, phase_timer)
│   └── integration/         # Integration test suites (api, database, admin, security, websocket, etc.)
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

When `SUPABASE_URL` and the service role key (`SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_KEY` holding the service role key) are configured, the backend automatically operates a **read-through / write-through** persistence layer via [`backend/storage/supabase.py`](../../backend/storage/supabase.py):
- On state mutation, the game state, summary, history, and passcodes are serialized to JSONB and persisted to Supabase's `public.multiplayer_games` table. Only one save runs per game, so an older write cannot land after a newer one, and a change made during a save is written when that save repeats.
- On container cold start (such as Google Cloud Run scale-to-zero wakeups), any request for a game absent from RAM is transparently fetched and restored from Supabase.
- Memory is authoritative for a loaded game. `GET /api/games` uses Supabase only to pick up games this process has not loaded and to drop games deleted from Supabase, never to replace a loaded game.
- A failed read raises `SupabaseUnavailable`, so it is never mistaken for a missing game. The lobby falls back to memory, and a game that cannot be loaded answers `503`, not `404`. A game is only treated as deleted when a read succeeded without it and it is not in `UNSAVED_GAMES`.
- Rollback history is stored in the row's `history` column and only sent when it changes, which is when a turn resolves, rolls back or resets. Every other save leaves it out, so an order click writes about 26 KB rather than the whole history. Snapshots leave out previews and diagnostics, which rollback recomputes.
- The lobby reads only `LOBBY_COLUMNS`, so a refresh downloads about 1 KB per game and no game states. If Supabase answers `400` to those columns, it falls back to whole rows.
- Each process keeps its own copy of a loaded game, so running several instances against one database lets them overwrite each other's turns. Every deploy path therefore sets a maximum of one instance.
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

The backend includes 11 comprehensive pytest suites:
- `test_engine.py`: 76-province graph symmetry, split coasts, and adjacency.
- `test_adjudicator.py`: Official DATC combat scenarios, dislodgements, and retreat paths.
- `test_admin.py`: Creator authorization, timeline rollback, and board editing.
- `test_ai_and_private_lobbies.py`: Heuristic AI orders, auto-step, and private lobby passcode tests.
- `test_api_integration.py`: Route contracts, query parameter scoping, and state persistence.
- `test_database_persistence.py`: Supabase database persistence & cold-start recovery tests.
- `test_match_guards.py`: A lone player's hidden orders, saved sandboxes kept to their owner, and one resolve per turn.
- `test_phase_timer.py`: Turn clock votes, pauses, extensions, deadlines and late requests.
- `test_security.py`: JWT cryptographic validation, seat authorization, Fog of War secrecy, and IDOR protection.
- `test_surrender_leave.py`: Seat vacating, player surrender, and civil disorder mechanics.
- `test_validator.py`: Pre-flight blunder diagnostics across all three game phases.
- `test_websocket_sync.py`: Real-time WebSocket room & lobby synchronization tests.

Run all tests from the repository root:
```bash
python -m pytest backend/ -v
```
