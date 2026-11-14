-- Strip denormalized created_by from multiplayer_games summary JSON for registered (UUID) creators,
-- leaving public.profiles (keyed by creator_id / host_user_id UUID) as the single source of truth.

update public.multiplayer_games
set
  game_state = case
    when jsonb_typeof(game_state -> 'summary') = 'object'
      and coalesce(game_state -> 'summary' ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (game_state -> 'summary') ? 'created_by'
    then jsonb_set(
      game_state,
      '{summary}',
      (game_state -> 'summary') - 'created_by',
      false
    )
    else game_state
  end,
  summary = case
    when jsonb_typeof(summary) = 'object'
      and coalesce(summary ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and summary ? 'created_by'
    then summary - 'created_by'
    else summary
  end
where (
  jsonb_typeof(game_state -> 'summary') = 'object'
  and coalesce(game_state -> 'summary' ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (game_state -> 'summary') ? 'created_by'
)
or (
  jsonb_typeof(summary) = 'object'
  and coalesce(summary ->> 'creator_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and summary ? 'created_by'
);
