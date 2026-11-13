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
end
$$;
