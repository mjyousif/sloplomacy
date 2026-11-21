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

  -- 5. Email-like/invalid display_name metadata must default to 'Envoy', whitespace collapses, and legacy emails/actors must be stripped.
  declare
    u3 uuid := '33333333-3333-3333-3333-333333333333';
    u4 uuid := '44444444-4444-4444-4444-444444444444';
    u5 uuid := '55555555-5555-5555-5555-555555555555';
    u6 uuid := '66666666-6666-6666-6666-666666666666';
    name3 text;
    name4 text;
    name5 text;
    name6 text;
  begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (u3, 'secret.user@example.com', '{"display_name": "secret.user@example.com"}'::jsonb);

    select display_name into name3 from public.profiles where id = u3;
    if name3 is distinct from 'Envoy' then
      raise exception 'Expected email display_name metadata to default to Envoy, got %', name3;
    end if;

    insert into auth.users (id, email, raw_user_meta_data)
    values (u4, 'moltke@example.com', '{"display_name": "  Von   Moltke  "}'::jsonb);

    select display_name into name4 from public.profiles where id = u4;
    if name4 is distinct from 'Von Moltke' then
      raise exception 'Expected collapsed whitespace name Von Moltke, got %', name4;
    end if;

    insert into auth.users (id, email, raw_user_meta_data)
    values (u5, 'short@example.com', '{"display_name": "X"}'::jsonb);

    select display_name into name5 from public.profiles where id = u5;
    if name5 is distinct from 'Envoy' then
      raise exception 'Expected 1-char display_name metadata to default to Envoy, got %', name5;
    end if;

    insert into auth.users (id, email, raw_user_meta_data)
    values (u6, 'long@example.com', '{"display_name": "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}'::jsonb);

    select display_name into name6 from public.profiles where id = u6;
    if name6 is distinct from 'Envoy' then
      raise exception 'Expected >24-char display_name metadata to default to Envoy, got %', name6;
    end if;

    insert into public.multiplayer_games (room_code, name, host_user_id, status, summary, game_state, history)
    values (
      'mig_test_email_strip',
      'Email Strip Game',
      u3,
      'in_progress',
      jsonb_build_object(
        'game_id', 'mig_test_email_strip',
        'created_by', 'secret.user@example.com',
        'creator_id', u3::text,
        'participants', jsonb_build_object(
          'FRANCE', jsonb_build_object(
            'user_id', u3::text,
            'email', 'secret.user@example.com',
            'display_name', 'secret.user@example.com',
            'power', 'FRANCE'
          ),
          'ITALY', jsonb_build_object(
            'user_id', 'guest',
            'email', 'guest@diplomacy.local',
            'display_name', 'GuestEnvoy',
            'power', 'ITALY'
          )
        )
      ),
      jsonb_build_object(
        'summary', jsonb_build_object(
          'game_id', 'mig_test_email_strip',
          'created_by', 'secret.user@example.com',
          'creator_id', u3::text,
          'participants', jsonb_build_object(
            'FRANCE', jsonb_build_object(
              'user_id', u3::text,
              'email', 'secret.user@example.com',
              'display_name', 'SecretName',
              'power', 'FRANCE'
            )
          )
        ),
        'state', jsonb_build_object(
          'admin_log', jsonb_build_array(
            jsonb_build_object(
              'id', 'log1',
              'actor_id', u3::text,
              'actor', 'secret.user@example.com',
              'acknowledged_by', jsonb_build_array(u3::text, 'secret.user@example.com', 'FRANCE')
            ),
            jsonb_build_object(
              'id', 'log2',
              'actor', u3::text,
              'acknowledged_by', jsonb_build_array('FRANCE')
            )
          ),
          'turn_history', jsonb_build_array(
            'FRANCE (secret.user@example.com) has formally surrendered!',
            'Spring 1901 Movement resolved.'
          )
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'season', 'Spring',
          'year', 1901,
          'phase', 'Movement',
          'admin_log', jsonb_build_array(
            jsonb_build_object(
              'id', 'hlog1',
              'actor_id', u3::text,
              'actor', 'secret.user@example.com',
              'acknowledged_by', jsonb_build_array(u3::text, 'secret.user@example.com', 'FRANCE')
            ),
            jsonb_build_object(
              'id', 'hlog2',
              'actor', u3::text,
              'acknowledged_by', jsonb_build_array('FRANCE')
            )
          ),
          'turn_history', jsonb_build_array(
            'FRANCE (secret.user@example.com) has formally surrendered!',
            'Spring 1901 Movement resolved.'
          )
        )
      )
    );
  end;
end
$$;

\i supabase/migrations/20261121000000_strip_emails_and_normalize_identities.sql

do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  gs jsonb;
  top_sum jsonb;
  hist jsonb;
  log_entry jsonb;
  log_entry_uuid jsonb;
  hlog_entry jsonb;
  hlog_entry_uuid jsonb;
begin
  select game_state, summary, history into gs, top_sum, hist
  from public.multiplayer_games
  where room_code = 'mig_test_email_strip';

  if top_sum ? 'created_by' or (gs -> 'summary') ? 'created_by' then
    raise exception 'Expected created_by to be stripped from both summaries';
  end if;
  if (top_sum -> 'participants' -> 'FRANCE') ? 'email'
     or (top_sum -> 'participants' -> 'ITALY') ? 'email'
     or (gs -> 'summary' -> 'participants' -> 'FRANCE') ? 'email' then
    raise exception 'Expected participant emails to be stripped';
  end if;
  if (top_sum -> 'participants' -> 'FRANCE') ? 'display_name'
     or (gs -> 'summary' -> 'participants' -> 'FRANCE') ? 'display_name' then
    raise exception 'Expected UUID participant display_name to be stripped';
  end if;
  if (top_sum -> 'participants' -> 'ITALY' ->> 'display_name') is distinct from 'GuestEnvoy' then
    raise exception 'Expected guest display_name to remain GuestEnvoy';
  end if;

  log_entry := gs -> 'state' -> 'admin_log' -> 0;
  if log_entry ? 'actor' then
    raise exception 'Expected UUID/email actor to be stripped from admin_log, got %', log_entry;
  end if;
  if (log_entry -> 'acknowledged_by') @> '["secret.user@example.com"]'::jsonb then
    raise exception 'Expected email to be stripped from acknowledged_by, got %', log_entry -> 'acknowledged_by';
  end if;

  log_entry_uuid := gs -> 'state' -> 'admin_log' -> 1;
  if log_entry_uuid ? 'actor' then
    raise exception 'Expected raw UUID actor to be stripped from admin_log, got %', log_entry_uuid;
  end if;

  if (gs -> 'state' -> 'turn_history' ->> 0) is distinct from 'FRANCE (Envoy) has formally surrendered!'
     or (gs -> 'state' -> 'turn_history' ->> 1) is distinct from 'Spring 1901 Movement resolved.' then
    raise exception 'Expected email scrubbed from state.turn_history, got %', gs -> 'state' -> 'turn_history';
  end if;

  hlog_entry := hist -> 0 -> 'admin_log' -> 0;
  if hlog_entry ? 'actor' then
    raise exception 'Expected UUID/email actor to be stripped from history admin_log, got %', hlog_entry;
  end if;
  if (hlog_entry -> 'acknowledged_by') @> '["secret.user@example.com"]'::jsonb then
    raise exception 'Expected email to be stripped from history acknowledged_by, got %', hlog_entry -> 'acknowledged_by';
  end if;

  hlog_entry_uuid := hist -> 0 -> 'admin_log' -> 1;
  if hlog_entry_uuid ? 'actor' then
    raise exception 'Expected raw UUID actor to be stripped from history admin_log, got %', hlog_entry_uuid;
  end if;

  if (hist -> 0 -> 'turn_history' ->> 0) is distinct from 'FRANCE (Envoy) has formally surrendered!'
     or (hist -> 0 -> 'turn_history' ->> 1) is distinct from 'Spring 1901 Movement resolved.' then
    raise exception 'Expected email scrubbed from history.turn_history, got %', hist -> 0 -> 'turn_history';
  end if;

  -- 6. CHECK constraint on public.profiles blocks direct PostgREST writes with emails or invalid lengths.
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  begin
    update public.profiles set display_name = 'victim@example.com' where id = u1;
    raise exception 'Expected profiles_display_name_valid to reject email display_name';
  exception
    when check_violation then
      null;
  end;

  begin
    update public.profiles set display_name = 'A' where id = u1;
    raise exception 'Expected profiles_display_name_valid to reject 1-char display_name';
  exception
    when check_violation then
      null;
  end;

  reset role;
end
$$;
