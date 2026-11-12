-- Migration: 20261112000001_add_state_revision.sql
-- Adds optimistic concurrency state_revision column to public.multiplayer_games.

alter table public.multiplayer_games
  add column if not exists state_revision bigint not null default 1;

