-- Migration: 20261106023059_lock_down_multiplayer_games_rls.sql
-- Locks down public.multiplayer_games Row-Level Security (RLS).
-- Revokes open write/delete access from the public anon key.
-- Restricts mutations to service_role. Reads are restricted in 20261106030000.

-- 1. Drop the overly permissive public write policy
drop policy if exists "Backend and service role game management" on public.multiplayer_games;

-- 2. This step used to create "Games are viewable by everyone" (select, using true) for the lobby
--    browser. 20261106030000 replaced it with a service_role-only select, because rows hold
--    passcodes and unresolved orders. Every deploy re-runs all migrations, so creating it here
--    gave anon read access until the next file ran. It now only drops it. The lobby is read
--    through the backend.
drop policy if exists "Games are viewable by everyone" on public.multiplayer_games;

-- 3. Explicitly restrict INSERT, UPDATE, and DELETE mutations to the backend service_role.
-- Following Supabase Postgres best practices, using the 'to' clause instead of deprecated auth.role().
drop policy if exists "Only service role can insert games" on public.multiplayer_games;
create policy "Only service role can insert games"
  on public.multiplayer_games
  for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update games" on public.multiplayer_games;
create policy "Only service role can update games"
  on public.multiplayer_games
  for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete games" on public.multiplayer_games;
create policy "Only service role can delete games"
  on public.multiplayer_games
  for delete
  to service_role
  using (true);
