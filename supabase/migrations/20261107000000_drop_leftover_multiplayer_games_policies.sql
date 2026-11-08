-- Migration: 20261107000000_drop_leftover_multiplayer_games_policies.sql
-- Drops the policies 20261103000000_init_schema.sql created on public.multiplayer_games.
-- The lock-down migrations dropped policies with other names, so databases created from the
-- original init migration still have these three:
--   "Games are viewable by all logged-in players"  select using (true): the anon key could read
--                                                  every row, passcodes and unresolved orders included
--   "Authenticated users can create games"         insert by any signed-in user
--   "Host can update game"                         a host could rewrite their own game directly
-- Policies are permissive, so any one of them grants access whatever the service_role policies say.
--
-- What remains on public.multiplayer_games after this file:
--   "Only service role can select games"  select  to service_role
--   "Only service role can insert games"  insert  to service_role
--   "Only service role can update games"  update  to service_role
--   "Only service role can delete games"  delete  to service_role
-- The anon and authenticated roles get no rows. The browser reads games through the backend.

drop policy if exists "Games are viewable by all logged-in players" on public.multiplayer_games;
drop policy if exists "Authenticated users can create games" on public.multiplayer_games;
drop policy if exists "Host can update game" on public.multiplayer_games;

-- Dropped by earlier files too. Repeated here so this file alone leaves the table locked down.
drop policy if exists "Backend and service role game management" on public.multiplayer_games;
drop policy if exists "Games are viewable by everyone" on public.multiplayer_games;
