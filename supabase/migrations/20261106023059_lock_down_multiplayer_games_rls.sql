-- Migration: 20261106023059_lock_down_multiplayer_games_rls.sql
-- Locks down public.multiplayer_games Row-Level Security (RLS).
-- Revokes open write/delete access from the public anon key.
-- Allows public read access for lobby discovery while restricting mutations to service_role.

-- 1. Drop the overly permissive public write policy
drop policy if exists "Backend and service role game management" on public.multiplayer_games;

-- 2. Allow public / authenticated / anon users to view games for the multiplayer lobby browser
drop policy if exists "Games are viewable by everyone" on public.multiplayer_games;
create policy "Games are viewable by everyone"
  on public.multiplayer_games
  for select
  using (true);

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
