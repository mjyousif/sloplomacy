-- Normalize participant display names out of multiplayer_games.game_state -> summary -> participants
-- for registered (UUID) users, leaving public.profiles as the single source of truth.
-- Guest/non-UUID seats keep their inline display_name.

update public.multiplayer_games g
set game_state = jsonb_set(
  g.game_state,
  '{summary,participants}',
  (
    select coalesce(
      jsonb_object_agg(
        p.key,
        case
          when coalesce(p.value ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then p.value - 'display_name'
          else p.value
        end
      ),
      '{}'::jsonb
    )
    from jsonb_each(g.game_state -> 'summary' -> 'participants') as p(key, value)
  ),
  false
)
where jsonb_typeof(g.game_state -> 'summary' -> 'participants') = 'object'
  and exists (
    select 1
    from jsonb_each(g.game_state -> 'summary' -> 'participants') as p(key, value)
    where coalesce(p.value ->> 'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and p.value ? 'display_name'
  );
