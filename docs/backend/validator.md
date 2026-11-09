# Pre-Flight Validator & Sanity Checks (`validator.py`)

The validator module (`backend/engine/validator.py`) runs in real time on every order dispatch and before turn finalization. It serves two distinct functions:
1. **Rule Legality Checking**: Prevents invalid orders that violate game mechanics.
2. **Tactical Blunder Detection ("Sanity Checks")**: Proactively warns players when an order is technically legal, but strategically self-destructive, mismatched, or incomplete.

The validator is **phase-aware**, adjusting its checks dynamically for **Movement**, **Retreats**, and **Winter Adjustments**.

---

## 1. Diagnostic Issue Codes & Severities

| Code | Severity | Phase | Description | Trigger Condition |
| :--- | :--- | :--- | :--- | :--- |
| `ILLEGAL_MOVE` | `error` | Movement / Retreats | Movement impossible due to terrain, coast, or non-adjacency | Army moving to sea, Fleet moving inland, non-adjacent destination without convoy, or retreating to illegal province. |
| `ILLEGAL_SUPPORT` | `error` | Movement | Supporting unit cannot reach supported target | Unit ordered to support into a province it could not legally move to itself. |
| `ILLEGAL_CONVOY` | `error` | Movement | Fleet in coastal province or army ordered to convoy | Convoy orders can only be executed by Fleets located in `SEA` provinces. |
| `VOID_SUPPORT_SELF` | `error` | Movement | Unit attempting to support itself | A unit ordered to support its own position or move. |
| `SELF_BOUNCE` | `warning` | Movement / Retreats | Friendly units moving/retreating to the same province | Two friendly units attack or retreat to the same province with equal strength, causing a mutual bounce. |
| `SELF_OCCUPIED_BOUNCE`| `warning` | Movement | Moving into province occupied by friendly holding unit | Moving into a territory held by a friendly unit that is not vacating. |
| `FRIENDLY_FIRE` | `warning` | Movement | Friendly attack on own holding unit | Supporting an attack against a friendly unit (cannot dislodge own piece). |
| `UNMATCHED_SUPPORT` | `warning` | Movement | Supported action differs from unit's actual order | Supporter ordered `S A PAR -> BUR`, but `A PAR` is ordered to `HOLD` or `MOVE GAS`. |
| `BROKEN_CONVOY` | `warning` | Movement | Army moving via convoy without active convoy fleet | Army ordered `MOVE via convoy`, but the intermediate fleet is holding, supporting, or missing. |
| `UNASSIGNED_UNIT` | `warning` | All Phases | Unit left on unconfirmed default order | Unit has not had its order manually confirmed, a dislodged unit would disband, or build/disband quota remains unfulfilled prior to finalization. |

---

## 2. Phase-Specific Validation Logic

### 1. Movement Phase
1. **Adjacency & Coast Match**: Fleets must follow coastal reachability; split coasts (e.g., `STP/NC` vs `STP/SC`) are strictly enforced.
2. **Convoy Path Verification**: Armies moving across sea bodies must have an unbroken theoretical chain of sea territories.
3. **Friendly Standoffs & Bounces**: Pre-computes attack strength (base 1 + supports) to warn if two units of the same power will bounce each other in the destination.

### 2. Retreat Phase
When units are dislodged during combat resolution:
1. **Unassigned Retreat**: A dislodged unit starts on a default `DISBAND`, so until it is confirmed an `UNASSIGNED_UNIT` warning says it will disband unless ordered to retreat.
2. **Missing Destination**: If ordered to `RETREAT` without specifying an eligible destination.
3. **Illegal Retreat Destination**: If target province is occupied, was the origin of the dislodging attacker, or was a standoff province in the preceding movement phase.
4. **Mutual Retreat Clash**: If two dislodged units of the same power are ordered to retreat into the exact same province.

### 3. Winter Adjustments Phase
Compares supply center count against active units:
1. **Disband Deficit**: If `units > supply_centers`, the power must order `DISBAND` on `units - supply_centers` units. If fewer disbands are selected, an `UNASSIGNED_UNIT` warning indicates how many more units must be disbanded.
2. **Build Quota & Location**: If `supply_centers > units`, builds (`BUILD`) are only permitted up to the quota and strictly in the power's vacant **home supply centers**.
3. **Unused Builds**: Every build slot starts on a default `WAIVE`. While a power has unused builds and at least one slot it has not decided on, an `UNASSIGNED_UNIT` warning says how many would be lost. Ordering the builds, or choosing `Waive` on purpose, clears it.

---

## 3. Pre-Finalization Gatekeeper

When a player clicks **Finalize Orders** (`POST /api/finalize`), the engine verifies all submitted moves for the active nation:

```python
power_issues = validate_orders(
    game.units,
    game.orders,
    include_unassigned_warnings=True,
    target_power=req.power,
    phase=game.phase,
    builds=game.builds,
    retreats=game.retreats,
)

if power_issues and not req.force:
    return FinalizeResponse(
        finalized=False,
        requires_confirmation=True,
        issues=power_issues,
        state=game,
    )
```

1. If any issues exist (including `UNASSIGNED_UNIT` or tactical warnings), finalization is paused.
2. The UI intercepts `requires_confirmation: true` and opens **`SanityCheckModal.tsx`**.
3. The user can either:
   - Click **"Go Back & Revise Orders"** to modify orders.
   - Click **"Fix Order"** on an issue card to jump directly to the unit.
   - Click **"Finalize Anyway (Override)"**, which resubmits `POST /api/finalize` with `force: true`.
