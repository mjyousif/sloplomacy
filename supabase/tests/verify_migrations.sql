-- Behavioral assertions run after all supabase/migrations/*.sql have been applied twice.

grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  name1 text;
  name2 text;
  updated_count integer;
begin
  -- 1. OAuth / magic-link user without display_name must default to 'Envoy', never email prefix.
  insert into auth.users (id, email, raw_user_meta_data)
  values (u1, 'real.person@gmail.com', '{"full_name": "Real Person"}'::jsonb);

  select display_name into name1 from public.profiles where id = u1;
  if name1 is distinct from 'Envoy' then
    raise exception 'Expected default display_name to be Envoy, got %', name1;
  end if;

  -- 2. User who provided a display_name at signup keeps it.
  insert into auth.users (id, email, raw_user_meta_data)
  values (u2, 'bismarck@example.com', '{"display_name": "Bismarck"}'::jsonb);

  select display_name into name2 from public.profiles where id = u2;
  if name2 is distinct from 'Bismarck' then
    raise exception 'Expected display_name Bismarck, got %', name2;
  end if;

  -- 3. RLS on public.profiles: authenticated user u1 can update own row, not u2's row.
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  update public.profiles set display_name = 'Talleyrand' where id = u1;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'Expected authenticated user to update own profile, updated % rows', updated_count;
  end if;

  update public.profiles set display_name = 'Hacked' where id = u2;
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then
    raise exception 'Expected RLS to block updating another profile, updated % rows', updated_count;
  end if;

  reset role;
  select display_name into name2 from public.profiles where id = u2;
  if name2 is distinct from 'Bismarck' then
    raise exception 'Expected u2 profile to remain Bismarck, got %', name2;
  end if;

  -- 4. Seed a legacy multiplayer_games row with denormalized participant display_name.
  insert into public.multiplayer_games (room_code, name, host_user_id, status, game_state)
  values (
    'mig_test_norm',
    'Legacy Game',
    u1,
    'lobby',
    jsonb_build_object(
      'summary',
      jsonb_build_object(
        'game_id', 'mig_test_norm',
        'name', 'Legacy Game',
        'status', 'waiting',
        'created_by', 'real.person@gmail.com',
        'created_at', '2026-01-01T00:00:00Z',
        'participants', jsonb_build_object(
          'FRANCE', jsonb_build_object(
            'user_id', u1::text,
            'display_name', 'Real Person',
            'power', 'FRANCE'
          ),
          'ITALY', jsonb_build_object(
            'user_id', 'guest',
            'display_name', 'GuestPlayer',
            'power', 'ITALY'
          )
        )
      )
    )
  );
end
$$;

\i supabase/migrations/20261112000002_normalize_participant_names.sql

do $$
declare
  parts jsonb;
begin
  select game_state -> 'summary' -> 'participants' into parts
  from public.multiplayer_games
  where room_code = 'mig_test_norm';

  if (parts -> 'FRANCE') ? 'display_name' then
    raise exception 'Expected UUID participant display_name to be stripped, got %', parts -> 'FRANCE';
  end if;
  if (parts -> 'ITALY' ->> 'display_name') is distinct from 'GuestPlayer' then
    raise exception 'Expected guest participant display_name to remain GuestPlayer, got %', parts -> 'ITALY';
  end if;
end
$$;
