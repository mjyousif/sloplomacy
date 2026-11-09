---
name: codebase-modularity
description: Use when adding, refactoring, or reviewing code in this codebase. Guides modular architecture, file size ceilings, single-responsibility extraction, and monolith prevention across backend routers and frontend components.
---

# Codebase Modularity & Monolith Prevention Guide

This repository enforces strict modularity and separation of concerns to prevent files from growing into unmaintainable monoliths.

## 1. File Size Guardrails & Decomposition Thresholds

- **Target Size**: 150 – 350 lines per file for most business logic, components, routers, and test suites.
- **Ceiling / Hard Threshold**: **500 lines**.
  - Any new file exceeding 500 lines is a code smell and must be decomposed before merging.
  - Large declarative data tables (e.g. `frontend/src/data/europeMapGeometry.ts` holding SVG coordinates or `backend/engine/topology/provinces.py` holding the 76-province adjacency map) are explicit exceptions, provided they contain pure static declarations with zero tangled logic.
- **The Ratchet Rule for Existing Large Files**:
  - Existing files that exceed the ceiling (e.g., `EuropeMap.tsx`, `App.tsx`, `MacroSidebar.tsx`) must NOT receive new monolithic blocks of logic.
  - When modifying an existing large file, follow the ratchet principle: extract touched features, handlers, subcomponents, or hooks into separate files under the appropriate sub-package or feature folder. Every PR touching a large file should leave it smaller or at least no more bloated.

## 2. Backend Modularity (`backend/`)

- **`backend/main.py` is an Assembler, Not a Dumping Ground**:
  - `main.py` must only configure CORS, security headers, middleware, lifetime events, and include routers via `app.include_router()`.
  - **Never add route handlers (`@app.get`, `@app.post`) directly to `main.py`**.
  - Don't re-export names from `main.py` for tests. Tests import a name from the module that owns it and patch it there: `storage.supabase.<fn>` for the Supabase calls (production calls them through the `supabase` module, so one patch covers every caller, the game socket included), `storage.store.GAMES` for the store, `api.turns.<fn>` for turn helpers.
- **Domain-Driven Modular Routers (`backend/api/`)**:
  - All endpoints belong in domain routers:
    - `api/games.py`: Game room lifecycle: lobby list, creation, loading, deletion, saving a sandbox.
    - `api/seats.py`: Seats in a match: joining, leaving, surrendering, picking the active power.
    - `api/orders.py`: Move/retreat/build order submission, atomic batch orders.
    - `api/turns.py`: Finalization, turn adjudication, timer votes/extensions.
    - `api/sandbox.py`: Sandbox sessions, simulation, AI moves.
    - `api/admin.py`: Creator/admin turn controls (status, rollback, set-turn, unfinalize-all, test seeding).
    - `api/admin_units.py`: Creator/admin board overrides (teleport, unit spawning/deletion, ownership).
    - `api/websocket.py`: Live turn synchronization and WebSocket subscriptions.
  - When adding a new feature area or resource, create a new router in `backend/api/<resource>.py` and include it in `main.py`'s guarded router loop, so `saved_sandbox_guard` covers it. `test_every_api_route_is_behind_the_saved_sandbox_guard` fails otherwise.
- **Pure Core Engine (`backend/engine/`)**:
  - Keep adjudication, graph topology, AI calculation, and blunder validation independent of HTTP/FastAPI request contexts.
- **Data & Models (`backend/domain/`)**:
  - Keep Pydantic models cleanly structured. Split out request/response DTOs if domain models become too dense.
- **State & Persistence (`backend/storage/`)**:
  - Maintain the clean separation between in-memory store (`store.py`) and external persistence (`supabase.py`).
- **Security & Authorization (`backend/security/`)**:
  - Keep token validation (`auth.py`) and viewer state masking (`secrecy.py`) isolated and reusable.

## 3. Frontend Modularity (`frontend/src/`)

- **Feature-Based Subcomponent Folders**:
  - High-complexity components must decompose their visual sub-layers, modals, or tab views into dedicated subdirectories under `components/<feature>/`:
    - `components/map/`: SVG sub-layers (`ProvincePolygon.tsx`, `SupplyCentersLayer.tsx`, `MapNamesLayer.tsx`, `StaticLayers.tsx`, `curveGeometry.ts`).
    - `components/macro/`: Unit order cards (`UnitMacroCard.tsx`), build quota cards (`BuildSlotCard.tsx`).
    - `components/lobby/`: Game cards (`GameRoomCard.tsx`), creation panels (`CreateCampaignPanel.tsx`), passcode dialogs.
    - `components/admin/`: Admin tab controls (`TurnControlTab.tsx`, `UnitTeleportTab.tsx`, `UnitSpawnerTab.tsx`, `TerritoryControlTab.tsx`).
- **Hook Extraction for Stateful Logic (`frontend/src/hooks/`)**:
  - Extract complex state management, WebSockets, media queries, or device preferences into custom hooks (e.g., `useDiplomacyWebSocket.ts`, `useCompactLayout.ts`, `useDisplayPrefs.ts`) instead of jamming hundreds of lines of `useEffect` into `App.tsx`.
- **Pure Functional Utilities (`frontend/src/utils/`)**:
  - Mathematics, pathing, reachability, permissions, and formatting logic belong in pure utility modules with dedicated Vitest tests (`orderHelpers.ts`, `mapCameraHelpers.ts`, `adminHelpers.ts`, `timerHelpers.ts`).

## 4. Test Suite Partitioning

- Avoid single 1,000+ line test suites.
- Group tests into domain-specific modules (e.g. `tests/unit/test_validator.py`, `tests/integration/test_adjudicator.py`, `tests/integration/test_websocket_sync.py`).
- For frontend, keep tests close to their code: `Component.test.tsx` or `helper.test.ts`.

## 5. Review Checklist for Agents

Before concluding any refactor or feature:
1. Run `git diff --stat origin/main` to inspect changed files.
2. Check if any modified file exceeded 500 lines or grew substantially without modular extraction.
3. Ensure no new API endpoints were added directly to `backend/main.py`.
4. Ensure new UI elements are extracted to subcomponents rather than inlined as hundreds of JSX lines in `App.tsx` or `EuropeMap.tsx`.
