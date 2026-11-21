---
name: secrecy-review
description: Use when adding or changing any backend endpoint, WebSocket message, broadcast, save/export path, sandbox path or admin action in this project. Checks that a live multiplayer match never leaks other powers' orders and that every mutation is authorized for the caller's own seat.
---

# Secrecy and authorization review

Hidden orders (fog of war) and seat ownership have broken repeatedly (PRs #90, #91, #101): each time a *new* path returned or accepted raw state. Walk every item below for any code that reads or writes a `GameState`. The helpers live in `backend/main.py`: `sanitize_game_state_for_viewer`, `viewer_power_for`, `caller_holds_seat`, `require_own_seat`, `require_timer_player`, `persist_game`.

## Reads: does anything return or broadcast state?

- [ ] Every response or broadcast of a live match's `GameState` goes through `sanitize_game_state_for_viewer`. A `waiting` match (a lobby, or one that dropped to one player) is still live: never skip masking by status. This includes votes, extends, ready, `power`, `simulate`, save-as and WebSocket pushes. Returning `game` directly is a bug.
- [ ] Derived fields are masked too: `preview`, issues, diagnostics, history. Rebuild them from what the viewer may see, never filter after the fact.
- [ ] Counters leak too. A sequence number shared by messages that different viewers may read shows, by its gaps, how many they cannot see. Number per viewer (press `seq` comes from `PressMessage.numbers`, and a spectator's from `PressMessage.public_number`).
- [ ] A `?power=` query only selects among the caller's own seats. It never grants a view of another power. A spectator client sends none: without a token, a named `power` picks a seat claimed without an account.
- [ ] A spectator (no seat) gets a fully masked board and, of press, only public messages (`security.press.spectator_feed` / `spectator_view`, never `view_of`). Test a new read path with a signed-out caller as well as the rival player.
- [ ] A private match's passcode is checked only through `security.passcode` (`require_passcode`, `check_passcode`), which counts wrong guesses. A new route that takes a passcode uses it with `client_address(request)`, and checks it before anything with side effects (such as `tick_timer`).
- [ ] The WebSocket learns the caller from the `auth` first message (`?handshake=1`). Never put a token in a URL (Cloud Run logs it).
- [ ] Per-viewer broadcast: each socket gets its own masked copy, not one shared payload.
- [ ] A lobby listing (`GET /api/games`, `/api/games/browse`, `/ws/lobby`) goes through `storage.lobby.public_summaries`, so it never names a private campaign or a sandbox. The lobby socket shares one payload, so anything per-player belongs in `GET /api/games/mine` instead. Browse rows carry no emails or user ids.
- [ ] Every summary a client receives goes through `sanitize_summary_for_viewer`, which strips emails and the `board` preview. Only `GET /api/games/mine` passes `keep_board=True`. Never return `GAME_SUMMARIES[...]` directly.

- [ ] Press (chat) is per seat: every read and socket push goes through `security.press` (`can_read`, `view_of`), which hides private messages from other powers and an anonymous `sender` from everyone but the author. Never return or log a stored `PressMessage`, and never put press in `GameState`, where it would ride along with every board broadcast. A message's suggested `orders` are only what its sender attached: never fill them from `game.orders`, and never write them into a game.

## Writes: who is allowed to change this?

- [ ] The order's power comes from the seat or slot being edited, never trusted from the request body. Every unit in a batch must belong to the batch's power.
- [ ] `require_own_seat` (or the equivalent timer or admin check) runs before any mutation. Empty seats can only be ordered by the host.
- [ ] Admin checks fail **closed**. If the game's summary is not loaded, load it first. A game in memory with no summary (`lacks_summary`) is refused by every check, never treated as open; only the default board and a private `sbx_` copy have none.
- [ ] Identity comes only from the verified token (`get_current_user`). Never read `X-User-Id` / `X-User-Email` or a `user_id` / `email` / `power` in a body to decide who is calling or acknowledging.
- [ ] `GameState.active_power` is shared by all players. Never use it to identify a caller.
- [ ] Sandbox write endpoints answer `409` on a live multiplayer match, and foreign hypothetical moves are never written into real state.
- [ ] A saved sandbox is its owner's alone. New HTTP routes get this from `saved_sandbox_guard` (a router dependency in `main.py`) as long as they take the game as `game_id` in the path or query; a new socket or a differently named parameter needs its own check (`caller_owns_saved_sandbox`).

## Persistence

- [ ] `persist_game` is called after every change.
- [ ] Memory wins over the database for a loaded game, and a `SupabaseUnavailable` read is not "game missing". An unreadable stored summary is withheld (`build_summary_from_row` returns `None`), never rebuilt from the plain columns, which would make a private game public.
- [ ] Anything that evicts a game checks `has_unsaved_work`, and a sync that read Supabase only evicts games it knew of before the read began.
- [ ] Resolving a turn goes through `execute_adjudication`, which holds the game's lock and takes the turn it expects to resolve.
- [ ] Anything that changes turn outside `execute_adjudication` calls `start_phase_clock`.
- [ ] Never denormalize user display names or emails (`created_by`, UUID participant `display_name`) into persisted game blobs. Serialize **both** top-level `payload["summary"]` and `payload["game_state"]["summary"]` through `_serialize_summary_for_db`, and resolve display names from `PROFILE_NAMES[user_id]` (refreshed with a TTL cache, not on every lobby request).

## Tests

Add to `backend/tests/integration/security/` (`test_fog_of_war.py` for what a viewer can see, `test_seat_authorization.py` for what they can change, or the nearest suite) a test with **two** players, where player B tries to read or change player A's orders through your new path. Assert on 403 or on the masked content. Passing for a single player proves nothing. Look at how `backend/tests/ws_testing.py` and `backend/tests/conftest.py` set up seats and sockets before writing your own.

Update `docs/backend/api-reference.md`, noting the auth requirement and masking behavior of the endpoint.
