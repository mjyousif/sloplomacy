# System Architecture & Overview

The **Diplomacy 1901 Tactical Engine & Multiplayer Chancellery** is designed as a server-authoritative, real-time tactical workspace for standard 7-player *Diplomacy*. It pairs a lightweight, deterministic Python adjudication backend with an interactive, vectorized React client, an optional Supabase Auth/DB layer, and scale-to-zero Google Cloud Run hosting.

---

## Architectural Principles

1. **Server-Authoritative Game Logic**:
   All spatial adjacency calculations, validation diagnostics, support resolution, and season advancement are executed by the FastAPI server in Python. The client maintains an optimistic local representation for responsive interaction, but continuously synchronizes with authoritative server snapshots.
2. **Immediate Feedback & "Pre-Flight" Sanity Checking**:
   Unlike traditional play-by-email (PBEM) adjudicators that evaluate orders only at the turn deadline, this engine continuously runs the order validator (`validator.py`) and non-destructive resolution simulator (`adjudicator.py`) on every single user input across Movement, Retreats, and Adjustments phases.
3. **Hypothetical Sandbox ("War Room") Mode**:
   Players can toggle into Sandbox mode, allowing them to draft orders for rival Great Powers, simulate various tactical permutations, and step turns forward. When exiting Sandbox mode, all foreign moves are wiped clean and the real game state is restored.
4. **SVG-First Cartographic Rendering**:
   The game board is rendered via direct SVG vector mathematics, eliminating third-party canvas overhead and allowing custom DOM-level styling, smooth multi-touch/mouse wheel zooming and panning, and fine-grained visual order vectors.
5. **Scale-to-Zero Serverless Hosting**:
   Both the React SPA and FastAPI backend are packaged into a single unified Docker container, deployable to Google Cloud Run with scale-to-zero capability ($0 idle cost).

---

## High-Level Topology

```
+-----------------------------------------------------------------------------------------+
|                                    BROWSER CLIENT                                       |
|                                                                                         |
|   +-----------------------+              +--------------------------+                   |
|   |    EuropeMap.tsx      |              |     MacroSidebar.tsx     |                   |
|   |  - SVG Path Geometry  |<------------>|  - Unit Order Editors    |  Modals:          |
|   |  - Pan / Zoom Matrix  |  Local State |  - Power Selector        |  - AuthModal      |
|   |  - Visual Order Arrows|  (App.tsx)   |  - Validation Warnings   |  - LobbyView      |
|   |  - Battle Indicators  |              |  - Turn & History log    |  - AdminToolsModal|
|   +-----------------------+              +--------------------------+  - SurrenderModal |
|                               ^                                        - SanityCheck    |
|                               | JSON REST via fetch() (?game_id=...)                    |
+-------------------------------|---------------------------------------------------------+
                                v
+-----------------------------------------------------------------------------------------+
|                             FASTAPI BACKEND (:8000 / Cloud Run)                         |
|                                                                                         |
|                       +------------------------------------+                            |
|                       |              main.py               |                            |
|                       |  REST Routes, Multi-Game Registry, |                            |
|                       |  Admin Handlers & Static SPA Mount |                            |
|                       +-----------------+------------------+                            |
|                                         |                                               |
|                 +-----------------------+-----------------------+                       |
|                 |                                               |                       |
|                 v                                               v                       |
|     +----------------------+                       +--------------------------+         |
|     |     validator.py     |                       |      adjudicator.py      |         |
|     |  - Legality checks   |                       |  - 'diplomacy' engine    |         |
|     |  - Blunder detection |                       |  - Movement, Retreats,   |         |
|     |  - Movement, Retreats|                       |    and Winter Adjustments|         |
|     |    and Builds checks |                       |  - Non-destructive Sim   |         |
|     +----------------------+                       +--------------------------+         |
|                 ^                                               ^                       |
|                 +-----------------------+-----------------------+                       |
|                                         |                                               |
|                              +----------v-----------+                                   |
|                              |     map_data.py      |                                   |
|                              |  - 76 Provinces      |                                   |
|                              |  - Army/Fleet graph  |                                   |
|                              |  - Coasts & Centers  |                                   |
|                              +----------------------+                                   |
+-----------------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------------+
|                              SUPABASE PERSISTENCE (Optional)                            |
|  - Supabase Auth (Email, Google/Discord OAuth)                                          |
|  - PostgreSQL Database (Profiles, Multiplayer Matches, RLS Policies)                    |
+-----------------------------------------------------------------------------------------+
```

---

## State Synchronization Flow

The game client communicates with the server via scoped HTTP JSON endpoints:

```
User Action (e.g. Move Unit)
             │
             ▼
  App.handleUpdateOrder()
             │
             ▼
POST /api/order?game_id={id} { order: Order }
             │
             ├──► 1. Update order in GAMES[game_id].orders
             ├──► 2. Execute validator.validate_orders()
             ├──► 3. Execute adjudicator.adjudicate_turn(..., is_simulation=True)
             └──► 4. Return updated GameState
             │
             ▼
App.applyServerState(st)
             │
             ├──► Update units and orders in React state
             ├──► Update ValidationIssue list in MacroSidebar
             └──► Re-render SVG order arrows and simulation markers
```

---

## Sandbox Checkpointing Workflow

Sandbox Pre-Move Mode lets commanders play out "what-if" scenarios:

1. **Enter Sandbox (`POST /api/sandbox/enter?game_id={id}`)**:
   - The backend deep-copies `GAMES[game_id]` to `SANDBOX_CHECKPOINTS[game_id]`.
2. **Hypothetical Exploration**:
   - The commander can switch perspectives to any Great Power and draft enemy movements.
   - Non-destructive simulation projects outcomes immediately onto the board.
3. **Exit Sandbox (`POST /api/sandbox/exit?game_id={id}`)**:
   - The checkpoint is restored.
   - The commander's active-nation orders are preserved and merged back.
   - All foreign hypothetical orders are purged so they never contaminate the match state.
