-- Behavioral assertions run after all supabase/migrations/*.sql have been applied twice.

grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;
-- Mirror Supabase default table grants so RLS checks below prove RLS (not missing grants) blocks access.
grant select, insert, update, delete on
  public.multiplayer_games,
  public.game_participants,
  public.game_phases,
  public.press_threads,
  public.press_thread_members,
  public.press_messages
to anon, authenticated;

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

-- 7. Seed rich legacy multiplayer_games fixtures and run normalization migration twice.
do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  hist35 jsonb;
  press6 jsonb;
  m1 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  m2 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
  m3 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  m4 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
  m5 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5';
  m6 uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6';
begin
  select jsonb_agg(
    case
      when i = 5 then jsonb_build_object(
        'game_id', 'mig_norm_full',
        'season', 'Spring',
        'year', 1902,
        'phase', 'Admin',
        'units', jsonb_build_array(),
        'orders', jsonb_build_object(),
        'ownership', jsonb_build_object('PAR', 'FRANCE'),
        'last_resolution', jsonb_build_object('summary', jsonb_build_array('Admin edit'), 'new_units', jsonb_build_array(), 'new_ownership', jsonb_build_object('PAR', 'FRANCE'), 'resolutions', jsonb_build_object()),
        'admin_log', jsonb_build_array(jsonb_build_object('id', 'a1')),
        'turn_history', jsonb_build_array('Turn line'),
        'unit_options', jsonb_build_object('u', jsonb_build_object()),
        'preview', jsonb_build_object('summary', jsonb_build_array()),
        'issues', jsonb_build_array(),
        'finalized_powers', jsonb_build_array('FRANCE')
      )
      else jsonb_build_object(
        'game_id', 'mig_norm_full',
        'season', case when i % 2 = 0 then 'Spring' else 'Fall' end,
        'year', 1901 + (i / 2),
        'phase', 'Movement',
        'state_revision', i + 1,
        'units', jsonb_build_array(),
        'orders', jsonb_build_object(),
        'ownership', jsonb_build_object('PAR', 'FRANCE'),
        'admin_log', jsonb_build_array(jsonb_build_object('id', 'a_old')),
        'turn_history', jsonb_build_array('Verbose log line'),
        'unit_options', jsonb_build_object('u', jsonb_build_object()),
        'finalized_powers', jsonb_build_array('FRANCE')
      )
    end
    order by i
  ) into hist35
  from generate_series(0, 34) as i;

  press6 := jsonb_build_array(
    jsonb_build_object('id', m1::text, 'seq', 1, 'sender', 'FRANCE', 'anonymous', false, 'recipients', jsonb_build_array(), 'body', 'Public signed', 'sent_at', '2026-11-20T00:00:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 1, 'GERMANY', 1, 'ITALY', 1), 'public_number', 1),
    jsonb_build_object('id', m2::text, 'seq', 2, 'sender', 'GERMANY', 'anonymous', true, 'recipients', jsonb_build_array(), 'body', 'Public anon', 'sent_at', '2026-11-20T00:01:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 2, 'GERMANY', 2, 'ITALY', 2), 'public_number', 2),
    jsonb_build_object('id', m3::text, 'seq', 3, 'sender', 'FRANCE', 'anonymous', false, 'recipients', jsonb_build_array('GERMANY'), 'body', 'DM signed', 'sent_at', '2026-11-20T00:02:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 3, 'GERMANY', 3), 'orders', jsonb_build_array(jsonb_build_object('unit_id', 'FRA_A_PAR', 'power', 'FRANCE', 'unit_type', 'A', 'origin', 'PAR', 'order_type', 'MOVE', 'target', 'BUR'))),
    jsonb_build_object('id', m4::text, 'seq', 4, 'sender', 'GERMANY', 'anonymous', true, 'recipients', jsonb_build_array('FRANCE'), 'body', 'DM anon', 'sent_at', '2026-11-20T00:03:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 4, 'GERMANY', 4)),
    jsonb_build_object('id', m5::text, 'seq', 5, 'sender', 'ITALY', 'anonymous', false, 'recipients', jsonb_build_array('FRANCE', 'GERMANY'), 'body', 'Group signed', 'sent_at', '2026-11-20T00:04:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 5, 'GERMANY', 5, 'ITALY', 3)),
    jsonb_build_object('id', m6::text, 'seq', 6, 'sender', 'ITALY', 'anonymous', true, 'recipients', jsonb_build_array('FRANCE', 'GERMANY'), 'body', 'Group anon', 'sent_at', '2026-11-20T00:05:00Z', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'numbers', jsonb_build_object('FRANCE', 6, 'GERMANY', 6, 'ITALY', 4))
  );

  -- Reset normalized tables for mig_norm_* if re-running manually
  delete from public.multiplayer_games where room_code in ('mig_norm_full', 'mig_norm_priv', 'mig_norm_draft', 'mig_norm_sandbox');

  insert into public.multiplayer_games (room_code, name, host_user_id, status, phase, season, year, is_sandbox, is_private, passcode, game_state, history, press)
  values (
    'mig_norm_full',
    'Full Campaign 35',
    u1,
    'in_progress',
    'Movement',
    'Fall',
    1918,
    false,
    false,
    null,
    jsonb_build_object(
      'passcode', null,
      'summary', jsonb_build_object(
        'game_id', 'mig_norm_full',
        'name', 'Full Campaign 35',
        'status', 'active',
        'creator_id', u1::text,
        'created_at', '2026-11-20T00:00:00Z',
        'last_moved_at', '2026-11-25T12:00:00Z',
        'deadline', 1795651200.5,
        'finalized_powers', jsonb_build_array('FRANCE'),
        'is_sandbox', false,
        'is_private', false,
        'is_draft', false,
        'participants', jsonb_build_object(
          'FRANCE', jsonb_build_object('user_id', u1::text, 'power', 'FRANCE', 'joined_at', '2026-11-20T00:00:00Z', 'game_over_seen_at', '2026-11-24T00:00:00Z'),
          'GERMANY', jsonb_build_object('user_id', u2::text, 'power', 'GERMANY', 'joined_at', '2026-11-20T00:01:00Z', 'surrendered', true, 'surrendered_at', '2026-11-22T00:00:00Z'),
          'ITALY', jsonb_build_object('user_id', 'guest', 'display_name', 'GuestIta', 'power', 'ITALY', 'joined_at', '2026-11-20T00:02:00Z')
        )
      ),
      'state', jsonb_build_object(
        'game_id', 'mig_norm_full',
        'season', 'Fall',
        'year', 1918,
        'phase', 'Movement',
        'scenario_id', 'standard_1901',
        'state_revision', 42,
        'units', jsonb_build_array(jsonb_build_object('id', 'FRA_A_PAR', 'power', 'FRANCE', 'unit_type', 'A', 'province', 'PAR', 'is_dislodged', false)),
        'orders', jsonb_build_object(),
        'ownership', jsonb_build_object('PAR', 'FRANCE')
      )
    ),
    hist35,
    press6
  ),
  -- Private match with stale top-level is_private=false / passcode=null (reproducing prod drift)
  (
    'mig_norm_priv',
    'Secret Room',
    u1,
    'lobby',
    'Movement',
    'Spring',
    1901,
    false,
    false,
    null,
    jsonb_build_object(
      'passcode', 'enigma42',
      'summary', jsonb_build_object(
        'game_id', 'mig_norm_priv',
        'creator_id', u1::text,
        'is_private', true,
        'is_sandbox', false,
        'is_draft', false,
        'has_passcode', true,
        'participants', jsonb_build_object('FRANCE', jsonb_build_object('user_id', u1::text, 'power', 'FRANCE', 'joined_at', '2026-11-20T00:00:00Z'))
      ),
      'state', jsonb_build_object('game_id', 'mig_norm_priv', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'units', jsonb_build_array(), 'orders', jsonb_build_object(), 'ownership', jsonb_build_object())
    ),
    '[]'::jsonb,
    '[]'::jsonb
  ),
  -- Guest draft solo sandbox
  (
    'mig_norm_draft',
    'Guest Draft',
    null,
    'active',
    'Movement',
    'Spring',
    1901,
    false,
    false,
    null,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'game_id', 'mig_norm_draft',
        'creator_id', 'guest',
        'is_sandbox', true,
        'is_draft', true,
        'is_private', false,
        'participants', jsonb_build_object('FRANCE', jsonb_build_object('user_id', 'guest', 'display_name', 'Envoy', 'power', 'FRANCE', 'joined_at', '2026-11-20T00:00:00Z'))
      ),
      'state', jsonb_build_object('game_id', 'mig_norm_draft', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'units', jsonb_build_array(), 'orders', jsonb_build_object(), 'ownership', jsonb_build_object())
    ),
    '[]'::jsonb,
    '[]'::jsonb
  ),
  -- Saved sandbox
  (
    'mig_norm_sandbox',
    'Saved Sandbox',
    u2,
    'active',
    'Movement',
    'Spring',
    1901,
    false,
    false,
    null,
    jsonb_build_object(
      'summary', jsonb_build_object(
        'game_id', 'mig_norm_sandbox',
        'creator_id', u2::text,
        'is_sandbox', true,
        'is_draft', false,
        'is_private', false,
        'participants', jsonb_build_object('FRANCE', jsonb_build_object('user_id', u2::text, 'power', 'FRANCE', 'joined_at', '2026-11-20T00:00:00Z'))
      ),
      'state', jsonb_build_object('game_id', 'mig_norm_sandbox', 'season', 'Spring', 'year', 1901, 'phase', 'Movement', 'units', jsonb_build_array(), 'orders', jsonb_build_object(), 'ownership', jsonb_build_object())
    ),
    '[]'::jsonb,
    '[]'::jsonb
  );
end
$$;

-- Apply the normalization migration once, verify backfill immediately, then re-apply to prove idempotency.
\i supabase/migrations/20261125000000_normalize_games_phases_press.sql

do $$
declare
  g_id uuid;
  cnt integer;
begin
  select id into g_id from public.multiplayer_games where room_code = 'mig_norm_full';
  select count(*) into cnt from public.press_messages where game_id = g_id;
  if cnt <> 6 then
    raise exception 'Expected 6 press_messages on FIRST migration run, got %', cnt;
  end if;
end
$$;

\i supabase/migrations/20261125000000_normalize_games_phases_press.sql

-- 8. Assert promoted columns, backfill counts, soft-leave RPC, constraints, cascade, RLS & indexes.
do $$
declare
  u1 uuid := '11111111-1111-1111-1111-111111111111';
  u2 uuid := '22222222-2222-2222-2222-222222222222';
  u3 uuid := '33333333-3333-3333-3333-333333333333';
  g_full public.multiplayer_games%rowtype;
  g_priv public.multiplayer_games%rowtype;
  g_draft public.multiplayer_games%rowtype;
  g_sbx public.multiplayer_games%rowtype;
  cnt integer;
  p_row jsonb;
  t_other uuid;
  unindexed_fk_count integer;
begin
  select * into g_full from public.multiplayer_games where room_code = 'mig_norm_full';
  select * into g_priv from public.multiplayer_games where room_code = 'mig_norm_priv';
  select * into g_draft from public.multiplayer_games where room_code = 'mig_norm_draft';
  select * into g_sbx from public.multiplayer_games where room_code = 'mig_norm_sandbox';

  if g_full.game_type <> 'PUBLIC' or g_priv.game_type <> 'PRIVATE' or g_draft.game_type <> 'DRAFT' or g_sbx.game_type <> 'SANDBOX' then
    raise exception 'Unexpected game_type values: %, %, %, %', g_full.game_type, g_priv.game_type, g_draft.game_type, g_sbx.game_type;
  end if;
  if g_full.status <> 'active' or g_priv.status <> 'waiting' then
    raise exception 'Expected canonical statuses active/waiting, got % / %', g_full.status, g_priv.status;
  end if;
  if public.has_passcode(g_full) is not false or public.has_passcode(g_priv) is not true or g_priv.passcode <> 'enigma42' then
    raise exception 'Expected has_passcode false/true, got % / %', public.has_passcode(g_full), public.has_passcode(g_priv);
  end if;
  if (public.board_preview(g_full) -> 'ownership' ->> 'PAR') <> 'FRANCE' then
    raise exception 'Expected board_preview(g_full) to extract ownership, got %', public.board_preview(g_full);
  end if;
  if g_full.current_phase_index <> 35 or g_full.state_revision <> 42 or g_draft.creator_guest_id <> 'guest' then
    raise exception 'Unexpected phase/rev/guest creator: %, %, %', g_full.current_phase_index, g_full.state_revision, g_draft.creator_guest_id;
  end if;

  -- Verify year column is smallint
  select count(*) into cnt from information_schema.columns
  where table_schema = 'public' and table_name = 'multiplayer_games' and column_name = 'year' and data_type = 'smallint';
  if cnt <> 1 then
    raise exception 'Expected multiplayer_games.year to be smallint';
  end if;

  -- Verify 35 phases backfilled and stripped of turn_history/admin_log/unit_options/preview/finalized_powers
  select count(*) into cnt from public.game_phases where game_id = g_full.id;
  if cnt <> 35 then
    raise exception 'Expected 35 game_phases rows, got %', cnt;
  end if;
  select payload into p_row from public.game_phases where game_id = g_full.id and phase_index = 5;
  if p_row ? 'turn_history' or p_row ? 'admin_log' or p_row ? 'unit_options' or p_row ? 'preview' or p_row ? 'finalized_powers' or not (p_row ? 'admin_resolution') then
    raise exception 'Expected phase 5 payload to be stripped and migrate last_resolution -> admin_resolution, got %', p_row;
  end if;

  -- Verify 3 participants backfilled cleanly (no guest_display_name on UUID seats)
  select count(*) into cnt from public.game_participants where game_id = g_full.id and left_at is null;
  if cnt <> 3 then
    raise exception 'Expected 3 active participants, got %', cnt;
  end if;
  select count(*) into cnt from public.game_participants where game_id = g_full.id and user_id is not null and guest_display_name is not null;
  if cnt <> 0 then
    raise exception 'Expected 0 UUID participants with guest_display_name';
  end if;

  -- Verify 3 threads, 5 member rows (0 public + 2 DM + 3 group), 6 messages
  select count(*) into cnt from public.press_threads where game_id = g_full.id;
  if cnt <> 3 then
    raise exception 'Expected 3 press_threads, got %', cnt;
  end if;
  select count(*) into cnt from public.press_thread_members m join public.press_threads t on t.id = m.thread_id where t.game_id = g_full.id;
  if cnt <> 5 then
    raise exception 'Expected 5 press_thread_members, got %', cnt;
  end if;
  select count(*) into cnt from public.press_messages where game_id = g_full.id;
  if cnt <> 6 then
    raise exception 'Expected 6 press_messages, got %', cnt;
  end if;

  -- Verify sync_game_participants RPC preserves former players via soft-leave & phase attribution
  perform public.sync_game_participants(
    g_full.id,
    jsonb_build_array(
      jsonb_build_object('power', 'FRANCE', 'user_id', u1::text, 'is_finalized', true),
      jsonb_build_object('power', 'GERMANY', 'user_id', u3::text, 'is_finalized', false),
      jsonb_build_object('power', 'ITALY', 'guest_id', 'guest', 'guest_display_name', 'GuestIta')
    ),
    array['GERMANY']::text[],
    36
  );
  select count(*) into cnt from public.game_participants where game_id = g_full.id and power = 'GERMANY';
  if cnt <> 2 then
    raise exception 'Expected 2 GERMANY rows (former + replacement), got %', cnt;
  end if;
  select count(*) into cnt from public.game_participants where game_id = g_full.id and power = 'GERMANY' and user_id = u2 and left_at is not null and left_phase_index = 36 and surrendered = true;
  if cnt <> 1 then
    raise exception 'Expected former GERMANY player u2 preserved with left_phase_index=36 and surrendered=true';
  end if;
  select count(*) into cnt from public.game_participants where game_id = g_full.id and power = 'GERMANY' and user_id = u3 and left_at is null and joined_phase_index = 36;
  if cnt <> 1 then
    raise exception 'Expected new GERMANY player u3 active with joined_phase_index=36';
  end if;

  -- Verify CHECK constraints reject PII, invalid powers, empty passcodes, and cross-game press links
  begin
    insert into public.game_participants (game_id, power, user_id, guest_display_name)
    values (g_priv.id, 'AUSTRIA', u3, 'LeakName');
    raise exception 'Expected game_participants_uuid_no_guest_name to reject UUID with guest_display_name';
  exception when check_violation then null;
  end;

  begin
    insert into public.game_participants (game_id, power, guest_id, guest_display_name)
    values (g_priv.id, 'AUSTRIA', 'guest', 'bob@secret.com');
    raise exception 'Expected game_participants_guest_no_email to reject @ in guest_display_name';
  exception when check_violation then null;
  end;

  begin
    insert into public.game_participants (game_id, power, guest_id)
    values (g_priv.id, 'lowercase', 'guest');
    raise exception 'Expected game_participants_power_valid to reject lowercase power';
  exception when check_violation then null;
  end;

  insert into public.press_threads (game_id, thread_key, thread_type)
  values (g_priv.id, 'public', 'public')
  returning id into t_other;

  begin
    insert into public.press_messages (game_id, thread_id, seq, sender_power, year, season, phase, body)
    values (g_full.id, t_other, 99, 'FRANCE', 1901, 'Spring', 'Movement', 'Cross-game spoof');
    raise exception 'Expected press_messages_thread_game_fkey to reject cross-game thread_id';
  exception when foreign_key_violation then null;
  end;

  -- Verify public.lobby_games view is gone
  if exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'lobby_games') then
    raise exception 'Expected public.lobby_games view to be dropped';
  end if;

  -- Verify RLS & RPC lockdowns for anon and authenticated
  perform set_config('request.jwt.claim.sub', u1::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  select count(*) into cnt from public.multiplayer_games;
  if cnt <> 0 then raise exception 'authenticated saw % multiplayer_games rows', cnt; end if;
  select count(*) into cnt from public.game_participants;
  if cnt <> 0 then raise exception 'authenticated saw % game_participants rows', cnt; end if;
  select count(*) into cnt from public.game_phases;
  if cnt <> 0 then raise exception 'authenticated saw % game_phases rows', cnt; end if;
  select count(*) into cnt from public.press_threads;
  if cnt <> 0 then raise exception 'authenticated saw % press_threads rows', cnt; end if;
  select count(*) into cnt from public.press_thread_members;
  if cnt <> 0 then raise exception 'authenticated saw % press_thread_members rows', cnt; end if;
  select count(*) into cnt from public.press_messages;
  if cnt <> 0 then raise exception 'authenticated saw % press_messages rows', cnt; end if;

  begin
    perform public.handle_new_user();
    raise exception 'Expected authenticated to be denied execute on handle_new_user';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.sync_game_participants(g_full.id, '[]'::jsonb);
    raise exception 'Expected authenticated to be denied execute on sync_game_participants';
  exception when insufficient_privilege then null;
  end;

  reset role;

  -- Verify ON DELETE CASCADE removes all child rows
  delete from public.multiplayer_games where id = g_full.id;
  if exists (select 1 from public.game_participants where game_id = g_full.id)
     or exists (select 1 from public.game_phases where game_id = g_full.id)
     or exists (select 1 from public.press_threads where game_id = g_full.id)
     or exists (select 1 from public.press_messages where game_id = g_full.id) then
    raise exception 'Expected ON DELETE CASCADE to clean all child tables';
  end if;

  -- Verify zero unindexed foreign keys across public.*
  select count(*) into unindexed_fk_count
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and c.contype = 'f'
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = c.conrelid
        and i.indisvalid
        and (
          select array_agg(k order by pos)
          from unnest(i.indkey) with ordinality as u(k, pos)
          where pos <= array_length(c.conkey, 1)
        ) = c.conkey::smallint[]
    );
  if unindexed_fk_count <> 0 then
    raise exception 'Found % unindexed foreign key constraints in public schema', unindexed_fk_count;
  end if;
end
$$;
