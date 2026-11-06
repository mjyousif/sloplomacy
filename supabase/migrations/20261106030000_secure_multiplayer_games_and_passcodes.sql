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

-- 3. Create a public view for sanitized lobby discovery that strips secret passcodes and unadjudicated game_state
create or replace view public.lobby_games as
  select
    id,
    room_code,
    name,
    host_user_id,
    status,
    phase,
    season,
    year,
    summary,
    is_sandbox,
    is_private,
    (passcode is not null and passcode <> '') as has_passcode,
    created_at,
    updated_at
  from public.multiplayer_games
  where is_sandbox = false and is_private = false;

comment on view public.lobby_games is 'Sanitized public view of active multiplayer games excluding secret orders and passcodes.';
