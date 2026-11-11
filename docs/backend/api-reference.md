# Backend REST API Reference

The backend exposes a JSON REST API under the `/api` prefix on port `8000`. All requests and responses use standard `application/json` formatting. CORS is configured with an explicit origin whitelist via `ALLOWED_ORIGINS` (defaulting to `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:8000`, `http://127.0.0.1:8000`) with credentials enabled.

### Multi-Game Room Scoping (`?game_id=...`)
All operational endpoints accept an optional query parameter `?game_id=<id>`. When omitted, endpoints operate on the default match room (`proto_1901`). Sandbox sessions and concurrent multiplayer lobbies pass their scoped `game_id` with every request.

---

## Endpoint Summary

### Lobby & Match Management
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/games` | List public matches (never private campaigns, sandboxes or drafts) | *None* | `List[MultiplayerGameSummary]` |
| `GET` | `/api/games/browse` | Page through public matches with seat, country and turn filters; no emails or user ids | Query: `seats`, `countries`, `turn_op`, `season`, `year`, `page`, `page_size` | `LobbyBrowsePage` |
| `GET` | `/api/games/mine` | The signed-in caller's own games, private campaigns and saved sandboxes included (`401` without a token) | *None* | `List[MultiplayerGameSummary]` |
| `GET` | `/api/games/{game_id}` | Fetch summary metadata, participants, and status for a game room | *None* | `MultiplayerGameSummary` |
| `POST` | `/api/games` | Create a new multiplayer room (public or private with passcode) | `CreateGameRequest` | `MultiplayerGameSummary` |
| `DELETE` | `/api/games/{game_id}` | Delete a match lobby and remove its state from Supabase | *None* | `Dict[str, str]` |
| `POST` | `/api/games/{game_id}/join` | Claim a sovereign Great Power seat (validating passcode if private) | `JoinGameRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/{game_id}/leave` | Vacate claimed power in lobby or match, or delete sandbox | `LeaveGameRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/{game_id}/surrender` | Concede sovereign command into Civil Disorder | `SurrenderRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/solo-sandbox` | Mint a personal, isolated draft sandbox session (`solo_<uuid>`) | *None* | `MultiplayerGameSummary` |

### Match & Tactical Operations
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/game` | Fetch current game state (scoped to caller's seat) and province topology | *None* | `GameBootstrapResponse` |
| `POST` | `/api/power` | Switch active viewing power (returns what the caller's own seat may see) | `SetPowerRequest` | `GameState` |
| `POST` | `/api/order` | Submit or update an order for a single military unit or build slot | `SingleOrderUpdateRequest` | `GameState` |
| `POST` | `/api/orders/batch` | Update multiple orders simultaneously (atomic: invalid order rejects with `400`) | `OrderSubmissionRequest` | `GameState` |
| `POST` | `/api/orders/confirm-all` | Mark all default orders of a given power as explicitly confirmed | `SetPowerRequest` | `GameState` |
| `POST` | `/api/finalize` | Pre-flight sanity check and finalize power's orders; auto-adjudicates when all are ready | `FinalizeRequest` | `FinalizeResponse` |
| `POST` | `/api/unfinalize` | Unlock finalized orders for subsequent editing | `SetPowerRequest` | `GameState` |
| `POST` | `/api/simulate` | Execute non-destructive tactical preview resolution using official DATC rules | *None* | `SimulationResult` |
| `POST` | `/api/adjudicate` | Commit orders, resolve combat, advance season/phase (`?turn=` guards against a double resolve) | *None* | `GameState` |
| `POST` | `/api/scenario` | Reset board and load predefined tactical scenario (host only on live match) | `ScenarioRequest` | `GameState` |

### Turn History
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/history` | List the game's resolved phases, oldest first (up to the last 30) | *None* | `List[TurnHistoryEntry]` |
| `GET` | `/api/history/{index}` | One resolved phase as it began, with every power's orders and how each resolved | *None* | `TurnRecord` |

### Sandbox & AI Planning
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/sandbox/enter` | Activate Sandbox Mode: private copy for multiplayer, or solo checkpoint | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/exit` | Leave Sandbox Mode and return real match (carrying player's modified orders) | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/clear-foreign` | Reset all foreign hypothetical orders to default HOLD (`409` on live match) | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/ai-orders` | Generate DATC-compliant heuristic tactical AI orders for specified powers | `GenerateAIOrdersRequest` | `GameState` |
| `POST` | `/api/sandbox/ai-step` | Auto-plan unassigned foreign powers with tactical AI and advance turn | *None* | `GameState` |
| `POST` | `/api/games/save-sandbox` | Promote draft sandbox in-place or save clone of solo match session | `SaveSandboxRequest` | `MultiplayerGameSummary` |

### Phase Clock & Timers
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/games/{game_id}/timer/start` | Start match clock, opening Movement duration vote (host only) | *None* | `GameState` |
| `POST` | `/api/games/{game_id}/timer/vote` | Vote on length of Movement phase (15, 20, 30m, or pause) | `TimerVoteRequest` | `GameState` |
| `POST` | `/api/games/{game_id}/timer/extend` | Request +5 minutes extension, or withdraw request | `TimerToggleRequest` | `GameState` |
| `POST` | `/api/games/{game_id}/timer/ready` | Ready up in a paused game to open new duration vote | `TimerToggleRequest` | `GameState` |

### Administrator & Game Creator Controls
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/status` | Query creator permissions and rollback snapshot depth | *None* | `AdminStatusResponse` |
| `POST` | `/api/admin/rollback` | Revert game state to pre-adjudication timeline snapshot | `AdminRollbackRequest` | `GameState` |
| `POST` | `/api/admin/set-turn` | Arbitrarily jump season, year, or phase | `AdminSetTurnRequest` | `GameState` |
| `POST` | `/api/admin/unit/move` | Teleport any unit to any valid destination province | `AdminMoveUnitRequest` | `GameState` |
| `POST` | `/api/admin/unit/spawn` | Spawn a new army or fleet for any Great Power | `AdminSpawnUnitRequest` | `GameState` |
| `POST` | `/api/admin/unit/destroy` | Disband and remove any unit from the board | `AdminDestroyUnitRequest` | `GameState` |
| `POST` | `/api/admin/ownership` | Reassign province / supply center ownership | `AdminSetOwnershipRequest` | `GameState` |
| `POST` | `/api/admin/unfinalize-all` | Unlock and unfinalize orders for all 7 powers | *None* | `GameState` |

### Developer & Testing Utilities
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/test/seed` | Seed game state for LLM-driven E2E tests and local dev verification (`403` in prod) | `SeedScenarioRequest` | `GameState` |

### Real-Time WebSocket Synchronization
| Protocol | Endpoint | Description | Client Messages | Server Broadcasts |
| :--- | :--- | :--- | :--- | :--- |
| `WS` | `/ws/games/{game_id}` | Live room state sync (orders, finalization, adjudication, participants) | `{"type": "ping"}` / `{"type": "refresh"}` | `WebSocketGameUpdate` |
| `WS` | `/ws/lobby` | Live multiplayer game browser sync | `{"type": "ping"}` / `{"type": "refresh"}` | `WebSocketLobbyUpdate` |

---

## Detailed Specifications: Lobby & Multiplayer Management

### 1. `GET /api/games`
Returns the public multiplayer matches. A private campaign, a sandbox (saved or draft) and `proto_1901` are never listed: players find their own private games and saved sandboxes with `GET /api/games/mine`, and others join a private campaign by its id and passcode. If Supabase cannot be read, the list comes from memory and the call still succeeds.

#### Response (`List[MultiplayerGameSummary]`):
```json
[
  {
    "game_id": "game_1901_alpha",
    "name": "Balkans Bloodbath 1901",
    "scenario_id": "standard_1901",
    "created_by": "diplomat@slop.eu",
    "creator_id": "usr_9988",
    "is_sandbox": false,
    "status": "lobby",
    "phase": "Movement",
    "season": "Spring",
    "year": 1901,
    "claimed_powers": {
      "AUSTRIA": "usr_9988",
      "RUSSIA": "usr_7711"
    },
    "participants": [
      { "user_id": "usr_9988", "email": "diplomat@slop.eu", "power": "AUSTRIA", "role": "host" },
      { "user_id": "usr_7711", "email": "tsar@slop.eu", "power": "RUSSIA", "role": "player" }
    ],
    "created_at": "2026-11-03T14:00:00Z"
  }
]
```

---

### 1a. `GET /api/games/browse`
Pages through the public matches for the lobby browser. Needs no sign-in, and lists the same games as `GET /api/games`. Each row names the host by display name only: it carries no emails, user ids or participant records.

#### Query parameters
| Name | Default | Meaning |
| :--- | :--- | :--- |
| `seats` | `open` | `open`: at least one unclaimed power and not completed. `full`: every power claimed. `all`: both, and completed games. |
| `countries` | *none* | Comma-separated powers (`FRANCE,ITALY`, any case). Keeps games where **every** listed power is unclaimed. An unknown name answers `422`. |
| `turn_op` | *none* | `at`, `before` or `after`. Needs `year`. |
| `season` | *none* | `Spring`, `Fall` or `Winter`, ordered in that sequence within a year. Without it the turn filter compares years only. |
| `year` | *none* | `1901` or later. |
| `page`, `page_size` | `1`, `10` | Pages start at 1. `page_size` is at most 50. A page past the end is empty. |

Games with an open seat come first, then the most recently played (`last_moved_at`, then `created_at`).

#### Response (`LobbyBrowsePage`):
```json
{
  "games": [
    {
      "game_id": "mp_bbc66b",
      "name": "Friday Night 1901",
      "status": "active",
      "season": "Fall",
      "year": 1903,
      "phase": "Movement",
      "host_name": "Gage",
      "created_at": "2026-11-03T14:00:00+00:00",
      "last_moved_at": "2026-11-10T21:12:40+00:00",
      "claimed_powers": ["FRANCE", "RUSSIA", "TURKEY"],
      "open_powers": ["AUSTRIA", "ENGLAND", "GERMANY", "ITALY"]
    }
  ],
  "total": 14,
  "page": 1,
  "page_size": 10
}
```

---

### 1b. `GET /api/games/mine`
Returns every game the caller holds a seat in or owns, as `List[MultiplayerGameSummary]`, including private campaigns and saved sandboxes. Draft sandboxes are left out. The caller comes from the `Authorization: Bearer <token>` header; without one it answers `401`. It lists only the caller's own games, so it shows no one else's private campaign.

---

### 2. `GET /api/games/{game_id}`
Returns details and participant metadata for a specific multiplayer match lobby. Answers `404` if the game was deleted from Supabase, and `503` if it is not in memory and Supabase cannot be read.

#### Response (`MultiplayerGameSummary`):
```json
{
  "game_id": "mp_9f2a4b",
  "name": "Secret Congress 1901",
  "status": "waiting",
  "season": "Spring",
  "year": 1901,
  "phase": "Movement",
  "created_by": "host@slop.eu",
  "creator_id": "usr_1020",
  "created_at": "2026-11-03T20:00:00Z",
  "participants": {},
  "finalized_powers": [],
  "surrendered_powers": [],
  "is_sandbox": false,
  "is_private": true,
  "has_passcode": true
}
```

---

### 3. `POST /api/games`
Creates a new multiplayer game room (public or private) and automatically assigns the creator's power seat.

#### Request (`CreateGameRequest`):
```json
{
  "name": "Western Front 1901",
  "creator_power": "FRANCE",
  "user_id": "usr_1020",
  "email": "marshal@slop.eu",
  "display_name": "Napoleon",
  "is_private": true,
  "passcode": "Secret1901"
}
```

---

### 4. `DELETE /api/games/{game_id}`
Deletes a game from memory and Supabase. Only the host can delete a multiplayer match. Answers `403` for anyone else, and for the shared default game `proto_1901`, which can never be deleted. Answers `503` if the game is not in memory and Supabase cannot be read, because the host cannot be checked.

---

### 5. `POST /api/games/{game_id}/join`
Claims an open Great Power seat for a user. In the response, `state.active_power` is the power the caller just claimed; the shared game is not changed, so other players are unaffected. If the campaign is private (`has_passcode: true`), the correct `passcode` must be provided unless the user is already a confirmed participant.

#### Request (`JoinGameRequest`):
```json
{
  "power": "FRANCE",
  "user_id": "usr_1020",
  "email": "marshal@slop.eu",
  "display_name": "Napoleon",
  "passcode": "Secret1901"
}
```

---

### 6. `POST /api/games/{game_id}/leave`
Vacates a claimed power seat in a lobby or active match, or deletes a saved sandbox if called by its owner.

#### Request (`LeaveGameRequest`):
```json
{
  "user_id": "usr_1020",
  "email": "marshal@slop.eu",
  "power": "FRANCE"
}
```

---

### 7. `POST /api/games/{game_id}/surrender`
Concedes command of a Great Power into **Civil Disorder**. Surrendered units hold passively, never provide support, and auto-disband if forced to retreat or down in supply centers. If `vacate_seat: true`, the user's claim on the seat is relinquished.

#### Request (`SurrenderRequest`):
```json
{
  "user_id": "usr_1020",
  "email": "marshal@slop.eu",
  "power": "FRANCE",
  "vacate_seat": false
}
```

---

### 8. `POST /api/games/solo-sandbox`
Mints an isolated, ephemeral draft sandbox session with a unique UUID (`solo_<uuid>`), or resumes an existing draft sandbox when `?resume_game_id=<id>` is passed (or when an authenticated user already owns an unpromoted draft).

- **Draft Isolation & Resumption**: Sets `is_sandbox=True` and `is_draft=True`. Draft sandboxes are completely isolated per visitor/player. Leaving a Solo Sandbox and returning resumes the same draft (via `resume_game_id` stored in `localStorage` or account lookup) until the user resets the board or promotes it via Save Sandbox.
- **Lobby & WebSocket Exclusion**: Sandboxes, drafts or saved, are filtered out of public `/api/games` listings, `/api/games/browse` and `/ws/lobby` broadcasts, ensuring that no sandbox is discoverable or shared by other players. A saved one appears to its owner in `GET /api/games/mine`.
- **Capacity & Eviction**: When total active games approach `MAX_CONCURRENT_GAMES`, unpromoted draft sandboxes are prioritized for memory eviction before rejecting new rooms.
- **Promotion Flow**: Once the user chooses to keep the sandbox, `POST /api/games/save-sandbox` promotes the draft session in-place (`is_draft=False`) without creating duplicate games.

#### Response (`MultiplayerGameSummary`):
```json
{
  "game_id": "solo_f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Solo Sandbox f47ac10b",
  "status": "active",
  "season": "Spring",
  "year": 1901,
  "phase": "Movement",
  "created_by": "guest",
  "creator_id": null,
  "created_at": "2026-11-09T22:00:00Z",
  "participants": {},
  "finalized_powers": [],
  "surrendered_powers": [],
  "is_sandbox": true,
  "is_draft": true,
  "is_private": false,
  "has_passcode": false
}
```

---

### 9. `POST /api/games/save-sandbox`
Saves an active solo sandbox into the persistent game summary registry.

- **In-Place Draft Promotion**: If `game_id` refers to an existing draft sandbox (`is_draft=True`, such as `solo_<uuid>`), the endpoint promotes it in-place rather than cloning: sets `is_draft=False`, updates the name to the caller's chosen custom name (from `SaveSandboxRequest.name`), and sets `creator_id` and participant metadata to the authenticated user.
- **Cloning Live Matches or Scenarios**: If saving from a multiplayer match or static prototype (`proto_1901`), a new copy is created under a `saved_` prefix. A saved copy is never masked, so a live match is copied only as the caller may see it: their own orders, everyone else holding, and no turn clock.
- **Access Control**: A saved sandbox belongs to the account that saved it (`creator_id`). Every HTTP route that names it, by path or `?game_id=`, answers `401` without a token and `403` for anyone else, and its game socket closes with `4403`. That covers viewing, orders, resolving, the sandbox and admin tools, joining, copying and deleting. A sandbox saved by a guest (no account id) stays open, as a guest's seat does.

#### Request (`SaveSandboxRequest`):
```json
{
  "game_id": "solo_f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Burgundy Opening Analysis",
  "user_id": "usr_1020",
  "email": "marshal@slop.eu"
}
```

### Phase Clock: `POST /api/games/{game_id}/timer/...`

The rules are in [the rulebook reference](../guides/rulebook-reference.md#9-turn-clock). The state is `GameState.timer`, which stays `null` until the host starts the clock, so matches without one are untimed.

- **`start`**: Creator only, like `/api/adjudicate`. `409` if the clock is already running, or the match is not active.
- **`vote`**: Body `{ "power": "FRANCE", "choice": "15" }`, where `choice` is `"15"`, `"20"`, `"30"` or `"pause"`. A player can change their vote until it closes. The vote closes once every player has voted.
- **`extend`**: Body `{ "power": "FRANCE", "active": true }`. Set `active` to `false` to take the request back. The time is added once enough players have asked, and the requests then reset.
- **`ready`**: Same body as `extend`. Once every player is ready a new vote opens.

Each answers `403` for a power that is not playing, and `409` if the clock is in a different stage.

Nothing runs in the background. The game WebSocket and `GET /api/game` check the deadline (with clients sending a WebSocket `refresh` on countdown expiry, or the fallback HTTP poll when there is no socket), so a deadline is acted on within seconds while anyone is connected. A game nobody is connected to does not advance until someone returns.

---

## Detailed Specifications: Match & Tactical Operations

### 7. `GET /api/game`
Bootstraps the client by returning the current `GameState` along with the complete static dictionary of all 76 `PROVINCES` (including coastline and adjacency rules).

- **Query Parameters**:
  - `game_id` *(optional, string)*: Scoped match identifier (defaults to `proto_1901`).
  - `power` *(optional, Power)*: Picks which of the caller's own seats to view. It is checked against the caller's seat and never shows another power's orders: naming a seat you do not hold gives the same view as not naming one. In multiplayer matches, whether `waiting` or `active`, foreign unadjudicated moves are masked to default `HOLD`s, foreign diagnostic issues are excluded, and `last_resolution` (the turn preview) is rebuilt from the viewer's own orders with everyone else holding (Fog of War).
  - `passcode` *(optional, string)*: Passcode for private campaigns (compared using timing-safe `hmac.compare_digest`).
- **Headers**:
  - `X-Passcode` *(optional, string)*: Header alternative for campaign passcode.
  - `Authorization: Bearer <token>` *(optional)*: Identifies the caller, whose seat decides which orders they see. Signed out, a caller sees only seats claimed without an account.

#### Response (`GameBootstrapResponse`):
```json
{
  "state": {
    "game_id": "proto_1901",
    "season": "Spring",
    "year": 1901,
    "phase": "Movement",
    "scenario_id": "standard_1901",
    "active_power": "FRANCE",
    "units": [...],
    "orders": {...},
    "ownership": {...},
    "finalized_powers": [],
    "surrendered_powers": [],
    "issues": [...],
    "last_resolution": {...},
    "turn_history": ["Game initialized — Spring 1901 Diplomatic & Movement Phase."],
    "builds": null,
    "retreats": null
  },
  "provinces": {
    "PAR": {
      "id": "PAR",
      "name": "Paris",
      "type": "LAND",
      "is_supply_center": true,
      "home_power": "FRANCE",
      "coasts": [],
      "army_adj": ["BRE", "PIC", "BUR", "GAS"],
      "fleet_adj": []
    }
  }
}
```

---

### `POST /api/sandbox/enter`
Starts a what-if session for `power`.

- **Multiplayer match**: only the player in `power`'s seat may open one (otherwise `403`), because the copy keeps that power's real orders. The match is not touched. The response is a private copy with its own `sbx_` `game_id`, in which every other power is on default orders. Use that id for all later calls in the session. Entering again replaces the same player's previous copy. The copy is held only in memory, so it is lost if the server restarts, and calls using its id then answer `404`.
- **Solo or saved sandbox**: the response keeps the game's own `game_id`, and a checkpoint of the real state and of its turn history is stored.

### `POST /api/sandbox/exit`
Ends the session. On a private copy, pass its `sbx_` id: the copy is discarded and the real match is returned, masked for that seat. The player's own orders carry over only if the caller is the player in that seat, the match is still on the same turn and they still hold it. Anyone else's exit only discards the copy, and changing them drops that player's finalization, as any other edit does. Calling this on a live match itself answers `409`. On a solo or saved sandbox the checkpoint is restored, including the turn history, so phases stepped through hypothetically never show up in `/api/history` or become a rollback target.

### 8. `POST /api/sandbox/ai-orders`
Generates DATC-compliant, intelligent tactical orders for specified Great Powers (or foreign powers by default) using the Chancellery Tactical AI engine. Answers `409` on a live multiplayer match, where it must be called on a private sandbox id. Avoids friendly self-bounces, coordinates multi-power attacks and supports, and prioritizes strategic supply centers.

#### Request (`GenerateAIOrdersRequest`):
```json
{
  "powers": ["ENGLAND", "GERMANY", "RUSSIA", "AUSTRIA", "ITALY", "TURKEY"],
  "include_active": false
}
```

#### Response (`GameState`):
Returns the updated `GameState` with the AI-assigned orders populated and real-time validation/diagnostics refreshed.

---

### 9. `POST /api/sandbox/ai-step`
Automatically plans tactical moves for any unassigned foreign powers with the Tactical AI engine and immediately adjudicates and steps the turn forward to the next phase/season. Answers `409` on a live multiplayer match.

#### Response (`GameState`):
Returns the next phase `GameState` with combat resolutions and updated unit positions.

---

### 10. `POST /api/order`
Any `target_coast` on an army's order is ignored, because only fleets use coasts.

Send the optional `turn` (for example `"Spring 1901 Movement"`) to have the order refused with `409` if that turn has already resolved.

Submits or modifies a single military instruction. Automatically triggers validation and non-destructive simulation preview.

#### Request (`SingleOrderUpdateRequest`):
```json
{
  "order": {
    "unit_id": "FRA_A_PAR",
    "power": "FRANCE",
    "unit_type": "A",
    "origin": "PAR",
    "origin_coast": null,
    "order_type": "MOVE",
    "target": "BUR",
    "target_coast": null,
    "aux_unit_origin": null,
    "via_convoy": false,
    "is_explicit": true
  },
  "active_power": "FRANCE"
}
```

Returns `400` if the order names a province or coast that does not exist. A real but illegal move is accepted: the validator flags it, and the engine refuses it at adjudication.

In multiplayer matches, callers must supply a valid `Authorization: Bearer <token>` matching the participant who claimed the Great Power (or game creator). Attempts by opponents or unauthenticated callers to issue orders for claimed powers return `403 Forbidden` or `401 Unauthorized`. An empty seat is in Civil Disorder, so only the host may order it. A build slot (`BUILD_<POWER>_<PROVINCE>`) belongs to the power it names, whatever the order's `power` says, and in `/api/orders/batch` every unit must belong to the batch's `power` (otherwise `403`). Returned `GameState` is sanitized for the commanding power to preserve Fog of War.

---

### 9. `POST /api/finalize`
Attempts to lock in orders for the active power. If errors or unassigned warnings exist, finalization is halted (`requires_confirmation: true`) unless `force: true`.

In active multiplayer campaigns (`status == "active"`), if all required active powers (commanded by participants and having pending phase actions) have finalized, the engine automatically executes turn adjudication, advances season and phase, resets `finalized_powers`, and returns the newly resolved `GameState`.

The optional `turn` (for example `"Spring 1901 Movement"`) refuses the request with `409` if that turn has already resolved, so a click just after a deadline cannot lock the player's default orders into the next phase.

#### Request (`FinalizeRequest`):
```json
{
  "power": "FRANCE",
  "force": false,
  "turn": "Spring 1901 Movement"
}
```

#### Response (`FinalizeResponse`):
```json
{
  "finalized": false,
  "requires_confirmation": true,
  "issues": [
    {
      "id": "self_bounce_BUR",
      "severity": "warning",
      "code": "SELF_BOUNCE",
      "title": "Self-Bounce in Burgundy (BUR)",
      "message": "Both FRA_A_PAR and FRA_A_MAR attack BUR with equal strength (1 vs 1).",
      "unit_ids": ["FRA_A_PAR", "FRA_A_MAR"],
      "provinces": ["BUR", "PAR", "MAR"],
      "power": "FRANCE"
    }
  ],
  "state": { ... }
}
```

---

### 10. `POST /api/adjudicate`
Permanently commits all submitted moves, resolves conflicts using the DATC `diplomacy` engine, advances phase (Movement -> Retreats -> Movement -> Adjustments), updates supply center ownership in Fall, and records turn history.

In a live match, a retreat or adjustment phase that no player is involved in then plays out at once, so the response may be one or two phases further on. Movement phases always wait for the players. The same happens when `/api/finalize`, `/leave` or `/surrender` completes the set of players being waited for, so a match never stalls on a player who has gone.

- **Multiplayer Security**: In multiplayer campaigns (`!is_sandbox`), manual adjudication requires authentic game creator authorization via a cryptographically signed Supabase JSON Web Token (`Authorization: Bearer <token>`). Missing, invalid, or expired tokens receive `401 Unauthorized`. Authenticated users who are not the game creator receive `403 Forbidden`. In normal multiplayer play, turns advance automatically upon consensus finalization; this endpoint acts as an administrative host override. Solo sandbox mode (`proto_1901`) keeps anonymous access, and a saved sandbox is open to its owner only (see `POST /api/games/save-sandbox`).
- **Query Parameters**:
  - `game_id` *(optional, string)*: Scoped match identifier (defaults to `proto_1901`).
  - `turn` *(optional, string)*: The turn the caller means to resolve, e.g. `Spring 1901 Movement`. If the game has already moved past it the call answers `409` and changes nothing, so a double-click or a second tab never resolves two phases. The app always sends it.
- A unit whose order the engine rejects holds in place. When a power reaches 18 supply centers the response carries `winner`, the clock stays on the deciding phase, and further calls return `409`.

---

### `GET /api/history`
Lists the phases of a game that have resolved, oldest first, for the turn selector. They come from the snapshots `/api/adjudicate` takes just before each phase resolves (the same ones admin rollback uses), so at most the last 30 phases are kept and a rollback removes the phase it restores.

- **Query Parameters**: `game_id` *(optional)*, `passcode` *(optional)*. Header `X-Passcode` and `Authorization: Bearer <token>` work as for `GET /api/game`.
- **Access**: the same as `GET /api/game`. A private match needs its passcode unless the caller is seated in it (`403`). A private sandbox id (`sbx_…`) answers `404` for everyone, because its snapshots hold its owner's live orders for the match's current turn.
- **Secrecy**: every phase listed has resolved, so its orders are public. The current phase is never in the list.

#### Response (`List[TurnHistoryEntry]`):
```json
[
  { "index": 0, "season": "Spring", "year": 1901, "phase": "Movement" },
  { "index": 1, "season": "Fall", "year": 1901, "phase": "Movement" }
]
```

### `GET /api/history/{index}`
Returns one resolved phase from `GET /api/history`, as the board stood when it began, with **every** power's orders and how each resolved. `resolution` comes from running the snapshot through the adjudicator again. Adjudication is deterministic, so it is exactly what happened. Same parameters and access rules as the list, and `404` for an index out of range. Only what the map needs is returned: the snapshot's clock, log and finalize marks stay on the server.

#### Response (`TurnRecord`):
```json
{
  "index": 0,
  "season": "Spring",
  "year": 1901,
  "phase": "Movement",
  "units": [...],
  "orders": {
    "FRA_A_PAR": { "power": "FRANCE", "origin": "PAR", "order_type": "MOVE", "target": "BUR", ... },
    "GER_A_MUN": { "power": "GERMANY", "origin": "MUN", "order_type": "MOVE", "target": "BUR", ... }
  },
  "ownership": {...},
  "builds": null,
  "retreats": null,
  "resolution": {
    "resolutions": {
      "FRA_A_PAR": { "succeeded": false, "bounced": true, ... },
      "GER_A_MUN": { "succeeded": false, "bounced": true, ... }
    },
    "summary": [...],
    ...
  }
}
```

---

### `POST /api/test/seed`
Seed the game state for a specific test scenario (`standard_1901`, `tactical_blunders_demo`, `spring_retreats_demo`, `winter_adjustments_demo`). Designed for LLM-driven E2E tests and local developer verification without requiring admin credentials or full manual playthroughs.

- **Security Gate**: Only active when `ENVIRONMENT` is `development` or `test`, `ALLOW_INSECURE_DEV_AUTH=true`, or `ENABLE_TEST_SEED_ENDPOINT=1`. Returns `403 Forbidden` in production or if called against a multiplayer match.

**Request Schema (`SeedScenarioRequest`)**:
```json
{
  "scenario_id": "spring_retreats_demo",
  "game_id": "proto_1901",
  "active_power": "GERMANY"
}
```

**Responses**:
- `200 OK`: Returns the freshly initialized `GameState`.
- `400 Bad Request`: Unknown scenario identifier.
- `403 Forbidden`: Endpoint is disabled in production or target `game_id` is a multiplayer match.

---

## Detailed Specifications: Administrator Controls

Strictly restricted to the creator/host of the room in multiplayer matches. Authentication is cryptographically enforced via Supabase JWT Bearer tokens passed in the `Authorization: Bearer <token>` header:
- **Solo Sandbox Bypass**: The default local sandbox (`proto_1901`) and saved personal sandboxes (`is_sandbox=True`) permit anonymous local access without authentication headers.
- **Cryptographic JWT Verification**: In multiplayer matches, requests must supply a valid Supabase JWT signed with `SUPABASE_JWT_SECRET` (HS256). Claims (`exp`, `sub`, `email`) are validated before trusting identity.
- **Error Codes**:
  - `401 Unauthorized`: Token missing, expired, or invalid signature when accessing multiplayer admin actions.
  - `403 Forbidden`: Authenticated caller's `sub` or `email` does not match the room creator (`creator_id` / `created_by`).

### 11. `GET /api/admin/status`
Checks creator authorization and available timeline rollback snapshots.

---

### 12. `POST /api/admin/rollback`
Rolls back match state to the snapshot taken immediately prior to the latest turn adjudication.

#### Request (`AdminRollbackRequest`):
```json
{
  "user_id": "usr_1020",
  "email": "marshal@slop.eu"
}
```

---

### 13. `POST /api/admin/set-turn`
Jumps the game directly to an arbitrary season, year, or phase. The turn must be a real one: Spring or Fall with `Movement` or `Retreats`, or Winter with `Adjustments`, in 1901 or later. Anything else returns `400` and changes nothing.

#### Request (`AdminSetTurnRequest`):
```json
{
  "season": "Fall",
  "year": 1902,
  "phase": "Movement"
}
```

---

### 14. `POST /api/admin/unit/move`
Teleports any unit to any province, evicting any previous occupant and resetting the unit's order to HOLD. Only a fleet on a split-coast province takes a coast: `new_coast` if valid, otherwise the first coast. An army never has one.

#### Request (`AdminMoveUnitRequest`):
```json
{
  "unit_id": "FRA_A_PAR",
  "new_province": "BUR",
  "new_coast": null
}
```

---

### 15. `POST /api/admin/unit/spawn`
Spawns an Army or Fleet for any Great Power in any valid province.

#### Request (`AdminSpawnUnitRequest`):
```json
{
  "power": "GERMANY",
  "unit_type": "A",
  "province": "MUN"
}
```

---

### 16. `POST /api/admin/unit/destroy`
Immediately disbands and removes a unit from the board.

#### Request (`AdminDestroyUnitRequest`):
```json
{
  "unit_id": "FRA_A_PAR"
}
```

---

### 17. `POST /api/admin/ownership`
Reassigns supply center ownership to any Great Power or clears it to neutral. Returns `400` for a province that is not a supply center.

#### Request (`AdminSetOwnershipRequest`):
```json
{
  "province": "BEL",
  "power": "FRANCE"
}
```

---

### 18. `POST /api/admin/unfinalize-all`
Unlocks and unfinalizes order submissions across all 7 Great Powers simultaneously.


---

## Detailed Specifications: Real-Time WebSocket Synchronization

### 19. `WS /ws/games/{game_id}`
Establishes a persistent, low-latency WebSocket connection scoped to a specific game room (`game_id`).

- **Query Parameters**:
  - `handshake` *(optional, `1`)*: The client sends `{"type": "auth", "token": "<jwt or null>"}` as its first message, and the server waits up to 10 seconds for it. Browsers cannot set an `Authorization` header on a socket, and a token in the URL would end up in request logs. Without `handshake` the caller is treated as signed out.
  - `power` *(optional, Power)*: Picks among the caller's own seats, as in `GET /api/game`. It never shows another power's orders. Broadcasts mask foreign unadjudicated moves to default `HOLD`s, hide foreign issues and rebuild the turn preview from what the viewer may see (Fog of War).
  - `passcode` *(optional, string)*: Passcode for private campaigns. Players seated in the match do not need it.
- **Connection Handshake**:
  - Validates that `game_id` exists. If the game is missing, closes with code `4004`.
  - Accepts the socket, then reads the `auth` message when `handshake=1`.
  - For private campaigns, a caller who holds no seat must give the passcode, checked in constant time; if it is missing or wrong, closes with code `4403`.
  - Immediately transmits the sanitized `game_update` payload tailored to the connected viewer's power.
- **Client Heartbeats & Refresh**:
  - Send `{"type": "ping"}` -> Server replies `{"type": "pong"}` to maintain Cloud Run & proxy connections.
  - Send `{"type": "refresh"}` -> Server runs `tick_timer` (resolving a deadline that has passed), then resends the latest authoritative `game_update`. The client sends this when its countdown reaches zero; `ping` does not run the clock.
- **Close codes**: `4004` (no such game) and `4403` (passcode refused) are permanent, and the client does not reconnect. `1013` means try again later (the database could not be read).
- **Automatic Broadcast Triggers**:
  - Whenever an order is submitted or changed (`/api/order`, `/api/orders/batch`, `/api/orders/confirm-all`).
  - Whenever a power finalizes or unfinalizes (`/api/finalize`, `/api/unfinalize`).
  - Whenever a turn is adjudicated (`/api/adjudicate`, `/api/sandbox/ai-step`).
  - Whenever a scenario is reset (`/api/scenario`).
  - Whenever a player joins, leaves, or surrenders a sovereign power (`/api/games/{id}/join`, `/api/games/{id}/leave`, `/api/games/{id}/surrender`).
  - Whenever an administrator modifies game state (rollback, teleport, spawn, destroy, turn jump).

#### Server Broadcast (`WebSocketGameUpdate`):
```json
{
  "type": "game_update",
  "game_id": "proto_1901",
  "state": {
    "game_id": "proto_1901",
    "season": "Spring",
    "year": 1901,
    "phase": "Movement",
    "active_power": "FRANCE",
    "units": [...],
    "orders": {...},
    "ownership": {...},
    "finalized_powers": ["FRANCE"],
    "surrendered_powers": [],
    "issues": []
  },
  "summary": {
    "game_id": "proto_1901",
    "name": "Standard 1901 Theater",
    "status": "active",
    "participants": {...}
  }
}
```

---

### 20. `WS /ws/lobby`
Establishes a persistent WebSocket feed for the multiplayer match browser.

- **Connection Handshake**:
  - Immediately transmits a `lobby_update` payload containing the public matches (the same list as `GET /api/games`) and their live participant statuses. Every socket gets the same payload, so it never lists a private campaign, a sandbox or a draft; clients re-read `GET /api/games/mine` for their own.
- **Automatic Broadcast Triggers**:
  - Whenever any multiplayer game is created, joined, left, surrendered, or adjudicated.

#### Server Broadcast (`WebSocketLobbyUpdate`):
```json
{
  "type": "lobby_update",
  "games": [
    {
      "game_id": "mp_concert_104",
      "name": "Concert of Europe — Match #104",
      "status": "active",
      "season": "Spring",
      "year": 1901,
      "phase": "Movement",
      "participants": {...},
      "finalized_powers": ["GERMANY"]
    }
  ]
}
```
