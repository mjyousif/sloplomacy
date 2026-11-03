# Pre-Flight Validator & Sanity Checks (`validator.py`)

The validator module (`backend/validator.py`) runs in real time on every order dispatch. It serves two distinct functions:
1. **Rule Legality Checking**: Prevents invalid orders that violate game mechanics.
2. **Tactical Blunder Detection ("Sanity Checks")**: Proactively warns players when an order is technically legal, but strategically self-destructive or misaligned.

---

## Validation Issue Structure

Every identified issue returns a `ValidationIssue` object:
```json
{
  "id": "self_bounce_BUR",
  "severity": "warning",
  "code": "SELF_BOUNCE",
  "title": "Self-Bounce in Burgundy (BUR)",
  "message": "Both FRA_A_PAR and FRA_A_MAR are ordered to Burgundy with equal attack strength (1 vs 1). Both units will bounce and fail to move unless one is supported.",
  "unit_ids": ["FRA_A_PAR", "FRA_A_MAR"],
  "provinces": ["BUR", "PAR", "MAR"],
  "power": "FRANCE"
}
```

---

## Diagnostic Issue Codes & Severities

| Code | Severity | Description | Trigger Condition |
| :--- | :--- | :--- | :--- |
| `ILLEGAL_MOVE` | `error` | Movement impossible due to terrain or non-adjacency | Army moving to sea, Fleet moving to inland province, or non-adjacent target without active convoy. |
| `ILLEGAL_SUPPORT` | `error` | Supporting unit cannot reach the supported destination | Unit ordered to support into a province it could not legally move to itself. |
| `ILLEGAL_CONVOY` | `error` | Fleet in coastal province or army ordered to convoy | Convoy orders can only be executed by Fleets located in `SEA` provinces. |
| `SELF_BOUNCE` | `warning` | Two friendly units moving to the same destination | Two or more units belonging to the same power attack the same province with equal strength, causing a standoff. |
| `SELF_OCCUPIED_BOUNCE`| `warning` | Moving into friendly province whose unit is holding | A unit moves into a province occupied by a friendly unit that is not moving away. |
| `FRIENDLY_FIRE` | `warning` | Friendly attack on own holding unit | A unit attacks a friendly holding unit with superior support (cannot dislodge own piece). |
| `UNMATCHED_SUPPORT` | `warning` | Supported action does not match the unit's actual order | Supporter is ordered `S A PAR -> BUR`, but `A PAR` is ordered to `HOLD` or `MOVE GAS`. |
| `BROKEN_CONVOY` | `warning` | Army ordered via convoy without a functioning convoy fleet | Army ordered `MOVE via convoy`, but the intermediate fleet is holding or supporting elsewhere. |
| `UNASSIGNED_UNIT` | `warning` | Unit left on default implicit hold | Unit has not had an order manually set or confirmed prior to turn finalization. |
| `VOID_SUPPORT_SELF` | `error` | Unit attempting to support itself | A unit is ordered to support its own position or move. |

---

## Pre-Finalization Gatekeeper

When a commander clicks **Finalize Orders** in the UI, the frontend dispatches:
```http
POST /api/finalize
{
  "power": "FRANCE",
  "force": false
}
```

### Gatekeeper Logic:
```python
power_issues = validate_orders(
    CURRENT_GAME.units,
    CURRENT_GAME.orders,
    include_unassigned_warnings=True,
    target_power=req.power,
)

if power_issues and not req.force:
    return FinalizeResponse(
        finalized=False,
        requires_confirmation=True,
        issues=power_issues,
        state=CURRENT_GAME,
    )
```

1. If any issues exist (including `UNASSIGNED_UNIT` warnings), finalization is paused.
2. The client intercepts `requires_confirmation: true` and opens the **Sanity Check Modal** (`SanityCheckModal.tsx`).
3. The user can either:
   - Click **"Go Back & Revise Orders"** to fix flagged units.
   - Click **"Fix Order"** to focus directly on the problematic unit on the map.
   - Click **"Finalize Anyway (Override)"**, which re-submits `POST /api/finalize` with `force: true`.
