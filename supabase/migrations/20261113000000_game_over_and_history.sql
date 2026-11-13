-- Migration: 20261113000000_game_over_and_history.sql
-- Adds top-level winner and completed_at columns and status/completion indexes
-- to public.multiplayer_games for completed campaign tracking and grace-period queries.

alter table public.multiplayer_games
  add column if not exists winner text,
  add column if not exists completed_at timestamp with time zone;

create index if not exists idx_multiplayer_games_status
  on public.multiplayer_games(status);

create index if not exists idx_multiplayer_games_completed_at
  on public.multiplayer_games(completed_at desc)
  where status = 'completed';
