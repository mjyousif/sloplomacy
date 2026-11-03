# System Architecture & Overview

The **Diplomacy 1901 Tactical Engine** is designed as a server-authoritative, real-time tactical workspace for the 7-player strategy game *Diplomacy*. It pairs a lightweight, deterministic Python adjudication backend with an interactive, vectorized React client.

---

## Architectural Principles

1. **Server-Authoritative Game Logic**:
   All spatial adjacency calculations, validation diagnostics, support resolution, and season advancement are executed by the FastAPI server in Python. The client maintains an optimistic local representation for responsive interaction, but continuously synchronizes with authoritative server snapshots.
2. **Immediate Feedback & "Pre-Flight" Sanity Checking**:
   Unlike traditional play-by-email (PBEM) adjudicators that evaluate orders only at the turn deadline, this engine continuously runs the order validator (`validator.py`) and non-destructive resolution simulator (`adjudicator.py`) on every single user input. Potential disasters—such as unintentional self-bounces or cut supports—are flagged immediately.
3. **Hypothetical Sandbox ("War Room") Mode**:
   Players can toggle into Sandbox mode, allowing them to draft orders for rival Great Powers, simulate various tactical permutations, and step turns forward. When exiting Sandbox mode, all foreign moves are wiped clean and the real game state is restored.
4. **SVG-First Cartographic Rendering**:
   The game board is rendered via direct SVG vector mathematics, eliminating third-party canvas overhead and allowing custom DOM-level styling, smooth multi-touch/mouse wheel zooming and panning, and fine-grained visual order vectors.

---

## High-Level Topology

```
+-------------------------------------------------------------------------+
|                              WEB BROWSER                                |
|                                                                         |
|   +-----------------------+              +--------------------------+   |
|   |    EuropeMap.tsx      |              |     MacroSidebar.tsx     |   |
|   |  - SVG Path Geometry  |<------------>|  - Unit Order Editors    |   |
|   |  - Pan / Zoom Matrix  |  Local State |  - Power Selector        |   |
|   |  - Visual Order Arrows|  (App.tsx)   |  - Validation Warnings   |   |
|   |  - Battle Indicators  |              |  - Turn & History log    |   |
|   +-----------------------+              +--------------------------+   |
|                               ^                                         |
|                               | JSON REST via fetch()                   |
+-------------------------------|-----------------------------------------+
                                v
+-------------------------------------------------------------------------+
|                        FASTAPI BACKEND (:8000)                          |
|                                                                         |
|                       +----------------------+                          |
|                       |       main.py        |                          |
|                       |  REST Route Handlers |                          |
|                       +----------+-----------+                          |
|                                  |                                      |
|                 +----------------+---------------+                      |
|                 |                                |                      |
|                 v                                v                      |
|     +----------------------+        +-----------------------+           |
|     |     validator.py     |        |    adjudicator.py     |           |
|     |  - Legality checks   |        |  - Support resolution |           |
|     |  - Blunder detection |        |  - Fixed-point cuts   |           |
|     |  - 10 diagnostic codes|       |  - Dislodgement calc  |           |
|     +----------------------+        +-----------------------+           |
|                 ^                                ^                      |
|                 +----------------+---------------+                      |
|                                  |                                      |
|                       +----------v-----------+                          |
|                       |     map_data.py      |                          |
|                       |  - 76 Provinces      |                          |
|                       |  - Army/Fleet graph  |                          |
|                       |  - Coasts & Centers  |                          |
|                       +----------------------+                          |
+-------------------------------------------------------------------------+
```

---

## State Synchronization Flow

The game client communicates with the server via HTTP JSON endpoints:

```
User Action (e.g. Move Unit)
             │
             ▼
  App.handleUpdateOrder()
             │
             ▼
POST /api/order { order: Order }
             │
             ├──► 1. Update order in memory (CURRENT_GAME.orders)
             ├──► 2. Execute validator.validate_orders()
             ├──► 3. Execute adjudicator.adjudicate_turn() [Simulation]
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

1. **Enter Sandbox (`POST /api/sandbox/enter`)**:
   - The backend deep-copies `CURRENT_GAME` into `SANDBOX_CHECKPOINT`.
   - The UI displays an amber warning banner denoting Sandbox Mode.
2. **Drafting Multi-Power Moves**:
   - The user can select any power (England, France, Germany, etc.) and issue orders for their units.
   - The backend validates all moves and recalculates simulation outcomes across all nations.
3. **Exit Sandbox (`POST /api/sandbox/exit`)**:
   - If the player stepped turns forward or experimented with rival powers, `SANDBOX_CHECKPOINT` is restored.
   - The user's active power orders for the current season are preserved.
   - All foreign hypothetical orders are purged back to default `HOLD`.
