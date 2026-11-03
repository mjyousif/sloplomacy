# Backend Architecture (FastAPI)

The backend service is located in the `backend/` directory. It is built with **FastAPI** and **Pydantic**, providing a stateless-capable, high-speed tactical evaluation, DATC adjudication, and multiplayer lobby management engine for Diplomacy 1901.

---

## Directory Structure

```
backend/
├── main.py                  # FastAPI app instance, route handlers, multi-room registry & SPA static mount
├── models.py                # Pydantic v2 schemas and enumerations
├── adjudicator.py           # DATC turn adjudication & simulation wrapper over python 'diplomacy'
├── validator.py             # Real-time tactical sanity checker across Movement, Retreats, & Builds
├── map_data.py              # Europe 1901 graph topology, province records & coastline rules
├── test_engine.py           # Topology symmetry, connectivity, and basic resolution tests
├── test_adjudicator.py      # Official DATC adjudication, dislodgements, and retreat paths
├── test_admin.py            # Creator privilege enforcement and admin board mutations
├── test_api_integration.py  # Full-stack API endpoint integration tests
├── test_surrender_leave.py  # Concession, civil disorder, and seat-vacating tests
├── test_validator.py        # Blunder detection, friendly fire, and phase-specific validations
└── requirements.txt         # Python runtime dependencies
```

---

## Technical Dependencies

Listed in `backend/requirements.txt`:
```txt
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
pydantic>=2.0.0
pytest>=8.0.0
httpx>=0.27.0
diplomacy>=1.1.2
```

---

## Core Execution Flow

```
HTTP Request (e.g. POST /api/order?game_id=...)
               │
               ▼
        FastAPI Router (main.py)
               │
               ├─► Update in-memory GAMES[game_id].orders
               │
               ├─► refresh_diagnostics_and_simulation(game)
               │     ├── 1. validator.validate_orders(...) -> list[ValidationIssue]
               │     └── 2. adjudicator.adjudicate_turn(..., is_simulation=True) -> SimulationResult
               │
               ▼
     Return GameState / Response Model (JSON)
```

### In-Memory State & Multi-Room Registry

The backend maintains active match sessions in scoped memory dictionaries:
- `GAMES: Dict[str, GameState]`: Live game states keyed by `game_id`.
- `SANDBOX_CHECKPOINTS: Dict[str, Optional[GameState]]`: Checkpoints stored when entering Sandbox mode.
- `GAME_HISTORY: Dict[str, List[GameState]]`: Historical snapshots preserved for creator rollback operations.
- `GAME_SUMMARIES: Dict[str, MultiplayerGameSummary]`: Room registry for match browser and lobby display.

---

## Running the Backend

### Using the Python Quickstart
```bash
python quickstart.py --backend-only
```

### Manual Execution with Uvicorn
Activate the virtual environment and start Uvicorn directly from the `backend/` directory:
```bash
cd backend
source .venv/bin/activate       # macOS/Linux
# or .venv\Scripts\Activate.ps1 # Windows PowerShell

uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Interactive OpenAPI Documentation
Once running, OpenAPI documentation is automatically served by Swagger UI at:
- [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## Running Backend Tests

The backend includes 6 comprehensive pytest suites:
- `test_engine.py`: 76-province graph symmetry, split coasts, and adjacency.
- `test_adjudicator.py`: Official DATC combat scenarios, dislodgements, and retreat paths.
- `test_admin.py`: Creator authorization, timeline rollback, and board editing.
- `test_api_integration.py`: Route contracts, query parameter scoping, and state persistence.
- `test_surrender_leave.py`: Seat vacating, player surrender, and civil disorder mechanics.
- `test_validator.py`: Pre-flight blunder diagnostics across all three game phases.

Run all tests from the repository root:
```bash
python -m pytest backend/ -v
```
