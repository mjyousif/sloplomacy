# Backend REST API Reference

The backend exposes a JSON REST API under the `/api` prefix on port `8000`. All requests and responses use standard `application/json` formatting. CORS is configured to accept requests from all origins (`allow_origins=["*"]`) for local web client communication.

---

## Endpoint Summary

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
| `POST` | `/api/adjudicate` | Commit orders, resolve combat, advance season | *None* | `GameState` |
| `POST` | `/api/scenario` | Reset board and load predefined tactical scenario | `ScenarioRequest` | `GameState` |
| `POST` | `/api/games/{game_id}/leave` | Vacate claimed power in lobby or active match, or remove saved sandbox | `LeaveGameRequest` | `GameBootstrapResponse` |
| `POST` | `/api/games/{game_id}/surrender` | Concede sovereign command into Civil Disorder (optionally vacate seat) | `SurrenderRequest` | `GameBootstrapResponse` |

---

## Detailed Specifications

### 1. `GET /api/game`
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
    "issues": [...],
    "last_resolution": {...},
    "turn_history": ["Game initialized — Spring 1901 Diplomatic & Movement Phase."]
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
      "fleet_adj": {}
    },
    ...
  }
}
```

---

### 2. `POST /api/power`
Switches the active perspective power. If an unfinalized change occurred, the active power field is updated and diagnostics are re-run against the new perspective.

#### Request (`SetPowerRequest`):
```json
{
  "power": "ENGLAND"
}
```

---

### 3. `POST /api/sandbox/enter`
Saves an in-memory deep copy of `CURRENT_GAME` into `SANDBOX_CHECKPOINT`. Subsequent multi-power commands can be issued freely.

#### Request (`SetPowerRequest`):
```json
{
  "power": "FRANCE"
}
```

---

### 4. `POST /api/sandbox/exit`
Exits hypothetical Sandbox Mode. If turns were simulated or stepped forward, the pre-sandbox turn checkpoint is restored. All orders belonging to foreign powers are reset to `HOLD`. Orders created by the active power during the current turn are preserved.

#### Request (`SetPowerRequest`):
```json
{
  "power": "FRANCE"
}
```

---

### 5. `POST /api/sandbox/clear-foreign`
Resets all orders belonging to other powers back to default unconfirmed `HOLD` without rolling back the player's own hypothetical moves.

#### Request (`SetPowerRequest`):
```json
{
  "power": "FRANCE"
}
```

---

### 6. `POST /api/order`
Creates or updates the order for a single unit. Automatically un-finalizes the owning power if it had previously finalized.

#### Request (`SingleOrderUpdateRequest`):
```json
{
  "order": {
    "unit_id": "FRA_A_PAR",
    "power": "FRANCE",
    "unit_type": "A",
    "origin": "PAR",
    "order_type": "MOVE",
    "target": "BUR",
    "is_explicit": true
  },
  "active_power": "FRANCE"
}
```

#### Response:
Returns the updated `GameState`, including refreshed `issues` and `last_resolution`.

---

### 7. `POST /api/orders/batch`
Submits an array of orders in a single payload.

#### Request (`OrderSubmissionRequest`):
```json
{
  "power": "FRANCE",
  "orders": [
    {
      "unit_id": "FRA_A_PAR",
      "power": "FRANCE",
      "unit_type": "A",
      "origin": "PAR",
      "order_type": "MOVE",
      "target": "BUR",
      "is_explicit": true
    },
    {
      "unit_id": "FRA_A_MAR",
      "power": "FRANCE",
      "unit_type": "A",
      "origin": "MAR",
      "order_type": "SUPPORT",
      "aux_unit_origin": "PAR",
      "target": "BUR",
      "is_explicit": true
    }
  ]
}
```

---

### 8. `POST /api/finalize`
Performs the pre-finalization tactical sanity check. If severe tactical blunders (such as self-bounces, unmatched supports, or unassigned units) exist, the request returns `requires_confirmation: true` unless `force: true` is supplied.

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
      "message": "Both FRA_A_PAR and FRA_A_MAR are moving to Burgundy with equal force.",
      "unit_ids": ["FRA_A_PAR", "FRA_A_MAR"],
      "provinces": ["BUR", "PAR", "MAR"],
      "power": "FRANCE"
    }
  ],
  "state": {...}
}
```

---

### 9. `POST /api/adjudicate`
Finalizes the current turn and advances the game clock:
- Evaluates combat strengths, support cuts, convoys, and dislodgements.
- Advances `Spring` -> `Fall` of the same year, or `Fall` -> `Spring` of year + 1.
- In `Fall` turns, updates supply center ownership for newly occupied supply centers.
- Generates default `HOLD` orders for new unit configurations.
- Appends an entry to `turn_history`.

#### Response:
Returns the newly advanced `GameState`.

---

### 10. `POST /api/scenario`
Resets the board and seeds a scenario.
- `"standard_1901"`: Standard starting configuration (17 armies, 17 fleets, 34 supply centers).
- `"tactical_blunders_demo"`: Pre-loads intentional tactical blunders (France self-bouncing in BUR, England unmatched support in NTH) for diagnostic demonstration.

#### Request (`ScenarioRequest`):
```json
{
  "scenario_id": "tactical_blunders_demo",
  "active_power": "FRANCE"
}
```

---

## Administrator & Game Creator Endpoints

These endpoints are strictly restricted to the game creator (enforced via `creator_id` / `created_by` email validation and 403 Forbidden checks). In solo sandbox mode, full administrator capabilities are permitted by default.

### 11. `GET /api/admin/status`
Checks administrator privileges and timeline rollback snapshot depth for the specified game.

#### Response (`AdminStatusResponse`):
```json
{
  "is_creator": true,
  "can_rollback": true,
  "history_count": 2,
  "creator_email": "creator@diplomacy.eu",
  "creator_id": "user_12345"
}
```

---

### 12. `POST /api/admin/rollback`
Reverts the game state to the snapshot taken immediately before the last turn adjudication, restoring previous units, orders, and clock state.

#### Request (`AdminRollbackRequest`):
```json
{
  "user_id": "user_12345",
  "email": "creator@diplomacy.eu"
}
```

---

### 13. `POST /api/admin/unit/move`
Arbitrarily teleports any unit on the board to any valid province, updating its location, coast, and resetting its order to HOLD. Any unit currently occupying the target province is removed.

#### Request (`AdminMoveUnitRequest`):
```json
{
  "unit_id": "FRA_A_PAR",
  "new_province": "BUR",
  "new_coast": null
}
```

---

### 14. `POST /api/admin/unit/spawn`
Arbitrarily creates a new unit for any Great Power in any valid province (with automatic coast assignment for bicoastal provinces).

#### Request (`AdminSpawnUnitRequest`):
```json
{
  "power": "GERMANY",
  "unit_type": "A",
  "province": "MUN"
}
```

---

### 15. `POST /api/admin/unit/destroy`
Immediately disbands and removes any unit from the board and orders list.

#### Request (`AdminDestroyUnitRequest`):
```json
{
  "unit_id": "FRA_A_PAR"
}
```

---

### 16. `POST /api/admin/set-turn`
Arbitrarily sets the season, year, or phase.

#### Request (`AdminSetTurnRequest`):
```json
{
  "season": "Spring",
  "year": 1902,
  "phase": "Movement"
}
```

---

### 17. `POST /api/admin/ownership`
Reassigns or clears province / supply center ownership.

#### Request (`AdminSetOwnershipRequest`):
```json
{
  "province": "BEL",
  "power": "FRANCE"
}
```

---

### 18. `POST /api/admin/unfinalize-all`
Unlocks and unfinalizes orders across all 7 Great Powers simultaneously.
