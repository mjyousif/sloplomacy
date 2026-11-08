---
name: secrecy-review
description: Use when adding or changing any backend endpoint, WebSocket message, broadcast, save/export path, sandbox path or admin action in this project. Checks that a live multiplayer match never leaks other powers' orders and that every mutation is authorized for the caller's own seat.
---

# Secrecy and authorization review

Hidden orders (fog of war) and seat ownership have broken repeatedly (PRs #90, #91, #101): each time a *new* path returned or accepted raw state. Walk every item below for any code that reads or writes a `GameState`. The helpers live in `backend/main.py`: `sanitize_game_state_for_viewer`, `viewer_power_for`, `caller_holds_seat`, `require_own_seat`, `require_timer_player`, `persist_game`.

## Reads: does anything return or broadcast state?

- [ ] Every response or broadcast of a live match's `GameState` goes through `sanitize_game_state_for_viewer`. This includes votes, extends, ready, `power`, `simulate`, save-as and WebSocket pushes. Returning `game` directly is a bug.
- [ ] Derived fields are masked too: `last_resolution`, issues, diagnostics, history. Rebuild them from what the viewer may see, never filter after the fact.
- [ ] A `?power=` query only selects among the caller's own seats. It never grants a view of another power.
- [ ] The WebSocket learns the caller from the `auth` first message (`?handshake=1`). Never put a token in a URL (Cloud Run logs it).
- [ ] Per-viewer broadcast: each socket gets its own masked copy, not one shared payload.

## Writes: who is allowed to change this?

- [ ] The order's power comes from the seat or slot being edited, never trusted from the request body. Every unit in a batch must belong to the batch's power.
- [ ] `require_own_seat` (or the equivalent timer or admin check) runs before any mutation. Empty seats can only be ordered by the host.
- [ ] Admin checks fail **closed**. If the game's summary is not loaded, load it first.
- [ ] `GameState.active_power` is shared by all players. Never use it to identify a caller.
- [ ] Sandbox write endpoints answer `409` on a live multiplayer match, and foreign hypothetical moves are never written into real state.

## Persistence

- [ ] `persist_game` is called after every change.
- [ ] Memory wins over the database for a loaded game, and a `SupabaseUnavailable` read is not "game missing".
- [ ] Anything that changes turn outside `_execute_adjudication` calls `start_phase_clock`.

## Tests

Add to `backend/test_security.py` (or the nearest suite) a test with **two** players, where player B tries to read or change player A's orders through your new path. Assert on 403 or on the masked content. Passing for a single player proves nothing. Look at how `backend/ws_testing.py` and `backend/conftest.py` set up seats and sockets before writing your own.

Update `docs/backend/api-reference.md`, noting the auth requirement and masking behavior of the endpoint.
