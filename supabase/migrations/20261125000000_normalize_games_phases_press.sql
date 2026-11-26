-- Migration: 20261125000000_normalize_games_phases_press.sql
-- Phase 1 of #222 & #342:
--   1. Remediate Supabase Security & Performance Advisors (drop unused SECURITY DEFINER view
--      public.lobby_games, lock handle_new_user() RPC execution, optimize profiles RLS, index FKs).
--   2. Promote match metadata onto public.multiplayer_games (single game_type, smallint years,
--      nullable passcode, virtual computed has_passcode/board_preview functions).
--   3. Evolve & lock down public.game_participants with soft-leave (left_at, joined/left_phase_index),
--      guest seat support, no-PII CHECK constraints, and atomic sync_game_participants RPC.
--   4. Create normalized public.game_phases (removing the 30-phase cap for #342) and
--      public.press_threads / public.press_thread_members / public.press_messages.
--   5. Idempotently backfill existing rows without dropping legacy columns (Phase 2 contract PR).

-- ============================================================================
-- 1. Security & Advisor Remediation
-- ============================================================================

drop view if exists public.lobby_games;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create index if not exists idx_multiplayer_games_host_user_id
  on public.multiplayer_games (host_user_id);

-- ============================================================================
-- 2. Promote Relational Metadata on public.multiplayer_games
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'multiplayer_games'
      and column_name = 'year'
      and data_type <> 'smallint'
  ) then
    alter table public.multiplayer_games
      alter column year type smallint using year::smallint;
  end if;
end
$$;

alter table public.multiplayer_games
  add column if not exists game_type text not null default 'PUBLIC',
  add column if not exists scenario_id text not null default 'standard_1901',
  add column if not exists creator_guest_id text,
  add column if not exists current_phase_index integer not null default 0,
  add column if not exists deadline timestamp with time zone,
  add column if not exists last_moved_at timestamp with time zone;

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_game_type_check,
  add constraint multiplayer_games_game_type_check
    check (game_type in ('PUBLIC', 'PRIVATE', 'SANDBOX', 'DRAFT'));

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_phase_index_nonneg,
  add constraint multiplayer_games_phase_index_nonneg
    check (current_phase_index >= 0);

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_creator_identity_check,
  add constraint multiplayer_games_creator_identity_check
    check (not (host_user_id is not null and creator_guest_id is not null));

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_creator_guest_no_email,
  add constraint multiplayer_games_creator_guest_no_email
    check (
      creator_guest_id is null
      or (btrim(creator_guest_id) <> '' and position('@' in creator_guest_id) = 0)
    );

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_passcode_non_empty,
  add constraint multiplayer_games_passcode_non_empty
    check (passcode is null or btrim(passcode) <> '');

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_winner_valid,
  add constraint multiplayer_games_winner_valid
    check (winner is null or winner ~ '^[A-Z][A-Z0-9_]{1,31}$');

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_season_valid,
  add constraint multiplayer_games_season_valid
    check (season ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$');

alter table public.multiplayer_games
  drop constraint if exists multiplayer_games_phase_valid,
  add constraint multiplayer_games_phase_valid
    check (phase ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$');

create index if not exists idx_multiplayer_games_public_browse
  on public.multiplayer_games (last_moved_at desc nulls last, created_at desc)
  where game_type = 'PUBLIC' and status <> 'completed';

-- Virtual computed column functions for PostgREST (?select=...,has_passcode,board_preview).
-- Zero bytes stored on disk; accessible only to service_role.
create or replace function public.has_passcode(g public.multiplayer_games)
returns boolean
language sql
immutable
set search_path = public
as $$
  select g.passcode is not null and btrim(g.passcode) <> '';
$$;

revoke all on function public.has_passcode(public.multiplayer_games) from public, anon, authenticated;
grant execute on function public.has_passcode(public.multiplayer_games) to service_role;

create or replace function public.board_preview(g public.multiplayer_games)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(g.game_state -> 'ownership', g.game_state -> 'state' -> 'ownership') is null
      and coalesce(g.game_state -> 'units', g.game_state -> 'state' -> 'units') is null
    then null
    else jsonb_build_object(
      'ownership', coalesce(g.game_state -> 'ownership', g.game_state -> 'state' -> 'ownership', '{}'::jsonb),
      'units', coalesce(g.game_state -> 'units', g.game_state -> 'state' -> 'units', '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.board_preview(public.multiplayer_games) from public, anon, authenticated;
grant execute on function public.board_preview(public.multiplayer_games) to service_role;

-- ============================================================================
-- 3. Evolve & Lock Down public.game_participants (Soft-Leave + Attribution)
-- ============================================================================

alter table public.game_participants
  drop constraint if exists game_participants_game_id_power_key,
  drop constraint if exists game_participants_game_id_user_id_key;

alter table public.game_participants
  alter column id set default gen_random_uuid(),
  alter column game_id set not null;

alter table public.game_participants
  drop constraint if exists game_participants_user_id_fkey,
  add constraint game_participants_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.game_participants
  drop column if exists is_ready;

alter table public.game_participants
  add column if not exists guest_id text,
  add column if not exists guest_display_name text,
  add column if not exists left_at timestamp with time zone,
  add column if not exists joined_phase_index integer not null default 0,
  add column if not exists left_phase_index integer,
  add column if not exists surrendered boolean not null default false,
  add column if not exists surrendered_at timestamp with time zone,
  add column if not exists game_over_seen_at timestamp with time zone,
  add column if not exists is_finalized boolean not null default false;

alter table public.game_participants
  drop constraint if exists game_participants_power_valid,
  add constraint game_participants_power_valid
    check (power ~ '^[A-Z][A-Z0-9_]{1,31}$');

alter table public.game_participants
  drop constraint if exists game_participants_joined_phase_nonneg,
  add constraint game_participants_joined_phase_nonneg
    check (joined_phase_index >= 0);

alter table public.game_participants
  drop constraint if exists game_participants_left_phase_nonneg,
  add constraint game_participants_left_phase_nonneg
    check (left_phase_index is null or left_phase_index >= 0);

alter table public.game_participants
  drop constraint if exists game_participants_identity_check,
  add constraint game_participants_identity_check
    check (not (user_id is not null and guest_id is not null));

alter table public.game_participants
  drop constraint if exists game_participants_uuid_no_guest_name,
  add constraint game_participants_uuid_no_guest_name
    check (user_id is null or guest_display_name is null);

alter table public.game_participants
  drop constraint if exists game_participants_guest_no_email,
  add constraint game_participants_guest_no_email
    check (
      (guest_id is null or (btrim(guest_id) <> '' and position('@' in guest_id) = 0))
      and (guest_display_name is null or position('@' in guest_display_name) = 0)
    );

create unique index if not exists idx_game_participants_active_seat
  on public.game_participants (game_id, power)
  where left_at is null;

create index if not exists idx_game_participants_game_id
  on public.game_participants (game_id);

create index if not exists idx_game_participants_user_id
  on public.game_participants (user_id);

alter table public.game_participants enable row level security;

drop policy if exists "Participants are viewable by everyone" on public.game_participants;
drop policy if exists "Authenticated users can join games" on public.game_participants;
drop policy if exists "Users can update their own participant record" on public.game_participants;

drop policy if exists "Only service role can select game_participants" on public.game_participants;
create policy "Only service role can select game_participants"
  on public.game_participants for select
  to service_role
  using (true);

drop policy if exists "Only service role can insert game_participants" on public.game_participants;
create policy "Only service role can insert game_participants"
  on public.game_participants for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update game_participants" on public.game_participants;
create policy "Only service role can update game_participants"
  on public.game_participants for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete game_participants" on public.game_participants;
create policy "Only service role can delete game_participants"
  on public.game_participants for delete
  to service_role
  using (true);

-- Atomic seat synchronization preserving former players via soft-leave (left_at / left_phase_index).
create or replace function public.sync_game_participants(
  p_game_id uuid,
  p_seats jsonb,
  p_surrendered_powers text[] default '{}',
  p_phase_index integer default 0
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_phase_idx integer := greatest(coalesce(p_phase_index, 0), 0);
  v_surrendered text[] := coalesce(p_surrendered_powers, '{}');
begin
  -- 1. Soft-leave any active seat whose power was vacated or whose occupant changed.
  update public.game_participants gp
  set
    left_at = v_now,
    left_phase_index = v_phase_idx,
    is_finalized = false,
    surrendered = gp.surrendered or (gp.power = any(v_surrendered)),
    surrendered_at = case
      when gp.surrendered or (gp.power = any(v_surrendered))
      then coalesce(gp.surrendered_at, v_now)
      else gp.surrendered_at
    end
  where gp.game_id = p_game_id
    and gp.left_at is null
    and not exists (
      select 1
      from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as d(
        power text,
        user_id uuid,
        guest_id text,
        guest_display_name text,
        joined_at timestamp with time zone,
        surrendered boolean,
        surrendered_at timestamp with time zone,
        game_over_seen_at timestamp with time zone,
        is_finalized boolean
      )
      where d.power = gp.power
        and d.user_id is not distinct from gp.user_id
        and d.guest_id is not distinct from gp.guest_id
    );

  -- 2. Update remaining active seats in place.
  update public.game_participants gp
  set
    guest_display_name = case when gp.user_id is null then d.guest_display_name else null end,
    surrendered = coalesce(d.surrendered, false),
    surrendered_at = d.surrendered_at,
    game_over_seen_at = d.game_over_seen_at,
    is_finalized = coalesce(d.is_finalized, false)
  from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as d(
    power text,
    user_id uuid,
    guest_id text,
    guest_display_name text,
    joined_at timestamp with time zone,
    surrendered boolean,
    surrendered_at timestamp with time zone,
    game_over_seen_at timestamp with time zone,
    is_finalized boolean
  )
  where gp.game_id = p_game_id
    and gp.left_at is null
    and gp.power = d.power
    and gp.user_id is not distinct from d.user_id
    and gp.guest_id is not distinct from d.guest_id;

  -- 3. Insert newly claimed seats.
  insert into public.game_participants (
    game_id,
    power,
    user_id,
    guest_id,
    guest_display_name,
    joined_at,
    left_at,
    joined_phase_index,
    left_phase_index,
    surrendered,
    surrendered_at,
    game_over_seen_at,
    is_finalized
  )
  select
    p_game_id,
    d.power,
    d.user_id,
    d.guest_id,
    case when d.user_id is null then d.guest_display_name else null end,
    coalesce(d.joined_at, v_now),
    null,
    v_phase_idx,
    null,
    coalesce(d.surrendered, false),
    d.surrendered_at,
    d.game_over_seen_at,
    coalesce(d.is_finalized, false)
  from jsonb_to_recordset(coalesce(p_seats, '[]'::jsonb)) as d(
    power text,
    user_id uuid,
    guest_id text,
    guest_display_name text,
    joined_at timestamp with time zone,
    surrendered boolean,
    surrendered_at timestamp with time zone,
    game_over_seen_at timestamp with time zone,
    is_finalized boolean
  )
  where not exists (
    select 1
    from public.game_participants gp
    where gp.game_id = p_game_id
      and gp.power = d.power
      and gp.left_at is null
  );
end;
$$;

revoke all on function public.sync_game_participants(uuid, jsonb, text[], integer) from public, anon, authenticated;
grant execute on function public.sync_game_participants(uuid, jsonb, text[], integer) to service_role;

-- ============================================================================
-- 4. Create public.game_phases (Normalized Resolved Phase Snapshots)
-- ============================================================================

create table if not exists public.game_phases (
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  phase_index integer not null check (phase_index >= 0),
  year smallint not null,
  season text not null check (season ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$'),
  phase text not null check (phase ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$'),
  state_revision bigint not null default 1,
  resolved_at timestamp with time zone not null default timezone('utc'::text, now()),
  snapshot jsonb not null,
  primary key (game_id, phase_index)
);

alter table public.game_phases enable row level security;

drop policy if exists "Only service role can select game_phases" on public.game_phases;
create policy "Only service role can select game_phases"
  on public.game_phases for select
  to service_role
  using (true);

drop policy if exists "Only service role can insert game_phases" on public.game_phases;
create policy "Only service role can insert game_phases"
  on public.game_phases for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update game_phases" on public.game_phases;
create policy "Only service role can update game_phases"
  on public.game_phases for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete game_phases" on public.game_phases;
create policy "Only service role can delete game_phases"
  on public.game_phases for delete
  to service_role
  using (true);

-- ============================================================================
-- 5. Create Normalized Press Tables
-- ============================================================================

create table if not exists public.press_threads (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  thread_key text not null,
  thread_type text not null check (thread_type in ('public', 'direct', 'group')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (game_id, thread_key),
  unique (id, game_id)
);

alter table public.press_threads enable row level security;

drop policy if exists "Only service role can select press_threads" on public.press_threads;
create policy "Only service role can select press_threads"
  on public.press_threads for select
  to service_role
  using (true);

drop policy if exists "Only service role can insert press_threads" on public.press_threads;
create policy "Only service role can insert press_threads"
  on public.press_threads for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update press_threads" on public.press_threads;
create policy "Only service role can update press_threads"
  on public.press_threads for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete press_threads" on public.press_threads;
create policy "Only service role can delete press_threads"
  on public.press_threads for delete
  to service_role
  using (true);

create table if not exists public.press_thread_members (
  thread_id uuid not null references public.press_threads(id) on delete cascade,
  power text not null check (power ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  joined_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (thread_id, power)
);

alter table public.press_thread_members enable row level security;

drop policy if exists "Only service role can select press_thread_members" on public.press_thread_members;
create policy "Only service role can select press_thread_members"
  on public.press_thread_members for select
  to service_role
  using (true);

drop policy if exists "Only service role can insert press_thread_members" on public.press_thread_members;
create policy "Only service role can insert press_thread_members"
  on public.press_thread_members for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update press_thread_members" on public.press_thread_members;
create policy "Only service role can update press_thread_members"
  on public.press_thread_members for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete press_thread_members" on public.press_thread_members;
create policy "Only service role can delete press_thread_members"
  on public.press_thread_members for delete
  to service_role
  using (true);

create table if not exists public.press_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  thread_id uuid not null,
  seq integer not null check (seq >= 1),
  sender_power text not null check (sender_power ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  is_anonymous boolean not null default false,
  year smallint not null,
  season text not null check (season ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$'),
  phase text not null check (phase ~ '^[A-Za-z][A-Za-z0-9_]{0,31}$'),
  body text not null default '',
  sent_at timestamp with time zone not null default timezone('utc'::text, now()),
  meta jsonb not null default '{}'::jsonb,
  unique (game_id, seq),
  constraint press_messages_thread_game_fkey
    foreign key (thread_id, game_id) references public.press_threads(id, game_id) on delete cascade
);

create index if not exists idx_press_messages_thread_game_seq
  on public.press_messages (thread_id, game_id, seq);

alter table public.press_messages enable row level security;

drop policy if exists "Only service role can select press_messages" on public.press_messages;
create policy "Only service role can select press_messages"
  on public.press_messages for select
  to service_role
  using (true);

drop policy if exists "Only service role can insert press_messages" on public.press_messages;
create policy "Only service role can insert press_messages"
  on public.press_messages for insert
  to service_role
  with check (true);

drop policy if exists "Only service role can update press_messages" on public.press_messages;
create policy "Only service role can update press_messages"
  on public.press_messages for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "Only service role can delete press_messages" on public.press_messages;
create policy "Only service role can delete press_messages"
  on public.press_messages for delete
  to service_role
  using (true);

-- ============================================================================
-- 6. Idempotent Data Backfill
-- ============================================================================

-- 6a. Normalize legacy status values to canonical application statuses.
update public.multiplayer_games
set status = case status
  when 'lobby' then 'waiting'
  when 'in_progress' then 'active'
  else status
end
where status in ('lobby', 'in_progress');

-- 6b. Promote legacy packed game_state->summary / passcode / history metadata onto multiplayer_games.
-- Guarded so rows already written in the normalized format (no 'state' wrapper) are never overwritten.
with src as (
  select
    g.id,
    coalesce(
      case when jsonb_typeof(g.game_state -> 'summary') = 'object' then g.game_state -> 'summary' end,
      case when jsonb_typeof(g.summary) = 'object' and g.summary <> '{}'::jsonb then g.summary end
    ) as sum_obj,
    case
      when g.game_state ? 'state' and jsonb_typeof(g.game_state -> 'state') = 'object'
      then g.game_state -> 'state'
      else g.game_state
    end as st_obj,
    nullif(btrim(coalesce(g.game_state ->> 'passcode', g.passcode, '')), '') as eff_passcode,
    case
      when jsonb_typeof(g.history) = 'array' and jsonb_array_length(g.history) > 0
      then jsonb_array_length(g.history)
      when jsonb_typeof(g.game_state -> 'history') = 'array'
      then jsonb_array_length(g.game_state -> 'history')
      else 0
    end as hist_len,
    g.host_user_id as cur_host_uid,
    g.is_sandbox as cur_is_sandbox,
    g.is_private as cur_is_private
  from public.multiplayer_games g
  where (g.game_state ? 'state')
     or (g.game_type = 'PUBLIC' and (g.is_sandbox or g.is_private))
     or (g.current_phase_index = 0 and (
          (jsonb_typeof(g.history) = 'array' and jsonb_array_length(g.history) > 0)
          or (jsonb_typeof(g.game_state -> 'history') = 'array' and jsonb_array_length(g.game_state -> 'history') > 0)
        ))
),
resolved as (
  select
    s.id,
    case
      when coalesce((s.sum_obj ->> 'is_sandbox')::boolean, s.cur_is_sandbox, false)
        and coalesce((s.sum_obj ->> 'is_draft')::boolean, false)
      then 'DRAFT'
      when coalesce((s.sum_obj ->> 'is_sandbox')::boolean, s.cur_is_sandbox, false)
      then 'SANDBOX'
      when coalesce((s.sum_obj ->> 'is_private')::boolean, s.cur_is_private, false)
      then 'PRIVATE'
      else 'PUBLIC'
    end as next_game_type,
    coalesce(nullif(btrim(s.st_obj ->> 'scenario_id'), ''), 'standard_1901') as next_scenario_id,
    s.eff_passcode as next_passcode,
    case
      when s.cur_host_uid is not null then s.cur_host_uid
      when coalesce(s.sum_obj ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (select 1 from auth.users u where u.id = (s.sum_obj ->> 'creator_id')::uuid)
      then (s.sum_obj ->> 'creator_id')::uuid
      else null
    end as next_host_uid,
    case
      when s.cur_host_uid is not null then null
      when coalesce(s.sum_obj ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (select 1 from auth.users u where u.id = (s.sum_obj ->> 'creator_id')::uuid)
      then null
      when nullif(btrim(coalesce(s.sum_obj ->> 'creator_id', '')), '') is not null
        and position('@' in (s.sum_obj ->> 'creator_id')) = 0
      then btrim(s.sum_obj ->> 'creator_id')
      else null
    end as next_creator_guest_id,
    nullif(btrim(coalesce(s.sum_obj ->> 'winner', s.st_obj ->> 'winner', '')), '') as next_winner,
    nullif(s.sum_obj ->> 'completed_at', '')::timestamp with time zone as next_completed_at,
    nullif(s.sum_obj ->> 'last_moved_at', '')::timestamp with time zone as next_last_moved_at,
    case
      when coalesce(s.sum_obj ->> 'deadline', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then to_timestamp((s.sum_obj ->> 'deadline')::double precision)
      when (s.st_obj -> 'timer' ->> 'stage') = 'running'
        and coalesce(s.st_obj -> 'timer' ->> 'deadline', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then to_timestamp((s.st_obj -> 'timer' ->> 'deadline')::double precision)
      else null
    end as next_deadline,
    coalesce((s.st_obj ->> 'state_revision')::bigint, 1) as next_state_rev,
    s.hist_len as next_phase_idx
  from src s
)
update public.multiplayer_games g
set
  game_type = r.next_game_type,
  is_sandbox = (r.next_game_type in ('SANDBOX', 'DRAFT')),
  is_private = (r.next_game_type = 'PRIVATE'),
  scenario_id = r.next_scenario_id,
  passcode = r.next_passcode,
  host_user_id = r.next_host_uid,
  creator_guest_id = r.next_creator_guest_id,
  winner = coalesce(g.winner, r.next_winner),
  completed_at = coalesce(g.completed_at, r.next_completed_at),
  last_moved_at = coalesce(g.last_moved_at, r.next_last_moved_at),
  deadline = coalesce(g.deadline, r.next_deadline),
  state_revision = greatest(g.state_revision, r.next_state_rev),
  current_phase_index = greatest(g.current_phase_index, r.next_phase_idx)
from resolved r
where g.id = r.id
  and (
    g.game_type is distinct from r.next_game_type
    or g.is_sandbox is distinct from (r.next_game_type in ('SANDBOX', 'DRAFT'))
    or g.is_private is distinct from (r.next_game_type = 'PRIVATE')
    or g.scenario_id is distinct from r.next_scenario_id
    or g.passcode is distinct from r.next_passcode
    or g.host_user_id is distinct from r.next_host_uid
    or g.creator_guest_id is distinct from r.next_creator_guest_id
    or coalesce(g.winner, r.next_winner) is distinct from g.winner
    or coalesce(g.completed_at, r.next_completed_at) is distinct from g.completed_at
    or coalesce(g.last_moved_at, r.next_last_moved_at) is distinct from g.last_moved_at
    or coalesce(g.deadline, r.next_deadline) is distinct from g.deadline
    or greatest(g.state_revision, r.next_state_rev) is distinct from g.state_revision
    or greatest(g.current_phase_index, r.next_phase_idx) is distinct from g.current_phase_index
  );

-- 6c. Backfill public.game_participants for games that have no participant rows yet.
with part_rows as (
  select
    g.id as game_id,
    p.key as power,
    p.value as pdata,
    g.created_at as game_created_at,
    coalesce(
      case when jsonb_typeof(g.game_state -> 'summary') = 'object' then g.game_state -> 'summary' end,
      case when jsonb_typeof(g.summary) = 'object' and g.summary <> '{}'::jsonb then g.summary end,
      '{}'::jsonb
    ) as sum_obj,
    case
      when g.game_state ? 'state' and jsonb_typeof(g.game_state -> 'state') = 'object'
      then g.game_state -> 'state'
      else g.game_state
    end as st_obj
  from public.multiplayer_games g
  cross join lateral jsonb_each(
    coalesce(
      case when jsonb_typeof(g.game_state -> 'summary' -> 'participants') = 'object'
        then g.game_state -> 'summary' -> 'participants' end,
      case when jsonb_typeof(g.summary -> 'participants') = 'object'
        then g.summary -> 'participants' end,
      '{}'::jsonb
    )
  ) as p(key, value)
  where not exists (
    select 1 from public.game_participants gp where gp.game_id = g.id
  )
)
insert into public.game_participants (
  game_id,
  power,
  user_id,
  guest_id,
  guest_display_name,
  joined_at,
  left_at,
  joined_phase_index,
  left_phase_index,
  surrendered,
  surrendered_at,
  game_over_seen_at,
  is_finalized
)
select
  pr.game_id,
  pr.power,
  case
    when coalesce(pr.pdata ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from auth.users u where u.id = (pr.pdata ->> 'user_id')::uuid)
    then (pr.pdata ->> 'user_id')::uuid
    else null
  end as user_id,
  case
    when coalesce(pr.pdata ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from auth.users u where u.id = (pr.pdata ->> 'user_id')::uuid)
    then null
    else coalesce(
      nullif(
        case
          when position('@' in coalesce(pr.pdata ->> 'user_id', '')) > 0 then 'guest'
          else btrim(coalesce(pr.pdata ->> 'user_id', ''))
        end,
        ''
      ),
      'guest'
    )
  end as guest_id,
  case
    when coalesce(pr.pdata ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (select 1 from auth.users u where u.id = (pr.pdata ->> 'user_id')::uuid)
    then null
    when nullif(btrim(coalesce(pr.pdata ->> 'display_name', '')), '') is not null
      and position('@' in (pr.pdata ->> 'display_name')) = 0
    then btrim(pr.pdata ->> 'display_name')
    else null
  end as guest_display_name,
  coalesce(nullif(pr.pdata ->> 'joined_at', '')::timestamp with time zone, pr.game_created_at, timezone('utc'::text, now())),
  null,
  0,
  null,
  coalesce((pr.pdata ->> 'surrendered')::boolean, false),
  nullif(pr.pdata ->> 'surrendered_at', '')::timestamp with time zone,
  nullif(pr.pdata ->> 'game_over_seen_at', '')::timestamp with time zone,
  exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(pr.sum_obj -> 'finalized_powers', pr.st_obj -> 'finalized_powers', '[]'::jsonb)
    ) fp
    where fp = pr.power
  )
from part_rows pr
on conflict do nothing;

-- 6d. Backfill public.game_phases for games that have no phase rows yet.
insert into public.game_phases (
  game_id,
  phase_index,
  year,
  season,
  phase,
  state_revision,
  resolved_at,
  snapshot
)
select
  g.id as game_id,
  (arr.ord - 1)::integer as phase_index,
  coalesce((arr.snap ->> 'year')::smallint, g.year, 1901) as year,
  coalesce(nullif(arr.snap ->> 'season', ''), g.season, 'Spring') as season,
  coalesce(nullif(arr.snap ->> 'phase', ''), g.phase, 'Movement') as phase,
  coalesce((arr.snap ->> 'state_revision')::bigint, 1) as state_revision,
  coalesce(g.last_moved_at, g.updated_at, g.created_at, timezone('utc'::text, now())) as resolved_at,
  case
    when (arr.snap ->> 'phase') = 'Admin'
      and (arr.snap ? 'last_resolution')
      and not (arr.snap ? 'admin_resolution')
    then (
      (arr.snap - 'admin_log' - 'turn_history' - 'unit_options' - 'preview' - 'issues' - 'timer' - 'finalized_powers' - 'last_resolution')
      || jsonb_build_object('admin_resolution', arr.snap -> 'last_resolution')
    )
    else (arr.snap - 'admin_log' - 'turn_history' - 'unit_options' - 'preview' - 'issues' - 'timer' - 'finalized_powers' - 'last_resolution')
  end as snapshot
from public.multiplayer_games g
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(g.history) = 'array' and jsonb_array_length(g.history) > 0 then g.history
    when jsonb_typeof(g.game_state -> 'history') = 'array' then g.game_state -> 'history'
    else '[]'::jsonb
  end
) with ordinality as arr(snap, ord)
where not exists (
  select 1 from public.game_phases ph where ph.game_id = g.id
)
  and jsonb_typeof(arr.snap) = 'object'
on conflict (game_id, phase_index) do nothing;

-- 6e. Backfill normalized press_threads, press_thread_members, and press_messages
-- in separate statements so each step sees rows committed by the previous statement.
with raw_msgs as (
  select
    g.id as game_id,
    m as msg,
    m ->> 'sender' as sender_power,
    coalesce(
      array(
        select distinct r
        from jsonb_array_elements_text(coalesce(m -> 'recipients', '[]'::jsonb)) as r
        where r <> (m ->> 'sender')
        order by r
      ),
      '{}'::text[]
    ) as recips
  from public.multiplayer_games g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.press) = 'array' then g.press else '[]'::jsonb end
  ) as m
  where not exists (
    select 1 from public.press_messages pm where pm.game_id = g.id
  )
    and jsonb_typeof(m) = 'object'
    and coalesce(m ->> 'sender', '') ~ '^[A-Z][A-Z0-9_]{1,31}$'
    and (m ->> 'seq') ~ '^[0-9]+$'
),
msg_with_thread as (
  select
    rm.game_id,
    rm.msg,
    rm.sender_power,
    case
      when coalesce(array_length(rm.recips, 1), 0) = 0 then 'public'
      else array_to_string(
        array(
          select distinct p
          from unnest(array[rm.sender_power] || rm.recips) as p
          order by p
        ),
        '_'
      )
    end as thread_key,
    case
      when coalesce(array_length(rm.recips, 1), 0) = 0 then 'public'
      when coalesce(array_length(rm.recips, 1), 0) = 1 then 'direct'
      else 'group'
    end as thread_type
  from raw_msgs rm
)
insert into public.press_threads (game_id, thread_key, thread_type, created_at)
select distinct on (mt.game_id, mt.thread_key)
  mt.game_id,
  mt.thread_key,
  mt.thread_type,
  coalesce(nullif(mt.msg ->> 'sent_at', '')::timestamp with time zone, timezone('utc'::text, now()))
from msg_with_thread mt
order by mt.game_id, mt.thread_key, (mt.msg ->> 'seq')::integer asc
on conflict (game_id, thread_key) do nothing;

with raw_msgs as (
  select
    g.id as game_id,
    m ->> 'sender' as sender_power,
    coalesce(
      array(
        select distinct r
        from jsonb_array_elements_text(coalesce(m -> 'recipients', '[]'::jsonb)) as r
        where r <> (m ->> 'sender')
        order by r
      ),
      '{}'::text[]
    ) as recips
  from public.multiplayer_games g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.press) = 'array' then g.press else '[]'::jsonb end
  ) as m
  where not exists (
    select 1 from public.press_messages pm where pm.game_id = g.id
  )
    and jsonb_typeof(m) = 'object'
    and coalesce(m ->> 'sender', '') ~ '^[A-Z][A-Z0-9_]{1,31}$'
    and (m ->> 'seq') ~ '^[0-9]+$'
),
msg_members as (
  select
    rm.game_id,
    array_to_string(
      array(
        select distinct p
        from unnest(array[rm.sender_power] || rm.recips) as p
        order by p
      ),
      '_'
    ) as thread_key,
    array(
      select distinct p
      from unnest(array[rm.sender_power] || rm.recips) as p
      order by p
    ) as members
  from raw_msgs rm
  where coalesce(array_length(rm.recips, 1), 0) > 0
)
insert into public.press_thread_members (thread_id, power, joined_at)
select distinct
  pt.id,
  mem.power,
  pt.created_at
from msg_members mm
join public.press_threads pt
  on pt.game_id = mm.game_id and pt.thread_key = mm.thread_key
cross join lateral unnest(mm.members) as mem(power)
on conflict (thread_id, power) do nothing;

with raw_msgs as (
  select
    g.id as game_id,
    m as msg,
    m ->> 'sender' as sender_power,
    coalesce(
      array(
        select distinct r
        from jsonb_array_elements_text(coalesce(m -> 'recipients', '[]'::jsonb)) as r
        where r <> (m ->> 'sender')
        order by r
      ),
      '{}'::text[]
    ) as recips
  from public.multiplayer_games g
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(g.press) = 'array' then g.press else '[]'::jsonb end
  ) as m
  where not exists (
    select 1 from public.press_messages pm where pm.game_id = g.id
  )
    and jsonb_typeof(m) = 'object'
    and coalesce(m ->> 'sender', '') ~ '^[A-Z][A-Z0-9_]{1,31}$'
    and (m ->> 'seq') ~ '^[0-9]+$'
),
msg_with_thread as (
  select
    rm.game_id,
    rm.msg,
    rm.sender_power,
    case
      when coalesce(array_length(rm.recips, 1), 0) = 0 then 'public'
      else array_to_string(
        array(
          select distinct p
          from unnest(array[rm.sender_power] || rm.recips) as p
          order by p
        ),
        '_'
      )
    end as thread_key
  from raw_msgs rm
)
insert into public.press_messages (
  id,
  game_id,
  thread_id,
  seq,
  sender_power,
  is_anonymous,
  year,
  season,
  phase,
  body,
  sent_at,
  meta
)
select
  case
    when coalesce(mt.msg ->> 'id', '') ~* '^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (mt.msg ->> 'id')::uuid
    else gen_random_uuid()
  end as id,
  mt.game_id,
  pt.id as thread_id,
  (mt.msg ->> 'seq')::integer as seq,
  mt.sender_power,
  coalesce((mt.msg ->> 'anonymous')::boolean, false) as is_anonymous,
  coalesce((mt.msg ->> 'year')::smallint, 1901) as year,
  coalesce(nullif(mt.msg ->> 'season', ''), 'Spring') as season,
  coalesce(nullif(mt.msg ->> 'phase', ''), 'Movement') as phase,
  coalesce(mt.msg ->> 'body', '') as body,
  coalesce(nullif(mt.msg ->> 'sent_at', '')::timestamp with time zone, timezone('utc'::text, now())) as sent_at,
  jsonb_strip_nulls(
    jsonb_build_object(
      'orders', case when jsonb_typeof(mt.msg -> 'orders') = 'array' and jsonb_array_length(mt.msg -> 'orders') > 0 then mt.msg -> 'orders' else null end,
      'numbers', case when jsonb_typeof(mt.msg -> 'numbers') = 'object' and (mt.msg -> 'numbers') <> '{}'::jsonb then mt.msg -> 'numbers' else null end,
      'public_number', case when (mt.msg ? 'public_number') and coalesce((mt.msg ->> 'public_number')::integer, 0) > 0 then mt.msg -> 'public_number' else null end
    )
  ) as meta
from msg_with_thread mt
join public.press_threads pt
  on pt.game_id = mt.game_id and pt.thread_key = mt.thread_key
on conflict do nothing;
