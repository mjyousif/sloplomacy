# Backend REST API Reference

The backend exposes a JSON REST API under the `/api` prefix on port `8000`. All requests and responses use standard `application/json` formatting. CORS is configured to accept requests from all origins (`allow_origins=["*"]`) for local web client communication.

### Multi-Game Room Scoping (`?game_id=...`)
All operational endpoints accept an optional query parameter `?game_id=<id>`. When omitted, endpoints operate on the default match room (`proto_1901`). Sandbox sessions and concurrent multiplayer lobbies pass their scoped `game_id` with every request.

---

## Endpoint Summary

### Lobby & Multiplayer Management
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/games` | List all open lobbies, active matches, and saved sandboxes | *None* | `List[MultiplayerGameSummary]` |
| `GET` | `/api/games/{game_id}` | Fetch summary metadata and status for a specific game room | *None* | `MultiplayerGameSummary` |
| `POST` | `/api/games` | Create a new multiplayer room (public or private with passcode) | `CreateGameRequest` | `MultiplayerGameSummary` |
| `POST` | `/api/games/{game_id}/join` | Claim a sovereign Great Power seat (validating passcode if private) | `JoinGameRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/{game_id}/leave` | Vacate claimed power in lobby or match, or delete sandbox | `LeaveGameRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/{game_id}/surrender` | Concede sovereign command into Civil Disorder | `SurrenderRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/save-sandbox` | Save an in-memory solo sandbox to the lobby game list | `SaveSandboxRequest` | `MultiplayerGameSummary` |

### Match & Tactical Operations
| Method | Endpoint | Description | Request Body | Response Model |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/game` | Fetch current game state and province topology dictionary | *None* | `GameBootstrapResponse` |
| `POST` | `/api/power` | Switch active viewing power | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/enter` | Checkpoint real game state and activate Sandbox Mode | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/exit` | Revert sandbox checkpoint and clear foreign pre-moves | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/clear-foreign` | Reset all foreign hypothetical orders to default HOLD | `SetPowerRequest` | `GameState` |
| `POST` | `/api/sandbox/ai-orders` | Generate DATC-compliant tactical AI orders for specified/foreign powers | `GenerateAIOrdersRequest` | `GameState` |
| `POST` | `/api/sandbox/ai-step` | Auto-plan unassigned foreign powers with tactical AI and advance turn | *None* | `GameState` |
| `POST` | `/api/order` | Submit or update an order for a single military unit | `SingleOrderUpdateRequest` | `GameState` |
| `POST` | `/api/orders/batch` | Update multiple orders simultaneously (all or nothing: one invalid order rejects the batch with `400`) | `OrderSubmissionRequest` | `GameState` |
| `POST` | `/api/orders/confirm-all` | Mark all orders of a given power as explicitly confirmed | `SetPowerRequest` | `GameState` |
| `POST` | `/api/finalize` | Pre-flight sanity check and finalize power's orders | `FinalizeRequest` | `FinalizeResponse` |
| `POST` | `/api/unfinalize` | Unlock finalized orders for subsequent editing | `SetPowerRequest` | `GameState` |
| `POST` | `/api/simulate` | Execute non-destructive tactical preview resolution | *None* | `SimulationResult` |
| `POST` | `/api/adjudicate` | Commit orders, resolve combat, advance season/phase | *None* | `GameState` |
| `POST` | `/api/scenario` | Reset board and load predefined tactical scenario (`400` for an unknown scenario, `404` for an unknown game) | `ScenarioRequest` | `GameState` |

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

---

## Detailed Specifications: Lobby & Multiplayer Management

### 1. `GET /api/games`
Returns the list of all registered multiplayer game rooms, open lobbies, and saved sandboxes.

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

### 2. `GET /api/games/{game_id}`
Returns details and participant metadata for a specific multiplayer match lobby.

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

### 4. `POST /api/games/{game_id}/join`
Claims an open Great Power seat for a user. If the campaign is private (`has_passcode: true`), the correct `passcode` must be provided unless the user is already a confirmed participant.

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

### 4. `POST /api/games/{game_id}/leave`
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

### 5. `POST /api/games/{game_id}/surrender`
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

### 6. `POST /api/games/save-sandbox`
Saves an active solo sandbox into the persistent game summary registry.

#### Request (`SaveSandboxRequest`):
```json
{
  "game_id": "sandbox_tactics_bur",
  "name": "Burgundy Opening Analysis",
  "user_id": "usr_1020",
  "email": "marshal@slop.eu"
}
```

---

## Detailed Specifications: Match & Tactical Operations

### 7. `GET /api/game`
Bootstraps the client by returning the full current `GameState` along with the complete static dictionary of all 76 `PROVINCES` (including coastline and adjacency rules).

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

### 8. `POST /api/sandbox/ai-orders`
Generates DATC-compliant, intelligent tactical orders for specified Great Powers (or foreign powers by default) using the Chancellery Tactical AI engine. Avoids friendly self-bounces, coordinates multi-power attacks and supports, and prioritizes strategic supply centers.

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
Automatically plans tactical moves for any unassigned foreign powers with the Tactical AI engine and immediately adjudicates and steps the turn forward to the next phase/season.

#### Response (`GameState`):
Returns the next phase `GameState` with combat resolutions and updated unit positions.

---

### 10. `POST /api/order`
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

---

### 9. `POST /api/finalize`
Attempts to lock in orders for the active power. If errors or unassigned warnings exist, finalization is halted (`requires_confirmation: true`) unless `force: true`.

#### Request (`FinalizeRequest`):
```json
{
  "power": "FRANCE",
  "force": false
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

A unit whose order the engine rejects holds in place. When a power reaches 18 supply centers the response carries `winner`, the clock stays on the deciding phase, and further calls return `409`.

---

## Detailed Specifications: Administrator Controls

Strictly restricted to the creator/host of the room (checked via `creator_id` and `creator_email`).

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
Teleports any unit to any province, evicting any previous occupant and resetting the unit's order to HOLD.

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
