-- Migration: 20261113000002_game_press.sql
-- Press (in-game chat): the messages of a match, as a JSON array, oldest first.
-- It has its own column so a press save and a game-state save never overwrite each other.
-- RLS on public.multiplayer_games stays closed: only the backend's service role reads this.

alter table public.multiplayer_games
  add column if not exists press jsonb not null default '[]'::jsonb;
