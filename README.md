# Sloplomacy (1901 Tactical Engine & Multiplayer Chancellery)

[![CI](https://github.com/mjyousif/sloplomacy/actions/workflows/ci.yml/badge.svg)](https://github.com/mjyousif/sloplomacy/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Demo-Cloud_Run-4285F4?logo=googlecloud&logoColor=white)](https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3.0-blue.svg)](LICENSE)
![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.162+-009688?logo=fastapi&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-7.x-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)
[![Rules: DATC Standard 1901](https://img.shields.io/badge/Rules-DATC_Standard_1901-7952B3)](docs/backend/adjudicator.md)

An interactive web-based tactical adjudicator, move-planner, and real-time multiplayer chancellery for standard 1901 Diplomacy.

> 🌐 **Live Cloud Demo**: Play and test the engine online at **[https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app](https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app)** (hosted serverless on Google Cloud Run with scale-to-zero).

> **Disclaimer**: *Sloplomacy* is an independent, non-commercial open-source tactical tool. *Diplomacy* is a registered trademark of Hasbro, Inc. This project is not affiliated with, sponsored by, or endorsed by Hasbro, Inc. or Renegade Game Studios. See [ATTRIBUTION.md](ATTRIBUTION.md) for full notices.

---

## ✨ Key Features & Capabilities

- 🗺️ **Authentic Vector Cartography & Visual Orders**: Full interactive SVG board covering all 76 European provinces, 34 Supply Centers, and split coasts (`STP`, `SPA`, `BUL`). Orders render as color-coded movement paths, support lines, convoy links, and hold rings with procedural sea wave styling.
- ⚖️ **Authoritative DATC Adjudication Engine**: Resolves full 1901 Diplomacy rules via the official Python `diplomacy` package across all standard phases:
  - **Movement (`M`)**: Spring & Fall maneuver resolution, complex multi-power bounces, and cut supports.
  - **Retreats (`R`)**: Legal dislodgement retreats, contested retreat bounces, and tactical disbands.
  - **Winter Adjustments (`A`)**: Supply center accounting, home center builds, and forced disbands.
- 🛡️ **Real-Time Tactical Validator & Blunder Detection**: Pre-flight linting engine alerts commanders to invalid reachability, cut supports, fleet coast collisions, or dislodgement risks before final order submission.
- 🌐 **Real-Time Multiplayer & Consensus Engine**: Multi-room game lobbies, 7-power seat claiming, live state broadcasts via WebSockets, and consensus-driven phase auto-resolution when all active commanders finalize orders.
- 🧪 **Sandbox "War Room" & Heuristic AI**: Experiment with hypothetical maneuvers for all 7 Great Powers in an isolated scratchpad without altering live multiplayer match state. Includes one-click heuristic AI move generation.
- 🛠️ **Administrative & Gamemaster Suite**: Built-in god-mode tools for tournament directors and scenario creators: unit teleportation, unit spawning, phase rollback, turn jumping, and power state resets.
- 🗂️ **Dual Collapsible Tactical HUD**: Ergonomic dual-sidebar interface featuring quick-access tools and room navigation on the left, with interactive order builders, diagnostics, and consensus progress on the right.

---

## 🏗️ Architecture & Tech Stack

```
                             BROWSER CLIENT
      React 19 + TypeScript + Vite + Lucide React + Supabase Auth
                                   │
              REST JSON API & WebSockets (Proxied /api, /ws)
                                   ▼
                             FASTAPI SERVER
                Pydantic v2 Models + In-Memory Registry
                     (Google Cloud Run Serverless)
                     │                           │
                     ▼                           ▼
            ADJUDICATION ENGINE          VALIDATION ENGINE
          python 'diplomacy' lib        Pre-flight legality &
        (DATC Movement/Retreat/Build)    tactical blunder check
                     │                           │
                     └─────────────┬─────────────┘
                                   ▼
                          MAP TOPOLOGY GRAPH
                      76 Provinces, Coasts, 34 SCs
```

| Component | Technologies | Role in System |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, TypeScript, Vite, SVG, Lucide React | GPU-accelerated cartography, interactive tactical HUD, and order canvas |
| **Backend Engine** | Python 3.10+, FastAPI, Pydantic v2, Uvicorn | Authoritative room state, WebSockets sync, and REST endpoints |
| **Adjudication** | `diplomacy` (DATC-compliant library) | Official deterministic resolution of moves, retreats, and adjustments |
| **Auth & Database** | Supabase Auth, PostgreSQL, RLS *(optional)* | Multi-user authentication, OAuth providers, and user profiles |
| **Deployment / IaC** | Docker, Google Cloud Run, Cloud Build, Terraform | Scale-to-zero serverless container hosting ($0 idle cost) |

---

## 🚀 Live Demo & Endpoints

- **Live Cloud Deployment**: [https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app](https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app)
- **Cloud Run Swagger Docs**: [https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app/docs](https://diplomacy-1901-rrwl6tgtaa-uc.a.run.app/docs)
- **Local Frontend App**: [http://localhost:5173](http://localhost:5173)
- **Local Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Local Interactive Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 💻 Quick Start (Run Locally)

You can launch both the **FastAPI backend** (`http://127.0.0.1:8000`) and the **Vite React frontend** (`http://localhost:5173`) with a single command:

### Windows (PowerShell)
```powershell
.\scripts\dev.ps1
```
> Or run in separate terminal windows:
> ```powershell
> .\scripts\dev.ps1 -SeparateWindows
> ```

### Windows (Command Prompt / Double Click)
```cmd
scripts\start.bat
```

### macOS / Linux / WSL / Git Bash
```bash
./scripts/dev.sh
```

### Cross-Platform (Python)
```bash
python scripts/quickstart.py
```

---

## What the Quick Start Script Does
1. **Prerequisite Check**: Verifies that Python 3.10+ and Node.js/npm are available.
2. **Backend Setup**: Initializes `backend/.venv` and installs dependencies from `backend/requirements.txt` if needed.
3. **Frontend Setup**: Installs `frontend/node_modules` if needed.
4. **Concurrent Execution**: Launches both the FastAPI server (`:8000`) and Vite dev server (`:5173`).
5. **Auto-open Browser**: Opens `http://localhost:5173` automatically.
6. **Graceful Shutdown**: Press `Ctrl+C` in the terminal to cleanly terminate both processes.

### Additional Command Line Options
- `python scripts/quickstart.py --no-open`: Run servers without opening a browser window.
- `python scripts/quickstart.py --backend-only`: Run only the FastAPI backend server.
- `python scripts/quickstart.py --frontend-only`: Run only the Vite frontend dev server.
- `python scripts/quickstart.py --setup-only`: Install dependencies without starting servers.
- `python scripts/quickstart.py --test`: Run the backend test suite and verify the frontend build.

### Developer Scripts & QoL Tools (`scripts/`)
Dedicated scripts for development and operations are available under [`scripts/`](scripts/):
- **Unified Test Suite**: `.\scripts\test.ps1` *(or `./scripts/test.sh`)* — Runs backend pytest, frontend Vitest, typechecks, and bundle builds.
- **Environment Setup**: `.\scripts\setup.ps1` *(or `./scripts/setup.sh`)* — Bootstraps Python `.venv` and `frontend/node_modules`.
- **Local Dev Server**: `.\scripts\dev.ps1` *(or `./scripts/dev.sh`)* — Launches FastAPI and Vite dev servers.
- **Cloud Run Deployment**: `.\scripts\deploy.ps1` *(or `./scripts/deploy.sh`)* — One-click scale-to-zero container deployment.
- **CI/CD Setup**: `.\scripts\setup-ci-cd.ps1` *(or `./scripts/setup-ci-cd.sh`)* — Configures GCP IAM credentials for GitHub Actions.

---

## 📚 Technical Documentation (`docs/`)

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

## ⚖️ License & Legal Attributions

- **License**: Licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
- **Attributions**: Complete game design, cartography, typography, and library notices are documented in [ATTRIBUTION.md](ATTRIBUTION.md).
