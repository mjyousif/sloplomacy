# Sloplomacy (1901 Tactical Engine & Atlas)

[![CI](https://github.com/mjyousif/sloplomacy/actions/workflows/ci.yml/badge.svg)](https://github.com/mjyousif/sloplomacy/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3.0-blue.svg)](LICENSE)
![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)
[![Rules: DATC Standard 1901](https://img.shields.io/badge/Rules-DATC_Standard_1901-7952B3)](docs/backend/adjudicator.md)

An interactive web-based tactical adjudicator, move-planner, and map visualizer for standard 1901 Diplomacy.

> **Disclaimer**: *Sloplomacy* is an independent, non-commercial open-source tactical tool. *Diplomacy* is a registered trademark of Hasbro, Inc. This project is not affiliated with, sponsored by, or endorsed by Hasbro, Inc. or Renegade Game Studios. See [ATTRIBUTION.md](ATTRIBUTION.md) for full notices.

## Quick Start (Run Locally)

You can launch both the **FastAPI backend** (`http://127.0.0.1:8000`) and the **Vite React frontend** (`http://localhost:5173`) with a single command:

### Windows (PowerShell)
```powershell
.\start.ps1
```
> Or run in separate terminal windows:
> ```powershell
> .\start.ps1 -SeparateWindows
> ```

### Windows (Command Prompt / Double Click)
```cmd
start.bat
```

### macOS / Linux / WSL / Git Bash
```bash
chmod +x start.sh
./start.sh
```

### Cross-Platform (Python)
```bash
python quickstart.py
```

---

## What the Quick Start Script Does
1. **Prerequisite Check**: Verifies that Python 3.8+ and Node.js/npm are available.
2. **Backend Setup**: Initializes `backend/.venv` and installs dependencies from `backend/requirements.txt` if needed.
3. **Frontend Setup**: Installs `frontend/node_modules` if needed.
4. **Concurrent Execution**: Launches both the FastAPI server (`:8000`) and Vite dev server (`:5173`).
5. **Auto-open Browser**: Opens `http://localhost:5173` automatically.
6. **Graceful Shutdown**: Press `Ctrl+C` in the terminal to cleanly terminate both processes.

### Additional Command Line Options
- `python quickstart.py --no-open`: Run servers without opening a browser window.
- `python quickstart.py --backend-only`: Run only the FastAPI backend server.
- `python quickstart.py --frontend-only`: Run only the Vite frontend dev server.
- `python quickstart.py --setup-only`: Install dependencies without starting servers.
- `python quickstart.py --test`: Run the backend test suite and verify the frontend build.

### Developer Scripts & QoL Tools (`scripts/`)
Dedicated scripts for development and operations are available under [`scripts/`](scripts/):
- **Unified Test Suite**: `.\scripts\test.ps1` *(or `./scripts/test.sh`)* — Runs backend pytest, frontend Vitest, typechecks, and bundle builds.
- **Environment Setup**: `.\scripts\setup.ps1` *(or `./scripts/setup.sh`)* — Bootstraps Python `.venv` and `frontend/node_modules`.
- **Local Dev Server**: `.\scripts\dev.ps1` *(or `./scripts/dev.sh`)* — Launches FastAPI and Vite dev servers.
- **Cloud Run Deployment**: `.\scripts\deploy.ps1` *(or `./scripts/deploy.sh`)* — One-click scale-to-zero container deployment.
- **CI/CD Setup**: `.\scripts\setup-ci-cd.ps1` *(or `./scripts/setup-ci-cd.sh`)* — Configures GCP IAM credentials for GitHub Actions.

---

## Ports & Endpoints
- **Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## Technical Documentation (`docs/`)

Comprehensive technical architecture, API references, and guides are organized under the [`docs/`](docs/README.md) directory:

- **Architecture**:
  - [System Overview & Data Flow](docs/architecture/system-overview.md)
  - [Data Models & Schemas](docs/architecture/data-models.md)
- **Backend Documentation**:
  - [Backend Architecture & Structure](docs/backend/README.md)
  - [REST API Endpoint Reference](docs/backend/api-reference.md)
  - [Adjudication Engine & DATC Rules](docs/backend/adjudicator.md)
  - [Validator & Tactical Sanity Checks](docs/backend/validator.md)
  - [Map Topology & Dual Coasts](docs/backend/map-data.md)
- **Frontend Documentation**:
  - [Frontend Architecture & Component Tree](docs/frontend/README.md)
  - [State Management & Sandbox Sync](docs/frontend/state-management.md)
  - [Europe Map SVG Renderer](docs/frontend/map-renderer.md)
  - [Macro Sidebar & Sanity Modal](docs/frontend/sidebar-and-controls.md)
  - [Styling, Themes & Cartography](docs/frontend/styling-and-themes.md)
- **Guides & References**:
  - [Agent & Contributor Operational Guide](AGENTS.md)
  - [Development & Testing Guide](docs/guides/development.md)
  - [Google Cloud Serverless Deployment Blueprint](docs/guides/google-cloud-deployment.md)
  - [Standard 1901 Diplomacy Rulebook Reference](docs/guides/rulebook-reference.md)

---

## License & Legal Attributions

- **License**: Licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
- **Attributions**: Complete game design, cartography, typography, and library notices are documented in [ATTRIBUTION.md](ATTRIBUTION.md).
