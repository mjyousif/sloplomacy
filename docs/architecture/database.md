# Database Setup & Row-Level Security

This document describes how **Traitorous** stores data in Supabase PostgreSQL, how the normalized tables relate to each other, and how Row-Level Security (RLS) protects secret simultaneous orders.

For how the React frontend and FastAPI backend interact with these tables at runtime, see [Service Interactions](service-interactions.md).

## Contents

- [1. Database Schema & Entity Relationships](#1-database-schema--entity-relationships)
- [2. Row-Level Security (RLS) & Trust Boundaries](#2-row-level-security-rls--trust-boundaries)

---

## 1. Database Schema & Entity Relationships

Supabase provides both **Authentication** (`auth.users`) and **PostgreSQL** (`public.*`). Traitorous normalizes the relational spine (matches, seats with soft-leave history, per-phase history snapshots, and press threads/messages) while keeping the live simultaneous turn state as a single atomic `game_state` JSONB column on `public.multiplayer_games` and variable press metadata (`orders`, per-reader `numbers`) in `press_messages.meta`.

```mermaid
erDiagram
    AUTH_USERS ||--o| PROFILES : "on_auth_user_created trigger"
    AUTH_USERS ||--o{ MULTIPLAYER_GAMES : "hosts (host_user_id)"
    AUTH_USERS ||--o{ GAME_PARTICIPANTS : "joins (user_id, nullable)"
    MULTIPLAYER_GAMES ||--o{ GAME_PARTICIPANTS : "seats (game_id)"
    MULTIPLAYER_GAMES ||--o{ GAME_PHASES : "resolved phases (game_id)"
    MULTIPLAYER_GAMES ||--o{ PRESS_THREADS : "threads (game_id)"
    MULTIPLAYER_GAMES ||--o{ PRESS_MESSAGES : "messages (game_id)"
    PRESS_THREADS ||--o{ PRESS_THREAD_MEMBERS : "members (thread_id)"
    PRESS_THREADS ||--o{ PRESS_MESSAGES : "contains (thread_id, game_id)"

    AUTH_USERS {
        uuid id PK
        text email
        jsonb raw_user_meta_data
    }

    PROFILES {
        uuid id PK
        text display_name
        text avatar_url
        timestamptz created_at
        timestamptz updated_at
    }

    MULTIPLAYER_GAMES {
        uuid id PK
        text room_code UK "App game_id (e.g. mp_..., solo_...)"
        text name
        text game_type "PUBLIC | PRIVATE | SANDBOX | DRAFT"
        text status "waiting, active, completed"
        text scenario_id
        text winner
        uuid host_user_id FK "references auth.users"
        text creator_guest_id "non-UUID guest creator when host_user_id is null"
        text phase
        text season
        int2 year
        text passcode "nullable"
        int4 current_phase_index
        int8 state_revision
        timestamptz deadline
        timestamptz created_at
        timestamptz completed_at
        timestamptz last_moved_at
        timestamptz updated_at
        jsonb game_state "Lean live GameState only"
    }

    GAME_PARTICIPANTS {
        uuid id PK
        uuid game_id FK "references multiplayer_games(id)"
        text power
        uuid user_id FK "nullable, references auth.users(id)"
        text guest_id "non-UUID guest id when user_id is null"
        text guest_display_name "non-UUID guest display label"
        timestamptz joined_at
        timestamptz left_at "NULL = active seat; non-NULL = former player"
        int4 joined_phase_index
        int4 left_phase_index
        bool surrendered
        timestamptz surrendered_at
        timestamptz game_over_seen_at
        bool is_finalized
    }

    GAME_PHASES {
        uuid game_id PK, FK "references multiplayer_games(id)"
        int4 phase_index PK
        int2 year
        text season
        text phase
        int8 state_revision
        timestamptz resolved_at
        jsonb snapshot "Lean per-phase snapshot (no turn_history/admin_log)"
    }

    PRESS_THREADS {
        uuid id PK
        uuid game_id FK "references multiplayer_games(id)"
        text thread_key "UK(game_id, thread_key)"
        text thread_type "public | direct | group"
        timestamptz created_at
    }

    PRESS_THREAD_MEMBERS {
        uuid thread_id PK, FK "references press_threads(id)"
        text power PK
        timestamptz joined_at
    }

    PRESS_MESSAGES {
        uuid id PK
        uuid game_id FK
        uuid thread_id FK "FK(thread_id, game_id) -> press_threads(id, game_id)"
        int4 seq "UK(game_id, seq)"
        text sender_power
        bool is_anonymous
        int2 year
        text season
        text phase
        text body
        timestamptz sent_at
        jsonb meta "orders, numbers, public_number"
    }
```

### Key Schema Design Choices

- **UUID Foreign Keys & Soft-Leave Seat History**: All child tables reference `multiplayer_games.id` (`uuid`) with `ON DELETE CASCADE`. `public.game_participants` uses a surrogate `id` PK plus a partial unique index `idx_game_participants_active_seat` on `(game_id, power) WHERE left_at IS NULL`. Leaving or surrendering-and-leaving stamps `left_at` and `left_phase_index` rather than deleting the row, preserving former-player tenure while freeing the seat for a replacement player.
- **Zero-Byte Virtual Computed Columns**: `public.has_passcode(g)` and `public.board_preview(g)` are `IMMUTABLE` SQL functions exposed as computed PostgREST columns (`?select=...,has_passcode,board_preview`) and restricted to `service_role`. Lobby refreshes never transfer plaintext passcodes, live orders, or redundant JSONB copies.
- **Per-Phase History (`public.game_phases`)**: Resolved phases (including `"Admin"` snapshots) are stored as append-only rows keyed by `(game_id, phase_index)` with no 30-phase cap. `snapshot` strips `unit_options`, `preview`, `issues`, `timer`, `finalized_powers`, `turn_history`, and `admin_log` to eliminate $O(N^2)$ cumulative log bloat.
- **Normalized Press (`press_threads`, `press_thread_members`, `press_messages`)**: Each message appends one row in $O(1)$ under a deterministic `(game_id, thread_key)` thread, with a composite FK `(thread_id, game_id) -> press_threads(id, game_id)` preventing cross-game thread links.
- **Authoritative Profiles & No-PII Constraints**: SQL `CHECK` constraints forbid `@` tokens in `creator_guest_id`, `guest_id`, and `guest_display_name`, and forbid storing `guest_display_name` on registered UUID seats. Registered display names live exclusively in `public.profiles` (`handle_new_user()` defaults invalid/email metadata to `'Envoy'`, enforced by `profiles_display_name_valid`).
- **Optimistic Concurrency (`state_revision` & `board_revision`)**: `state_revision` increments on every authoritative state mutation; `board_revision` (inside `game_state`) increments on board/turn changes and is checked by `POST /api/admin/board-edit`.
- **Two-Phase Migration Rollout**: Legacy columns `multiplayer_games.{summary, history, press, is_sandbox, is_private}` remain deprecated on disk during Phase 1 for zero-downtime Cloud Run deploys and are scheduled for removal in Phase 2.

---

## 2. Row-Level Security (RLS) & Trust Boundaries

In Diplomacy, orders are **simultaneous and secret** until adjudication. Therefore, **the frontend never queries game, participant, phase, or press tables in Supabase directly**. All game reads and writes go through the FastAPI backend using `service_role`, which sanitizes responses per viewer.

```mermaid
flowchart LR
    Client["Browser Client (React)"]
    SupaAuth["Supabase Auth (anon key)"]
    FastAPI["FastAPI Backend (service_role key)"]
    PG_Games["public.multiplayer_games / game_participants / game_phases / press_* (RLS: service_role only)"]
    PG_Profiles["public.profiles (RLS: public select, owner update)"]

    Client -->|"Sign in, OAuth, Session JWT"| SupaAuth
    Client -->|"REST /api/* and WS /ws/* (Bearer JWT)"| FastAPI
    FastAPI -->|"PostgREST + service_role"| PG_Games
    FastAPI -->|"PostgREST + service_role"| PG_Profiles
    Client -.->|"Blocked by RLS (no anon or auth access)"| PG_Games
    SupaAuth -->|"on_auth_user_created"| PG_Profiles
```

### Policy Summary

| Table | `anon` / `authenticated` (Browser) | `service_role` (FastAPI Backend) |
| :--- | :--- | :--- |
| `public.multiplayer_games` | **No access** (RLS blocks all SELECT/INSERT/UPDATE/DELETE) | Full read/write access |
| `public.game_participants` | **No access** (RLS blocks all SELECT/INSERT/UPDATE/DELETE) | Full read/write access |
| `public.game_phases` | **No access** (RLS blocks all SELECT/INSERT/UPDATE/DELETE) | Full read/write access |
| `public.press_threads`, `press_thread_members`, `press_messages` | **No access** (RLS blocks all SELECT/INSERT/UPDATE/DELETE) | Full read/write access |
| `public.profiles` | `SELECT` everyone; `UPDATE` own row (`(select auth.uid()) = id`) | Full read/write access |
