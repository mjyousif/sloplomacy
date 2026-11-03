# Local Development & Testing Guide

This guide covers developer workflows, running the local development environment, testing, and debugging the Diplomacy 1901 Tactical Engine.

---

## Prerequisites

- **Python**: Version 3.8 or newer (with `pip` and `venv`).
- **Node.js**: Version 18.0 or newer (with `npm`).
- **Git** (optional).

---

## Quickstart (Single Command)

Launch both the FastAPI backend (`:8000`) and the Vite React frontend (`:5173`) with a single command:

### Windows (PowerShell)
```powershell
.\start.ps1
```
> To run each server in its own separate terminal window:
> ```powershell
> .\start.ps1 -SeparateWindows
> ```

### macOS / Linux / WSL / Git Bash
```bash
chmod +x start.sh
./start.sh
```

### Cross-Platform Python Runner
```bash
python quickstart.py
```

### CLI Flags for `quickstart.py`
- `python quickstart.py --no-open`: Run servers without launching the web browser.
- `python quickstart.py --backend-only`: Start only the FastAPI backend on port `8000`.
- `python quickstart.py --frontend-only`: Start only the Vite dev server on port `5173`.
- `python quickstart.py --setup-only`: Install Python venv and npm packages without launching servers.
- `python quickstart.py --test`: Run the complete backend test suite and verify frontend build.

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

# Install requirements
pip install -r requirements.txt

# Run dev server with auto-reload
uvicorn main:app --reload --host 127.0.0.1 --port 8000
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

---

## Running the Automated Test Suite

### Running Backend Tests (`pytest`)
Backend tests live in `backend/test_engine.py` and cover:
- 76-province graph symmetry (army and fleet bidirectionality)
- All 34 supply center declarations
- Pre-flight validator blunder detection (`SELF_BOUNCE`, `UNMATCHED_SUPPORT`)
- Adjudicator resolution, support cuts, and supported advances

Run tests from the root or backend directory:
```bash
pytest backend/test_engine.py -v
```

### Running Frontend Typechecks & Linting
Ensure no type regression or API contract drift exists:
```bash
cd frontend
npx tsc --noEmit
```

---

## Troubleshooting & FAQ

### Port 8000 or 5173 Already in Use
- Terminate any dangling Python or Node processes:
  ```powershell
  # Windows PowerShell
  Get-Process -Name python, node -ErrorAction SilentlyContinue | Stop-Process
  ```
  ```bash
  # Linux/macOS
  killall python uvicorn node
  ```

### Backend Virtual Environment Not Found
- Run `python quickstart.py --setup-only` to automatically regenerate `.venv` and install all required packages.

### Frontend API Proxy 502 / Connection Refused
- Confirm the backend is running at `http://127.0.0.1:8000`.
- Open `http://127.0.0.1:8000/api/game` in your browser to verify API health.
