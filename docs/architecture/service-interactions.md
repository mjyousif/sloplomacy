# Service Interactions & Frontend Communication

This document explains how the React frontend interacts with **Supabase Auth** and the **FastAPI backend** (REST APIs, WebSockets, L1 cache, and Sandbox isolation).

For the underlying PostgreSQL tables and Row-Level Security (RLS) policies, see [Database Setup & Row-Level Security](database.md).

## Contents

- [1. Frontend-to-Services Topology](#1-frontend-to-services-topology)
- [2. Key Service Interaction Flows](#2-key-service-interaction-flows)

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

### E. Game Links & SPA Routing (`/game/<id>`)

This flow differs from the ones above. The server knows nothing about game pages: it sends the same `index.html` for every path that is not an API route or a file. The browser decides what to show from the address bar, in `frontend/src/hooks/useGameRoute.ts`. There is no router library, because the app has three screens (`viewMode`: lobby, multiplayer match, sandbox) and no nested routes. The rules are in [Game Links & Routing](../frontend/state-management.md#game-links--routing-usegameroute).

**Loading or reloading a link.** In development the Vite dev server answers `/game/<id>` with `index.html`, and `/api` and `/ws` are proxied to FastAPI. In production the one Cloud Run container serves both: `serve_spa` in `backend/main.py` falls back to `index.html`, and the bundles load from absolute `/assets/...` paths, so they resolve from any page depth.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Server as Vite dev server / FastAPI serve_spa
    participant App as React app (useGameRoute)
    participant API as FastAPI /api

    User->>Browser: Open or reload https://host/game/mp_a1b2c3
    Browser->>Server: GET /game/mp_a1b2c3
    Note right of Server: Not /api, /ws or a file, so the SPA fallback answers
    Server-->>Browser: index.html
    Browser->>Server: GET /assets/index-hash.js and .css
    Server-->>Browser: JS and CSS bundles
    Browser->>App: Boot React, viewMode = lobby
    App->>App: parseGameRoute(location): an mp_ id? (solo_, saved_, sbx_ and proto_1901 mean the lobby)
    App->>App: Wait for the first auth read (authReady)
    App->>API: GET /api/games/mp_a1b2c3 (summary with has_passcode)
    alt The user holds a seat (myPowerIn)
        App->>API: POST /api/games/mp_a1b2c3/join (resume the seat)
        API-->>App: Board for that seat
    else Private game, no passcode typed this visit
        App->>App: Open Join with code with the Game ID filled in, replaceState to /
    else Anyone else
        App->>API: GET /api/game?game_id=mp_a1b2c3 (no power, X-Passcode if typed)
        API-->>App: Masked board, watched without a seat
    else 404 or another refusal
        App->>App: Lobby and a toast, replaceState to /
    end
```

**Moving around without reloading.** After the first load, no page navigation ever reaches the server again. The app writes the address with the History API, and the browser's Back and Forward buttons come back as `popstate` events:

```mermaid
flowchart TB
    Change["viewMode or activeGameId changes (Watch, Join, Resume, Leave, Sign out)"] --> First{"First write since the page loaded?"}
    First -->|"Yes"| Replace["history.replaceState: Back skips the replaced page"]
    First -->|"No"| Push["history.pushState: a new history entry"]
    Replace --> Addr["Address = /game/id for a match, / for the lobby. Never a passcode"]
    Push --> Addr

    Back["User presses Back or Forward"] --> Pop["popstate: the address has already changed"]
    Pop --> Kind{"parseGameRoute(location)"}
    Kind -->|"/"| Leave["handleBackToLobby: back to the lobby, seat kept"]
    Kind -->|"/game/id"| Open["Leave the current board through the lobby, then open the link as on load"]
    Kind -->|"?view=sandbox"| Sandbox["Open the Solo Sandbox"]
    Leave --> Settle["Write the address once the screen has settled"]
    Open --> Settle
    Sandbox --> Settle
```

Because the server answers every path with the same page, a link to a game the visitor may not see gives nothing away. Whether they can see it is decided by the API calls in the first diagram, with the same passcode and seat checks as opening the game from the lobby.
