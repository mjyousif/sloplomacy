# Diplomacy 1901 Tactical Engine — Documentation

Welcome to the comprehensive technical documentation for the **Diplomacy 1901 Tactical Engine**, a web-based, real-time tactical adjudicator and visualizer for standard 1901 Diplomacy.

---

## Documentation Structure

```
docs/
├── README.md                      # Documentation index & architectural roadmap (this file)
├── architecture/
│   ├── system-overview.md         # Full-stack architecture, design principles & data flow
│   └── data-models.md             # Shared types, data contracts, schemas & serialization
├── backend/
│   ├── README.md                  # Backend overview, FastAPI setup & structure
│   ├── api-reference.md           # Complete REST API endpoint reference & schemas
│   ├── adjudicator.md             # Adjudication engine, DATC algorithm & resolution mechanics
│   ├── validator.md               # Pre-flight validator & tactical sanity check rules
│   └── map-data.md                # Province topologies, adjacencies & dual coasts
├── frontend/
│   ├── README.md                  # Frontend overview, component tree & tooling
│   ├── state-management.md        # Reactive state, API sync & sandbox checkpointing
│   ├── map-renderer.md            # Interactive EuropeMap SVG, layers, pan/zoom & click-to-order
│   ├── sidebar-and-controls.md    # MacroSidebar, unit order cards & SanityCheckModal
│   └── styling-and-themes.md      # Cartographic design system, power palettes & typography
└── guides/
    ├── development.md             # Setup, local workflows, testing & troubleshooting
    ├── google-cloud-deployment.md # GCP Cloud Run + Supabase scale-to-zero serverless deployment
    └── rulebook-reference.md      # Standard 1901 Diplomacy rules mapped to engine behavior
```

---

## Quick Navigation

### 1. System Architecture & Fundamentals
- [Full-Stack System Overview](architecture/system-overview.md): High-level system topology, request-response cycle, and real-time validation pipeline.
- [Data Models & Contracts](architecture/data-models.md): Complete specifications for `GameState`, `Order`, `Unit`, `ValidationIssue`, and `SimulationResult`.

### 2. Backend Engine (FastAPI & Python)
- [Backend Overview](backend/README.md): FastAPI service architecture, entry points, and test harness.
- [REST API Reference](backend/api-reference.md): Endpoints for fetching state, dispatching orders, pre-move simulation, turn adjudication, and sandbox checkpoints.
- [Adjudication Engine (adjudicator.py)](backend/adjudicator.md): Iterative DATC-inspired resolver for supports, support cuts, convoys, bounces, and dislodgements.
- [Order Validator & Sanity Checks (validator.py)](backend/validator.md): Diagnostics engine detecting illegal moves, self-bounces, friendly fire, and broken convoys.
- [Map Data & Adjacencies (map_data.py)](backend/map-data.md): Topology of all 75 playable European provinces, 34 supply centers, and complex split coasts (STP, SPA, BUL).

### 3. Frontend Application (React 19, TypeScript, Vite)
- [Frontend Architecture](frontend/README.md): React 19 structure, directory layout, and component interaction hierarchy.
- [State Management & API Sync](frontend/state-management.md): Server-authoritative synchronization, hypothetical sandbox branch/merge, and error recovery.
- [Europe Map Renderer](frontend/map-renderer.md): High-performance SVG renderer, transform matrix pan/zoom, interactive order arrows, and collision indicators.
- [Macro Sidebar & Sanity Modal](frontend/sidebar-and-controls.md): Order entry, batch actions, unit inspection, and pre-finalization warning modals.
- [Styling & Cartographic Theme](frontend/styling-and-themes.md): Antique brass and parchment design system, military cartography styling, and power-specific branding.

### 4. Guides & References
- [Developer Setup & Testing Guide](guides/development.md): Quickstart commands, running `pytest`, Vite building, and debugging recipes.
- [Diplomacy 1901 Rulebook Reference](guides/rulebook-reference.md): Exact correspondence between classic 1901 rules and software implementation.

---

## Technology Stack Summary

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Backend API** | Python 3.8+, FastAPI, Pydantic v2, Uvicorn | Authoritative state, validation engine, and DATC adjudicator |
| **Frontend UI** | React 19, TypeScript, Vite, Lucide React | High-performance cartographic SVG map, reactive sidebar & sanity checks |
| **Data Protocol** | JSON REST over HTTP with CORS | Full state hydration and real-time diagnostic push/pull |
| **Testing** | Pytest (Backend engine tests), TypeScript (`tsc` check) | Verifies topology symmetry, bounce resolutions, and syntax contracts |
| **Orchestration** | Python `quickstart.py`, PowerShell `start.ps1`, Bash `start.sh` | One-command cross-platform multi-process runner |
