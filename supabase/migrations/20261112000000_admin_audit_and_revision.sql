-- Migration: 20261112000000_admin_audit_and_revision.sql
-- Documents JSONB schema extensions for admin action audit logs and consolidated Admin turn history.

-- 1. multiplayer_games.game_state->'state' now persists 'admin_log':
--    [
--      {
--        "id": "uuid",
--        "timestamp": "iso8601",
--        "actor": "user_id or email or Creator",
--        "season": "Spring",
--        "year": 1901,
--        "phase": "Movement",
--        "summary_lines": ["..."],
--        "acknowledged_by": ["user_id_1", "FRANCE"]
--      }
--    ]

-- 2. multiplayer_games.history now records consolidated admin interventions as phase = "Admin":
--    Historical snapshots with phase = "Admin" preserve the pre-admin baseline board (units, orders,
--    ownership) and store the post-admin outcomes and summary lines in last_resolution.

-- 3. public.lobby_games view remains unaffected as live GameState.phase remains standard
--    ("Movement", "Retreats", "Adjustments").

-- Auxiliary index on updated_at if not present for chronological sorting
create index if not exists idx_multiplayer_games_updated_at on public.multiplayer_games(updated_at desc);

