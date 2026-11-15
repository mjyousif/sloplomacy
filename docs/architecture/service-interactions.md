# Service Interactions & Frontend Communication

This document explains how the React frontend interacts with **Supabase Auth** and the **FastAPI backend** (REST APIs, WebSockets, L1 cache, and Sandbox isolation).

For the underlying PostgreSQL tables and Row-Level Security (RLS) policies, see [Database Setup & Row-Level Security](database.md).

---

## 1. Frontend-to-Services Topology

The React frontend (`frontend/src/`) talks to **two** external interfaces:
1. **Supabase Auth (`frontend/src/lib/supabase.ts`)**: Used *only* for user authentication (email/password, magic link OTP, Google/Discord OAuth, session refresh, and updating auth user metadata).
2. **FastAPI Backend (`backend/main.py` & `backend/api/*`)**: Serves all game state, lobby browsing, order submission, adjudication, turn history, press, sandboxing, and real-time WebSockets. In production (Cloud Run), FastAPI also serves the built Vite SPA static assets.

```mermaid
flowchart TB
    subgraph Browser["Browser Client (React 19 + TypeScript)"]
        AuthLib["lib/supabase.ts (Auth SDK & authedFetch)"]
        Hooks["App Hooks (useGameSession, useGameSync, useSeatActions, useMatchActions, useSandboxSession)"]
        WSClient["useDiplomacyWebSocket.ts"]
        PressStore["lib/pressStore.ts"]
        UI["UI Components (LobbyView, GameWorkspace, EuropeMap, MacroSidebar, ToolsSidebar)"]
    end

    subgraph Supabase["Supabase Cloud"]
        SupaAuth["Supabase Auth (JWT Issuer)"]
        Postgres["PostgreSQL (multiplayer_games, profiles)"]
    end

    subgraph Backend["FastAPI Server (Single Instance + L1 Cache)"]
        Security["security/auth.py & security/secrecy.py"]
        Routers["api/* Routers (account, lobby, games, seats, orders, turns, sandbox, admin, history, press)"]
        WSRouter["api/websocket.py & ws/connection_manager.py"]
        Engine["engine/ (adjudicator, validator, reachability, topology, ai)"]
        L1["storage/store.py (GAMES, GAME_SUMMARIES, GAME_HISTORY, GAME_PRESS, PROFILE_NAMES)"]
        DBClient["storage/supabase.py & storage/press.py (PostgREST Client)"]
    end

    UI --> Hooks
    UI --> PressStore
    Hooks -->|"getAuthHeaders / authedFetch"| AuthLib
    AuthLib <-->|"Login / OAuth / Refresh"| SupaAuth
    AuthLib -->|"HTTP JSON + Bearer JWT (/api/*)"| Routers
    WSClient <-->|"WebSocket (/ws/lobby, /ws/games/:id)"| WSRouter
    WSClient -->|"Push press updates"| PressStore

    Routers --> Security
    WSRouter --> Security
    Routers --> Engine
    Routers <--> L1
    WSRouter <--> L1
    L1 <-->|"Read-through & write-through (service_role)"| DBClient
    DBClient <-->|"HTTPS PostgREST (/rest/v1/*)"| Postgres
```

### In-Memory L1 Cache vs. PostgreSQL

- **Memory is authoritative for loaded games**: `GAMES` (`backend/storage/store.py`) acts as an in-memory L1 cache so order validation, reachability, and simulation run with sub-millisecond latency.
- **Startup hydration**: On FastAPI startup (`lifespan` in `backend/main.py`), the server loads `PROFILE_NAMES` and `GAME_SUMMARIES` from Supabase so the lobby is immediately populated without loading every full `game_state` into memory.
- **Lazy game loading**: When a player opens or connects to a `game_id` not yet in `GAMES`, the backend loads it from `multiplayer_games`, rebuilds derived `unit_options` (which are stripped before DB storage to save space), and caches it in `GAMES`.
- **Single-instance invariant**: Because `GAMES` and WebSocket rooms live in process memory, Cloud Run runs with `--max-instances 1`.

---

## 2. Key Service Interaction Flows

### A. Authentication & Authenticated API Call

```mermaid
sequenceDiagram
    actor User
    participant UI as React UI (AuthModal / App)
    participant SupaJS as lib/supabase.ts (Supabase JS)
    participant SupaAuth as Supabase Auth
    participant API as FastAPI Router (api/*)
    participant AuthDep as security/auth.py

    User->>UI: Sign in (Email / OAuth / Demo)
    UI->>SupaJS: signInWithPassword / signInWithOAuth
    SupaJS->>SupaAuth: Authenticate credentials
    SupaAuth-->>SupaJS: Session + Access JWT
    SupaJS-->>UI: onAuthStateChange (AuthUser)

    User->>UI: Perform action (Create Game / Submit Order)
    UI->>SupaJS: authedFetch("/api/...", init)
    SupaJS->>SupaJS: getSession() -> Authorization Bearer JWT
    SupaJS->>API: HTTP Request + Bearer JWT
    API->>AuthDep: get_current_user(credentials)
    AuthDep-->>API: Verified AuthUser (user_id, email)
    API-->>UI: Sanitized JSON Response
```

### B. Live Match Order Submission & WebSocket Broadcast

Because browsers cannot attach custom `Authorization` headers to a WebSocket upgrade request—and putting a JWT in the query string would leak it into server access logs—the game WebSocket uses a **post-connect auth handshake** (`?handshake=1`).

```mermaid
sequenceDiagram
    actor PlayerA as Player A (France)
    actor PlayerB as Player B (Germany)
    participant API as FastAPI (api/orders.py)
    participant Engine as validator & adjudicator
    participant DB as Supabase (multiplayer_games)
    participant WSMgr as ws/connection_manager.py

    Note over PlayerA,WSMgr: Socket Connection Handshake
    PlayerA->>WSMgr: Connect WS /ws/games/match_id?handshake=1
    WSMgr-->>PlayerA: accept()
    PlayerA->>WSMgr: Send auth payload (type=auth, token=JWT)
    WSMgr->>WSMgr: Verify JWT and bind socket to France seat

    Note over PlayerA,WSMgr: Order Submission & Per-Viewer Sanitization
    PlayerA->>API: POST /api/order?game_id=match_id (Bearer JWT)
    API->>API: Verify caller holds France seat
    API->>Engine: validate_orders() + adjudicate_turn(is_simulation=True)
    API->>DB: persist_game() (JSONB upsert)
    API-->>PlayerA: 200 OK (France sees own orders, foreign orders masked)

    API->>WSMgr: broadcast_game_update(game_id)
    WSMgr->>WSMgr: sanitize_game_state_for_viewer(state, viewer=France)
    WSMgr-->>PlayerA: WS push (France sees updated France orders)
    WSMgr->>WSMgr: sanitize_game_state_for_viewer(state, viewer=Germany)
    WSMgr-->>PlayerB: WS push (Germany sees France orders masked)
```

### C. Lobby Discovery & Public vs. Private Games

```mermaid
sequenceDiagram
    actor User
    participant LobbyUI as LobbyView.tsx
    participant LobbyAPI as FastAPI (api/lobby.py)
    participant WS as FastAPI (/ws/lobby)
    participant Store as storage/lobby.py

    LobbyUI->>LobbyAPI: GET /api/games/browse (public, paginated)
    LobbyAPI->>Store: public_summaries()
    Note right of Store: Excludes private, sandbox, and draft games. Strips passcodes, emails, and user IDs.
    Store-->>LobbyAPI: Sanitized public summaries
    LobbyAPI-->>LobbyUI: 200 OK

    opt Signed-in user
        LobbyUI->>LobbyAPI: GET /api/games/mine (Bearer JWT)
        LobbyAPI-->>LobbyUI: Caller's hosted, joined, and saved sandbox games
    end

    LobbyUI->>WS: Connect WS /ws/lobby
    WS-->>LobbyUI: Broadcasts public_summaries() on lobby changes
```

### D. Sandbox Isolation ("War Room" Mode)

Sandbox behavior differs depending on whether the player is in a **shared multiplayer match** or a **solo/saved sandbox**:

```mermaid
flowchart TB
    Enter["POST /api/sandbox/enter?game_id=match_id"] --> Check{"Is multiplayer match?"}

    Check -->|"Yes (shared match)"| MP["Mint private copy sbx_uuid in GAMES and PRIVATE_SANDBOXES"]
    MP --> MP_Init["Reset foreign powers to default orders (protects secrecy)"]
    MP_Init --> MP_Explore["Player tests all 7 powers and AI on sbx_uuid"]
    MP_Explore --> MP_Exit["POST /api/sandbox/exit?game_id=sbx_uuid"]
    MP_Exit --> MP_Merge["Discard sbx_uuid and merge player orders back if same turn"]

    Check -->|"No (solo or saved sandbox)"| Solo["Clone GAMES entry and history to SANDBOX_CHECKPOINTS"]
    Solo --> Solo_Explore["Player tests all 7 powers and AI on game_id"]
    Solo_Explore --> Solo_Exit["POST /api/sandbox/exit?game_id=game_id"]
    Solo_Exit --> Solo_Restore["Restore checkpoint, purge foreign hypotheticals, merge active power"]
```
