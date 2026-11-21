---
name: db-persistence
description: Use when modifying Supabase persistence (backend/storage/supabase.py), database migrations (supabase/migrations/), profile resolution, or lobby/game serialization in Sloplomacy. Enforces normalization, PII stripping, TTL caching, and migration safety.
---

# Sloplomacy Database & Persistence Guide

Use this alongside `supabase-postgres-best-practices` whenever changing DB payloads, migrations, or `backend/storage/supabase.py`.

## Normalization & No-PII-in-Blobs
- **Canonical user identity**: `public.profiles` (`id` UUID -> `display_name`) is the single source of truth for registered users.
- **Never denormalize or fall back to emails**: Do not store `created_by`, participant `email`, UUID participant `display_name`, UUID `admin_log.actor`, or `@` tokens in persisted game JSON (`payload["summary"]`, `payload["game_state"]["summary"]`, `payload["game_state"]["state"]`, or `payload["history"]`). Never split an email on `@` as a username fallback.
- **Serialize both summary copies and state**: `save_game_to_db` must pass **both** top-level `payload["summary"]` and `payload["game_state"]["summary"]` through `_serialize_summary_for_db(summary)`, and `state` / `history` through `_serialize_state_for_db(state)` (`backend/storage/supabase_codec.py`).
- **Centralized read-time resolution**: Resolve display names from `PROFILE_NAMES[user_id]` via `backend/storage/profiles.py` (`resolve_display_name`, `resolve_participant_name`, `resolve_host_name`, `resolve_actor_name`, `ensure_profile_loaded`). Registered UUIDs missing from `PROFILE_NAMES` default strictly to `"Envoy"` (`resolve_host_name` falls back to `"Unknown host"` only when no `creator_id` exists).
- **Keep `created_by` decoupled**: Account profile updates (`PATCH /api/account/profile`) update `public.profiles`, `PROFILE_NAMES`, and participant `display_name` in memory, never `summary.created_by`.

## Read Efficiency & In-Memory Authority
- **TTL cache for `public.profiles`**: `sync_lobby_with_db` must cache `load_profile_names_from_db()` refreshes with a TTL (`_PROFILES_TTL_SECONDS`) rather than querying `profiles` on every lobby request.
- **Lobby projection**: `load_all_summaries_from_db()` selects `LOBBY_COLUMNS` (never `game_state` or `*` unless falling back on schema mismatch).
- **Memory wins**: Loaded `GAMES` / `GAME_SUMMARIES` entries are authoritative; never overwrite them with stale DB reads, and treat `SupabaseUnavailable` as a transient error rather than a deleted game.

## Migrations (`supabase/migrations/`)
- **Manual apply / deploy notes**: Migrations in `supabase/migrations/` do **not** auto-run on PR merge unless a migration step is executed against the Supabase project. Always note pending migrations in the PR's **Deploy notes**.
- **Destructive data migrations**: Any migration that strips or mutates existing JSONB keys (e.g., `created_by`, `display_name`) must be idempotent and include a backup/rollback note in the PR description.
- **Timestamp prefix**: Name files `YYYYMMDDHHMMSS_<short_snake_case>.sql` (avoid duplicate timestamps).
