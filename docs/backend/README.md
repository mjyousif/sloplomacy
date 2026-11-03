# Backend Architecture (FastAPI)

The backend service is located in the `backend/` directory. It is built with **FastAPI** and **Pydantic**, providing a stateless-capable, high-speed tactical evaluation and adjudication engine for Diplomacy 1901.

---

## Directory Structure

```
backend/
├── main.py              # FastAPI app instance, route definitions, and sandbox state
├── models.py            # Pydantic v2 schemas and enumerations
├── adjudicator.py       # Iterative DATC turn adjudication & simulation engine
├── validator.py         # Real-time tactical sanity checker and blunder detector
├── map_data.py          # Europe 1901 graph topology, province records & coastline rules
├── test_engine.py       # Pytest suite verifying topology symmetry and DATC rules
└── requirements.txt     # Python runtime dependencies
```

---

## Technical Dependencies

Listed in `backend/requirements.txt`:
```txt
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
pydantic>=2.6.0
pytest>=8.0.0
httpx>=0.27.0
```

---

## Core Execution Flow

```
HTTP Request (e.g. POST /api/order)
               │
               ▼
        FastAPI Router (main.py)
               │
               ├─► Update in-memory CURRENT_GAME.orders
               │
               ├─► refresh_diagnostics_and_simulation(game)
               │     ├── 1. validator.validate_orders(...) -> list[ValidationIssue]
               │     └── 2. adjudicator.adjudicate_turn(...) -> SimulationResult
               │
               ▼
     Return GameState / Response Model (JSON)
```

### In-Memory State & Checkpoints

The backend stores the ongoing game in module-level global state:
- `CURRENT_GAME: GameState`: The primary, authoritative match state.
- `SANDBOX_CHECKPOINT: Optional[GameState]`: Deep copy created when entering Sandbox mode via `POST /api/sandbox/enter`. When exiting via `POST /api/sandbox/exit`, the checkpoint is restored, foreign hypothetical orders are purged, and the player's own active-power orders are merged back.

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

The test suite in `backend/test_engine.py` validates graph integrity, map adjacency symmetry, split-coast reachability, and complex multi-unit adjudication scenarios.

Run tests using pytest:
```bash
pytest backend/test_engine.py -v
```
