-- Migration: 20261105000000_game_state_persistence.sql
-- Enables seamless game state persistence between Cloud Run containers and Supabase PostgreSQL.

-- 1. Align status check constraint to accept both application statuses ('waiting', 'active', 'completed')
--    and legacy DB statuses ('lobby', 'in_progress').
alter table public.multiplayer_games drop constraint if exists multiplayer_games_status_check;
alter table public.multiplayer_games add constraint multiplayer_games_status_check
  check (status in ('waiting', 'active', 'completed', 'lobby', 'in_progress'));

-- 2. Add auxiliary columns for rich querying, indexing, and filtering if not already present.
alter table public.multiplayer_games add column if not exists summary jsonb default '{}'::jsonb;
alter table public.multiplayer_games add column if not exists history jsonb default '[]'::jsonb;
alter table public.multiplayer_games add column if not exists passcode text;
alter table public.multiplayer_games add column if not exists is_sandbox boolean not null default false;
alter table public.multiplayer_games add column if not exists is_private boolean not null default false;

-- 3. Ensure indexing on room_code for fast O(1) game lookups
create index if not exists idx_multiplayer_games_room_code on public.multiplayer_games(room_code);

-- 4. Update Row-Level Security policies to allow authoritative backend server operations
drop policy if exists "Backend and service role game management" on public.multiplayer_games;
create policy "Backend and service role game management"
  on public.multiplayer_games
  for all
  using (true)
  with check (true);
