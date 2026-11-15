# Database Setup & Service Interactions

This document explains how **Sloplomacy** stores data in Supabase PostgreSQL, how Row-Level Security (RLS) protects secret simultaneous orders, and how the React frontend interacts with Supabase Auth and the FastAPI backend.

---

## 1. Database Schema & Entity Relationships

Supabase provides both **Authentication** (`auth.users`) and **PostgreSQL** (`public.*`). Rather than normalizing every unit, order, and turn snapshot into dozens of relational tables, Sloplomacy stores each match's authoritative board state, lobby summary, turn history, and press (chat) as structured JSONB columns on `public.multiplayer_games`, paired with relational metadata for indexing, filtering, and optimistic concurrency.

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : "on_auth_user_created trigger"
    AUTH_USERS ||--o{ MULTIPLAYER_GAMES : "hosts (host_user_id)"
    AUTH_USERS ||--o{ GAME_PARTICIPANTS : "joins (user_id)"
    MULTIPLAYER_GAMES ||--o{ GAME_PARTICIPANTS : "has seats (game_id)"
    MULTIPLAYER_GAMES ||..|| LOBBY_GAMES_VIEW : "sanitized public view"

    AUTH_USERS {
        uuid id PK
        text email
        jsonb raw_user_meta_data
    }

    PROFILES {
        uuid id PK, FK "references auth.users(id)"
        text display_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    MULTIPLAYER_GAMES {
        uuid id PK
        text room_code UK "App game_id (e.g. proto_1901, solo_...)"
        text name
        uuid host_user_id FK "references auth.users(id)"
        text status "waiting | active | completed | lobby | in_progress"
        text phase "Movement | Retreats | Adjustments"
        text season "Spring | Fall | Winter"
        int4 year
        jsonb game_state "Authoritative GameState (board, orders, admin_log)"
        jsonb summary "MultiplayerGameSummary metadata"
        jsonb history "Resolved turn snapshots (incl. phase='Admin')"
        jsonb press "In-game chat array (oldest first)"
        text passcode "Optional room passcode"
        bool is_sandbox
        bool is_private
        int8 state_revision "Optimistic concurrency counter"
        text winner
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    GAME_PARTICIPANTS {
        uuid id PK
        uuid game_id FK "references multiplayer_games(id)"
        uuid user_id FK "references auth.users(id)"
        text power
        bool is_ready
        timestamptz joined_at
    }

    LOBBY_GAMES_VIEW {
        uuid id
        text room_code
        text name
        uuid host_user_id
        text status
        text phase
        text season
        int4 year
        jsonb summary
        bool is_sandbox
        bool is_private
        bool has_passcode "Computed from passcode"
    }
```

### Key Schema Design Choices

- **Separate `press` JSONB column**: `multiplayer_games.press` is stored in its own column (`backend/storage/press.py`) so saving chat messages never overwrites `game_state`, and saving a turn never clobbers press messages.
- **Authoritative Profiles (`public.profiles`)**: When persisting summaries to `multiplayer_games`, denormalized display names for registered UUID users are stripped (`backend/storage/supabase.py`). On load, `hydrate_summary_profiles` resolves current names from `public.profiles` (`PROFILE_NAMES` cache).
- **Optimistic Concurrency (`state_revision`)**: Incremented on mutations and checked by admin board-edit operations (`backend/api/admin_units.py`) to prevent stale overwrites.
- **Sanitized View (`public.lobby_games`)**: Excludes `game_state`, `history`, `press`, and plaintext `passcode` (exposing `has_passcode` boolean instead), and filters out sandboxes and private games.

---

## 2. Row-Level Security (RLS) & Trust Boundaries

In Diplomacy, orders are **simultaneous and secret** until adjudication. If the browser could query `public.multiplayer_games` directly with the public Supabase `anon` key, any player could inspect `game_state` and read opponents' unrevealed orders, private press, or room passcodes.

Therefore, **the frontend never queries game tables in Supabase directly**. All game reads and writes go through the FastAPI backend, which authenticates with Supabase using the privileged `service_role` key and sanitizes responses per viewer.

```mermaid
flowchart LR
    Client["Browser Client (React)"]
    SupaAuth["Supabase Auth (anon key)"]
    FastAPI["FastAPI Backend (service_role key)"]
    PG_Games["public.multiplayer_games (RLS: service_role only)"]
    PG_Profiles["public.profiles (RLS: public select, owner update)"]
    PG_Part["public.game_participants (RLS: public select, auth insert/owner update)"]

    Client -->|"Sign in / OAuth / Session JWT"| SupaAuth
    Client -->|"REST /api/* & WS /ws/* (Bearer JWT)"| FastAPI
    FastAPI -->|"PostgREST + service_role"| PG_Games
    FastAPI -->|"PostgREST + service_role"| PG_Profiles
    Client -.->|"Blocked by RLS (no anon/auth access)"| PG_Games
    SupaAuth -->|"on_auth_user_created"| PG_Profiles
    PG_Games --- PG_Part
```

### Policy Summary

| Table | `anon` / `authenticated` (Browser) | `service_role` (FastAPI Backend) |
| :--- | :--- | :--- |
| `public.multiplayer_games` | **No access** (all SELECT/INSERT/UPDATE/DELETE blocked by RLS) | Full read/write access |
| `public.lobby_games` (view) | Sanitized public columns only (no `game_state`, `press`, `history`, or `passcode`) | Full access |
| `public.profiles` | `SELECT` everyone; `UPDATE` own row (`auth.uid() = id`) | Full read/write access |
| `public.game_participants` | `SELECT` everyone; `INSERT` authenticated; `UPDATE` own row | Full access |

---

## 3. Frontend-to-Services Architecture

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

## 4. Key Service Interaction Flows

### A. Authentication & Authenticated API Call

```mermaid
sequenceDiagram
    actor User
    participant UI as React UI (AuthModal / App)
    participant SupaJS as lib/supabase.ts (@supabase/supabase-js)
    participant SupaAuth as Supabase Auth
    participant API as FastAPI Router (api/*)
    participant AuthDep as security/auth.py

    User->>UI: Sign in (Email / OAuth / Demo)
    UI->>SupaJS: signInWithPassword / signInWithOAuth
    SupaJS->>SupaAuth: Authenticate credentials
    SupaAuth-->>SupaJS: Session + Access JWT
    SupaJS-->>UI: onAuthStateChange (AuthUser)

    User->>UI: Perform action (e.g. Create Game / Submit Order)
    UI->>SupaJS: authedFetch("/api/...", init)
    SupaJS->>SupaJS: getSession() -> Authorization: Bearer JWT
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
    PlayerA->>WSMgr: Connect WS /ws/games/{id}?handshake=1
    WSMgr-->>PlayerA: accept()
    PlayerA->>WSMgr: Send {"type": "auth", "token": "<JWT>"}
    WSMgr->>WSMgr: Verify JWT -> bind socket to France seat

    Note over PlayerA,WSMgr: Order Submission & Per-Viewer Sanitization
    PlayerA->>API: POST /api/order?game_id={id} (Bearer JWT)
    API->>API: Verify caller holds France seat
    API->>Engine: validate_orders() + adjudicate_turn(is_simulation=True)
    API->>DB: persist_game() (JSONB upsert)
    API-->>PlayerA: 200 OK (France sees own orders; foreign orders masked)

    API->>WSMgr: broadcast_game_update(game_id)
    WSMgr->>WSMgr: sanitize_game_state_for_viewer(state, viewer=France)
    WSMgr-->>PlayerA: WS push (France sees updated France orders)
    WSMgr->>WSMgr: sanitize_game_state_for_viewer(state, viewer=Germany)
    WSMgr-->>PlayerB: WS push (Germany sees France's orders masked)
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
    Enter["POST /api/sandbox/enter?game_id={id}"] --> Check{"Is multiplayer match?"}

    Check -->|"Yes (shared match)"| MP["Mint private copy sbx_{uuid} in GAMES & PRIVATE_SANDBOXES"]
    MP --> MP_Init["Reset foreign powers to default orders (protects secrecy)"]
    MP_Init --> MP_Explore["Player tests all 7 powers & AI on sbx_{uuid}"]
    MP_Explore --> MP_Exit["POST /api/sandbox/exit?game_id=sbx_{uuid}"]
    MP_Exit --> MP_Merge["Discard sbx_{uuid}; merge player's own orders back if same turn"]

    Check -->|"No (solo / saved sandbox)"| Solo["Clone GAMES[id] & history to SANDBOX_CHECKPOINTS"]
    Solo --> Solo_Explore["Player tests all 7 powers & AI on {id}"]
    Solo_Explore --> Solo_Exit["POST /api/sandbox/exit?game_id={id}"]
    Solo_Exit --> Solo_Restore["Restore checkpoint, purge foreign hypotheticals, merge active power"]
```
