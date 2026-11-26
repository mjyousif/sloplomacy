-- Migration: 20261106030000_secure_multiplayer_games_and_passcodes.sql
-- Restricts public SELECT access to prevent leaking plaintext passcodes and secret simultaneous orders.
-- Restricts multiplayer_games access to service_role, while providing a secure view for public lobby discovery if needed.

-- 1. Drop public select policy that exposes plaintext passcodes and unadjudicated moves
drop policy if exists "Games are viewable by everyone" on public.multiplayer_games;

-- 2. Restrict direct SELECT on multiplayer_games to service_role (the authoritative FastAPI backend)
drop policy if exists "Only service role can select games" on public.multiplayer_games;
create policy "Only service role can select games"
  on public.multiplayer_games
  for select
  to service_role
  using (true);

-- 3. Drop the unused public.lobby_games view (formerly a SECURITY DEFINER view).
--    The lobby is served exclusively by the FastAPI backend via service_role.
drop view if exists public.lobby_games;
