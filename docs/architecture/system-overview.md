# System Overview & Architecture

The **Diplomacy 1901 Tactical Engine & Multiplayer Chancellery** is designed as a server-authoritative, real-time tactical workspace for standard 7-player *Diplomacy*. It pairs a lightweight, deterministic Python adjudication backend with an interactive, vectorized React client, a Supabase Auth/PostgreSQL persistence layer, and scale-to-zero Google Cloud Run hosting.

---

## Architectural Principles

1. **Stateless-Capable Adjudication with PostgreSQL Persistence**:
   - The adjudication engine treats each resolution step as a pure functional transition:
     $$\text{State}_{t+1} = \text{Adjudicate}(\text{State}_t, \text{Orders}_t)$$
   - Adjudication adheres strictly to official DATC rules via the Python `diplomacy` package.
   - When configured, game state is persisted to Supabase PostgreSQL (`public.multiplayer_games`) as JSONB on every mutation, while the FastAPI in-memory dictionary operates as a sub-millisecond L1 cache.
   - Survives Cloud Run container scale-to-zero teardown and multi-instance restarts with zero state loss.

2. **Client-Side Real-Time Responsiveness**:
   - Order validation, reachability checks, and tactical previews are rendered on the client canvas at 60 FPS without requiring round-trip network hops for intermediate dragging.
   - Live WebSocket synchronization connects commanders in the same match room or lobby.

3. **Zero Idle Cloud Spend**:
   - Unified single-container architecture deployed on Google Cloud Run with `--min-instances 0` allows the server to scale completely to zero when inactive, avoiding persistent database or compute fees.

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
|                 |                       |                       |                       |
|                 v                       v                       v                       |
|     +----------------------+  +--------------------+  +--------------------------+      |
|     |     validator.py     |  |    supabase.py     |  |      adjudicator/        |      |
|     |  - Legality checks   |  |  - PostgREST REST  |  |  - 'diplomacy' engine    |      |
|     |  - Blunder detection |  |  - JSONB upserts   |  |  - Movement, Retreats,   |      |
|     |  - Movement, Retreats|  |  - Read-thru cache |  |    and Winter Adjustments|      |
|     |    and Builds checks |  +---------+----------+  |  - Non-destructive Sim   |      |
|     +----------------------+            |             +--------------------------+      |
|                 ^                       |                           ^                   |
|                 +-----------------------+---------------------------+                   |
|                                         |                                               |
|                              +----------v-----------+                                   |
|                              |     topology.py      |                                   |
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
|  - PostgreSQL Database (Profiles, Multiplayer Matches, JSONB Game State, RLS Policies)  |
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
             ├──► 4. Persist to Supabase storage/supabase.py (JSONB upsert into public.multiplayer_games)
             └──► 5. Return updated GameState
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

Sandbox Pre-Move Mode lets commanders play out "what-if" scenarios. A multiplayer match is shared, so its players each work on a private copy:

1. **Enter**: `POST /api/sandbox/enter?game_id={match}` returns a copy under its own `sbx_` game id, with every other power on default orders so it cannot reveal their plans. The match is not touched.
2. **Explore**: Drafts, AI plans and previews use the `sbx_` id. The copy is never saved, listed or shown to other players, and the real match carries on without it.
3. **Exit**: `POST /api/sandbox/exit?game_id={sbx id}` discards the copy and returns the real match. The player's own changed orders carry over if the match is still on the same turn and they still hold the seat.

A solo or saved sandbox has one player, so it stays on its own game:

1. **Enter Sandbox (`POST /api/sandbox/enter?game_id={id}`)**:
   - The backend deep-copies `GAMES[game_id]` to `SANDBOX_CHECKPOINTS[game_id]`.
2. **Hypothetical Exploration**:
   - The commander can switch perspectives to any Great Power and draft enemy movements.
   - Non-destructive simulation projects outcomes immediately onto the board.
3. **Exit Sandbox (`POST /api/sandbox/exit?game_id={id}`)**:
   - The checkpoint is restored.
   - The commander's active-nation orders are preserved and merged back.
   - All foreign hypothetical orders are purged so they never contaminate the match state.
   - The cleaned state is persisted back to Supabase PostgreSQL.
