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
| `POST` | `/api/games` | Create a new multiplayer room or sandbox session | `CreateGameRequest` | `MultiplayerGameSummary` |
| `POST` | `/api/games/{game_id}/join` | Claim a sovereign Great Power seat in a game room | `JoinGameRequest` | `GameBootstrapResponse` |
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
| `POST` | `/api/order` | Submit or update an order for a single military unit | `SingleOrderUpdateRequest` | `GameState` |
| `POST` | `/api/orders/batch` | Update multiple orders simultaneously | `OrderSubmissionRequest` | `GameState` |
| `POST` | `/api/orders/confirm-all` | Mark all orders of a given power as explicitly confirmed | `SetPowerRequest` | `GameState` |
| `POST` | `/api/finalize` | Pre-flight sanity check and finalize power's orders | `FinalizeRequest` | `FinalizeResponse` |
| `POST` | `/api/unfinalize` | Unlock finalized orders for subsequent editing | `SetPowerRequest` | `GameState` |
| `POST` | `/api/simulate` | Execute non-destructive tactical preview resolution | *None* | `SimulationResult` |
| `POST` | `/api/adjudicate` | Commit orders, resolve combat, advance season/phase | *None* | `GameState` |
| `POST` | `/api/scenario` | Reset board and load predefined tactical scenario | `ScenarioRequest` | `GameState` |

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

### 2. `POST /api/games`
Creates a new multiplayer game room or dedicated sandbox session.

#### Request (`CreateGameRequest`):
```json
{
  "name": "Western Front 1901",
  "scenario_id": "standard_1901",
  "is_sandbox": false,
  "creator_email": "marshal@slop.eu",
  "creator_id": "usr_1020"
}
```

---

### 3. `POST /api/games/{game_id}/join`
Claims an open Great Power seat for an authenticated user.

#### Request (`JoinGameRequest`):
```json
{
  "power": "FRANCE",
  "user_id": "usr_1020",
  "email": "marshal@slop.eu"
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

### 8. `POST /api/order`
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
Jumps the game directly to an arbitrary season, year, or phase.

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
Reassigns supply center / province ownership to any Great Power or clears it to neutral.

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
