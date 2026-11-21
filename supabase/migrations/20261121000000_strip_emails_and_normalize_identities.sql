-- Strip all denormalized emails and UUID display/actor names from multiplayer_games,
-- enforce 'Envoy' default (never email) in public.profiles, and backfill missing profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text := regexp_replace(
    btrim(coalesce(new.raw_user_meta_data->>'display_name', '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when raw_name = ''
        or position('@' in raw_name) > 0
        or char_length(raw_name) < 2
        or char_length(raw_name) > 24
      then 'Envoy'
      else raw_name
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill missing profiles for existing auth.users rows.
insert into public.profiles (id, display_name)
select
  u.id,
  case
    when n.clean = ''
      or position('@' in n.clean) > 0
      or char_length(n.clean) < 2
      or char_length(n.clean) > 24
    then 'Envoy'
    else n.clean
  end
from auth.users u
cross join lateral (
  select regexp_replace(
    btrim(coalesce(u.raw_user_meta_data->>'display_name', '')),
    '[[:space:]]+',
    ' ',
    'g'
  ) as clean
) n
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- Scrub any blank, out-of-bounds, or email-like display_name in public.profiles,
-- and enforce the invariant with a table CHECK constraint.
update public.profiles p
set
  display_name = n.normalized,
  updated_at = timezone('utc'::text, now())
from (
  select
    id,
    case
      when clean = ''
        or position('@' in clean) > 0
        or char_length(clean) < 2
        or char_length(clean) > 24
      then 'Envoy'
      else clean
    end as normalized
  from (
    select
      id,
      regexp_replace(btrim(coalesce(display_name, '')), '[[:space:]]+', ' ', 'g') as clean
    from public.profiles
  ) s
) n
where p.id = n.id
  and p.display_name is distinct from n.normalized;

alter table public.profiles
  drop constraint if exists profiles_display_name_valid;

alter table public.profiles
  add constraint profiles_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 2 and 24
    and position('@' in display_name) = 0
  );

-- Strip created_by, participant emails, UUID participant display_names, and admin_log emails/UUID actors
-- from public.multiplayer_games (top-level summary, game_state, and history snapshots).
with cleaned as (
  select
    g.id,
    case
      when jsonb_typeof(g.summary) = 'object' then
        case
          when jsonb_typeof(g.summary -> 'participants') = 'object' then
            jsonb_set(
              g.summary - 'created_by',
              '{participants}',
              (
                select coalesce(
                  jsonb_object_agg(
                    p.key,
                    case
                      when coalesce(p.value ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        or position('@' in coalesce(p.value ->> 'display_name', '')) > 0
                      then (p.value - 'email') - 'display_name'
                      else p.value - 'email'
                    end
                  ),
                  '{}'::jsonb
                )
                from jsonb_each(g.summary -> 'participants') as p(key, value)
              ),
              false
            )
          else g.summary - 'created_by'
        end
      else g.summary
    end as new_summary,
    (
      select
        case
          when jsonb_typeof(gs2 -> 'state' -> 'turn_history') = 'array' then
            jsonb_set(
              gs2,
              '{state,turn_history}',
              (
                select coalesce(
                  jsonb_agg(
                    case
                      when jsonb_typeof(line) = 'string'
                        and position('@' in (line #>> '{}')) > 0
                      then to_jsonb(
                        regexp_replace(
                          line #>> '{}',
                          '[^[:space:]()<>"]+@[^[:space:]()<>"]+',
                          'Envoy',
                          'g'
                        )
                      )
                      else line
                    end
                  ),
                  '[]'::jsonb
                )
                from jsonb_array_elements(gs2 -> 'state' -> 'turn_history') as line
              ),
              false
            )
          else gs2
        end
      from (
        select
          case
            when jsonb_typeof(gs -> 'state' -> 'admin_log') = 'array' then
              jsonb_set(
                gs,
                '{state,admin_log}',
                (
                  select coalesce(
                    jsonb_agg(
                      case
                        when jsonb_typeof(elem) = 'object' then
                          (
                            case
                              when coalesce(elem ->> 'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                or coalesce(elem ->> 'actor', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                or position('@' in coalesce(elem ->> 'actor', '')) > 0
                              then elem - 'actor'
                              else elem
                            end
                          ) || (
                            case
                              when jsonb_typeof(elem -> 'acknowledged_by') = 'array' then
                                jsonb_build_object(
                                  'acknowledged_by',
                                  (
                                    select coalesce(jsonb_agg(tok), '[]'::jsonb)
                                    from jsonb_array_elements(elem -> 'acknowledged_by') as tok
                                    where jsonb_typeof(tok) = 'string'
                                      and position('@' in (tok #>> '{}')) = 0
                                  )
                                )
                              else '{}'::jsonb
                            end
                          )
                        else elem
                      end
                    ),
                    '[]'::jsonb
                  )
                  from jsonb_array_elements(gs -> 'state' -> 'admin_log') as elem
                ),
                false
              )
            else gs
          end as gs2
        from (
          select
            case
              when jsonb_typeof(g.game_state -> 'summary') = 'object' then
                jsonb_set(
                  g.game_state,
                  '{summary}',
                  case
                    when jsonb_typeof(g.game_state -> 'summary' -> 'participants') = 'object' then
                      jsonb_set(
                        (g.game_state -> 'summary') - 'created_by',
                        '{participants}',
                        (
                          select coalesce(
                            jsonb_object_agg(
                              p.key,
                              case
                                when coalesce(p.value ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                  or position('@' in coalesce(p.value ->> 'display_name', '')) > 0
                                then (p.value - 'email') - 'display_name'
                                else p.value - 'email'
                              end
                            ),
                            '{}'::jsonb
                          )
                          from jsonb_each(g.game_state -> 'summary' -> 'participants') as p(key, value)
                        ),
                        false
                      )
                    else (g.game_state -> 'summary') - 'created_by'
                  end,
                  false
                )
              else g.game_state
            end as gs
        ) sub
      ) sub2
    ) as new_game_state,
    case
      when jsonb_typeof(g.history) = 'array' then
        (
          select coalesce(
            jsonb_agg(
              (
                select
                  case
                    when jsonb_typeof(snap1) = 'object' and jsonb_typeof(snap1 -> 'turn_history') = 'array' then
                      jsonb_set(
                        snap1,
                        '{turn_history}',
                        (
                          select coalesce(
                            jsonb_agg(
                              case
                                when jsonb_typeof(line) = 'string'
                                  and position('@' in (line #>> '{}')) > 0
                                then to_jsonb(
                                  regexp_replace(
                                    line #>> '{}',
                                    '[^[:space:]()<>"]+@[^[:space:]()<>"]+',
                                    'Envoy',
                                    'g'
                                  )
                                )
                                else line
                              end
                            ),
                            '[]'::jsonb
                          )
                          from jsonb_array_elements(snap1 -> 'turn_history') as line
                        ),
                        false
                      )
                    else snap1
                  end
                from (
                  select
                    case
                      when jsonb_typeof(snap) = 'object' and jsonb_typeof(snap -> 'admin_log') = 'array' then
                        jsonb_set(
                          snap,
                          '{admin_log}',
                          (
                            select coalesce(
                              jsonb_agg(
                                case
                                  when jsonb_typeof(elem) = 'object' then
                                    (
                                      case
                                        when coalesce(elem ->> 'actor_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                          or coalesce(elem ->> 'actor', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                          or position('@' in coalesce(elem ->> 'actor', '')) > 0
                                        then elem - 'actor'
                                        else elem
                                      end
                                    ) || (
                                      case
                                        when jsonb_typeof(elem -> 'acknowledged_by') = 'array' then
                                          jsonb_build_object(
                                            'acknowledged_by',
                                            (
                                              select coalesce(jsonb_agg(tok), '[]'::jsonb)
                                              from jsonb_array_elements(elem -> 'acknowledged_by') as tok
                                              where jsonb_typeof(tok) = 'string'
                                                and position('@' in (tok #>> '{}')) = 0
                                            )
                                          )
                                        else '{}'::jsonb
                                      end
                                    )
                                  else elem
                                end
                              ),
                              '[]'::jsonb
                            )
                            from jsonb_array_elements(snap -> 'admin_log') as elem
                          ),
                          false
                        )
                      else snap
                    end as snap1
                ) snap_sub
              )
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(g.history) as snap
        )
      else g.history
    end as new_history
  from public.multiplayer_games g
)
update public.multiplayer_games g
set
  summary = c.new_summary,
  game_state = c.new_game_state,
  history = c.new_history
from cleaned c
where g.id = c.id
  and (
    g.summary is distinct from c.new_summary
    or g.game_state is distinct from c.new_game_state
    or g.history is distinct from c.new_history
  );
