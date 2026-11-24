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
  - Don't re-export names from `main.py` for tests. Tests import a name from the module that owns it and patch it there: `storage.supabase.<fn>` for the Supabase calls (production calls them through the `supabase` module, so one patch covers every caller, the game socket included), `storage.store.<fn>` for store/persistence helpers (`GAMES`, `persist_game`), `engine.turn_service.<fn>` for turn-lifecycle helpers (`execute_adjudication`, `tick_timer`).
- **Domain-Driven Modular Routers (`backend/api/`)**:
  - All endpoints belong in domain routers:
    - `api/account.py`: Account profile management (public display name updates and game sync).
    - `api/games.py`: Game room lifecycle: lobby list, creation, loading, deletion, saving a sandbox.
    - `api/lobby.py`: Paged/filtered public lobby browser (`/api/games/browse`) and the caller's own games (`/api/games/mine`).
    - `api/seats.py`: Seats in a match: joining, leaving, surrendering, picking the active power, game-over acknowledgement.
    - `api/orders.py`: Move/retreat/build order submission, atomic batch orders, clearing orders.
    - `api/turns.py`: Finalization, simulation, adjudication trigger, phase clock endpoints (`require_timer_player`, `start_timer`, `vote`, `extend`, `ready`).
    - `api/sandbox.py`: Sandbox sessions, speculative simulation, scenario loading.
    - `api/solo_sandbox_helpers.py`: Personal draft solo sandbox creation, export, resume, and cleanup helpers.
    - `api/admin.py`: Creator/admin turn controls (status, rollback, set-turn, acknowledge, test seeding).
    - `api/admin_units.py`: Creator/admin atomic Direct-Edit board commit (`board-edit`: units, ownership, and orders).
    - `api/admin_utils.py`: Admin audit log recording, consolidated `"Admin"` history snapshots, and diff order generation.
    - `api/history.py`: Read-only resolved turn history and campaign statistics (`/api/history`, `/api/history/stats`).
    - `api/press.py`: Public box and private/anonymous press threads with optional order suggestions.
    - `api/websocket.py`: Live turn synchronization and WebSocket subscriptions (`/ws/games/{game_id}`, `/ws/lobby`).
  - When adding a new feature area or resource, create a new router in `backend/api/<resource>.py` and include it in `main.py`'s guarded router loop, so `saved_sandbox_guard` covers it. `test_every_api_route_is_behind_the_saved_sandbox_guard` fails otherwise.
- **Pure Core Engine (`backend/engine/`)**:
  - Keep adjudication, graph topology, AI calculation, turn-lifecycle orchestration (`turn_service.py`), and blunder validation independent of HTTP/FastAPI request contexts.
- **Data & Models (`backend/domain/`)**:
  - Keep Pydantic models cleanly structured. Split out request/response DTOs if domain models become too dense.
- **State & Persistence (`backend/storage/`)**:
  - Maintain the clean separation between in-memory store (`store.py`) and external persistence (`supabase.py`).
- **Security & Authorization (`backend/security/`)**:
  - Keep token validation (`auth.py`) and viewer state masking (`secrecy.py`) isolated and reusable.
- **Backend Shared-Helpers Catalog**:
  - `engine/turn_service.py`: `publish_game_state`, `execute_adjudication`, `tick_timer`, `refresh_timer`, `timer_players`
  - `engine/order_utils.py`: `turn_label`, `reject_stale_turn`, `reject_if_game_over`, `reject_if_surrendered`, `refresh_diagnostics_and_simulation`, `create_default_orders`
  - `storage/store.py`: `resolve_game`, `resolve_game_with_summary`, `delete_game_everywhere`, `is_private_sandbox`, `persist_game`, `sync_summary`, `evict_game`
  - `security/secrecy.py`: `sanitize_game_state_for_viewer`, `sanitize_summary_for_viewer`, `require_seat_holder`, `require_own_seat`, `verify_power_authorization`, `verify_admin_access`, `require_view_access`
  - `ws/connection_manager.py`: `build_game_update_payload`, `build_lobby_update_payload`, `broadcast_game_update`, `broadcast_lobby_update`

## 3. Frontend Modularity (`frontend/src/`)

- **Feature-Based Subcomponent Folders**:
  - High-complexity components must decompose their visual sub-layers, modals, or tab views into dedicated subdirectories under `components/<feature>/`:
    - `components/map/`: SVG sub-layers (`ProvincePolygon.tsx`, `SupplyCentersLayer.tsx`, `MapNamesLayer.tsx`, `StaticLayers.tsx`, `curveGeometry.ts`).
    - `components/macro/`: Unit order cards (`UnitMacroCard.tsx`), build quota cards (`BuildSlotCard.tsx`).
    - `components/lobby/`: The public game browser (`GameBrowser.tsx` with its rows, filters and pager), creation panels (`CreateCampaignPanel.tsx`), the private-campaign dialog.
    - `components/admin/`: Admin settings menu and modal controls (`AdminSettingsMenu.tsx`, `TurnControlTab.tsx`, `AdminActionWarningModal.tsx`).
- **Hook Extraction for Stateful Logic (`frontend/src/hooks/`)**:
  - Extract complex state management, WebSockets, media queries, or device preferences into custom hooks (e.g., `useDiplomacyWebSocket.ts`, `useCompactLayout.ts`, `useDisplayPrefs.ts`) instead of jamming hundreds of lines of `useEffect` into `App.tsx`.
- **Pure Functional Utilities (`frontend/src/utils/`)**:
  - Mathematics, pathing, reachability, permissions, and formatting logic belong in pure utility modules with dedicated Vitest tests (`orderHelpers.ts`, `mapCameraHelpers.ts`, `adminHelpers.ts`, `timerHelpers.ts`).

## 4. Test Suite Partitioning

- Avoid single 1,000+ line test suites.
- Unit tests mirror the package they cover (`tests/unit/engine/validator/test_legality.py` for `engine/validator/legality.py`); integration tests go under `tests/integration/`, grouped by router or feature (`tests/integration/api/turn_clock/`).
- Shared fixtures go in the folder's `conftest.py`, plain helpers in a `helpers.py` beside the tests. Don't copy a helper into two test files.
- Each test file must pass on its own. Seed what it needs (lobbies, a fresh board) in a fixture instead of relying on tests that run earlier.
- For frontend, keep tests close to their code: `Component.test.tsx` or `helper.test.ts`.

## 5. Review Checklist for Agents

Before concluding any refactor or feature:
1. Run `git diff --stat origin/main` to inspect changed files.
2. Check if any modified file exceeded 500 lines or grew substantially without modular extraction.
3. Ensure no new API endpoints were added directly to `backend/main.py`.
4. Ensure new UI elements are extracted to subcomponents rather than inlined as hundreds of JSX lines in `App.tsx` or `EuropeMap.tsx`.
