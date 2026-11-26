---
name: db-persistence
description: Use when modifying Supabase persistence (backend/storage/supabase.py, backend/storage/phases.py, backend/storage/press.py), database migrations (supabase/migrations/), profile resolution, or lobby/game serialization in Traitorous. Enforces normalization, PII stripping, TTL caching, and migration safety.
---

# Traitorous Database & Persistence Guide

Use this alongside `supabase-postgres-best-practices` whenever changing DB payloads, migrations, or `backend/storage/*`.

## Normalization & No-PII-in-Blobs
- **Canonical user identity**: `public.profiles` (`id` UUID -> `display_name`) is the single source of truth for registered users.
- **Relational tables**:
  - `public.multiplayer_games`: top-level match metadata (`game_type`, `status`, `scenario_id`, `host_user_id`, `creator_guest_id`, `passcode`, `current_phase_index`, `deadline`, `last_moved_at`) + lean unwrapped live `game_state` JSONB + virtual computed functions `has_passcode(g)` and `board_preview(g)`.
  - `public.game_participants`: seat rows keyed by `id` with partial unique index `(game_id, power) WHERE left_at IS NULL` (soft-leave preserves former players with `left_at` and `left_phase_index`), synchronized atomically via `public.sync_game_participants`.
  - `public.game_phases`: append-only resolved phase rows keyed by `(game_id, phase_index)` (`0..N-1`), no 30-phase cap (`#342`).
  - `public.press_threads`, `public.press_thread_members`, `public.press_messages`: normalized press with composite `(thread_id, game_id)` FK.
- **Never denormalize or fall back to emails**: Do not store `created_by`, participant `email`, UUID participant `display_name`/`guest_display_name`, UUID `admin_log.actor`, or `@` tokens in any persisted column or JSONB (`game_state`, `game_phases.snapshot`, `game_participants.guest_display_name`). SQL `CHECK` constraints enforce this at the database layer.
- **Centralized read-time resolution**: Resolve display names from `PROFILE_NAMES[user_id]` via `backend/storage/profiles.py` (`resolve_display_name`, `resolve_participant_name`, `resolve_host_name`, `resolve_actor_name`, `ensure_profile_loaded`). Registered UUIDs missing from `PROFILE_NAMES` default strictly to `"Envoy"` (`resolve_host_name` falls back to `"Unknown host"` only when no `creator_id` exists).
- **Keep `created_by` decoupled**: Account profile updates (`PATCH /api/account/profile`) update `public.profiles`, `PROFILE_NAMES`, and participant `display_name` in memory, never `summary.created_by`.

## Read Efficiency & In-Memory Authority
- **TTL cache for `public.profiles`**: `sync_lobby_with_db` caches `load_profile_names_from_db()` refreshes with a TTL (`_PROFILES_TTL_SECONDS`).
- **Lobby projection**: `load_all_summaries_from_db()` selects `LOBBY_COLUMNS` (top-level columns + virtual `has_passcode`/`board_preview` + embedded active `game_participants`, never `game_state` or `passcode`).
- **Lazy phase history**: `load_game_from_db()` returns `LoadedGame(..., history=None, phase_count=...)` without downloading `game_phases` or `press_messages`. Callers use `list_phase_entries` (index-only), `get_phase_snapshot` ($O(1)$), or `ensure_history_loaded`.
- **Memory wins**: Loaded `GAMES` / `GAME_SUMMARIES` entries are authoritative; never overwrite them with stale DB reads, and treat `SupabaseUnavailable` as a transient error rather than a deleted game.

## Migrations (`supabase/migrations/`)
- **Full-replay idempotency**: CI and production deploy re-run all `supabase/migrations/*.sql` files in `--single-transaction`. Every migration must be 100% idempotent and safe when re-run against populated data.
- **Timestamp prefix**: Name files `YYYYMMDDHHMMSS_<short_snake_case>.sql` (avoid duplicate timestamps).
