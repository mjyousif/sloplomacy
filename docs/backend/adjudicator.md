# Tactical Adjudication Engine (`adjudicator.py`)

The adjudication engine (`backend/adjudicator.py`) evaluates orders, manages phase transitions, and resolves tactical movements, combat conflicts, support cuts, maritime convoys, bounces, dislodgements, retreats, and winter supply center builds/disbands under standard Diplomacy rules.

It interfaces with the authoritative **Python `diplomacy` package** (`diplomacy>=1.1.2`), which implements standard Diplomacy Adjudicator Test Cases (DATC) resolution semantics.

---

## 1. Engine Architecture & Integration

Instead of relying on fragile ad-hoc combat heuristics, `adjudicator.py` synchronizes the server's `GameState` with an authoritative `diplomacy.Game` instance:

```
+-------------------------------------------------------------------------+
|                              GameState                                  |
|  - season: "Spring" | "Fall" | "Winter"                                  |
|  - year: 1901                                                           |
|  - phase: "Movement" | "Retreats" | "Adjustments"                       |
|  - units, orders, ownership, surrendered_powers                         |
+------------------------------------+------------------------------------+
                                     |
                                     v
                  to_diplomacy_phase_code() & create_diplomacy_game()
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  diplomacy.Game(map_name="standard")                    |
|  - Phase format: "S1901M", "S1901R", "F1901M", "F1901R", "W1901A"       |
|  - Units and dislodged units populated                                  |
|  - Supply center ownership mapped                                       |
|  - Civil disorder rules enforced for surrendered powers                 |
+------------------------------------+------------------------------------+
                                     |
                                     v
                         game.process() / game.step()
                                     |
                                     v
+-------------------------------------------------------------------------+
|                     State Extraction & Synchronization                  |
|  - Extract unit movements, bounces, cuts, dislodgements                 |
|  - Parse next phase code via parse_diplomacy_phase()                    |
|  - Compute build/disband quotas via compute_current_builds()            |
|  - Calculate valid retreat paths via game.get_retreat_options()         |
|  - Generate OrderResolution records and SimulationResult                |
+-------------------------------------------------------------------------+
```

---

## 2. Phase Resolution Cycle

The engine manages standard Diplomacy phase progression:

```
Spring Movement (S<Year>M)
       │
       ├─► Dislodgements exist? ──► Spring Retreats (S<Year>R)
       │                                     │
       └─────────────────────────────────────┴─► Fall Movement (F<Year>M)
                                                       │
       ┌───────────────────────────────────────────────┘
       │
       ├─► Dislodgements exist? ──► Fall Retreats (F<Year>R)
       │                                     │
       └─────────────────────────────────────┴─► Winter Adjustments (W<Year>A)
                                                       │
                                                 Recalculate SCs & Units
                                                 (Builds / Disbands)
                                                       │
       ┌───────────────────────────────────────────────┘
       ▼
Spring Movement of Next Year (S<Year+1>M)
```

### 1. Movement Phase (`Movement`)
- Units execute `HOLD`, `MOVE`, `SUPPORT`, or `CONVOY`.
- Contested destinations result in bounces (standoffs) unless a unit has superior uncut support.
- If a defending unit is overpowered by a superior attack force, it is **dislodged** and the engine transitions to **Retreats**.
- If no dislodgements occur, the Retreats phase is skipped automatically.

### 2. Retreat Phase (`Retreats`)
- Only dislodged units receive orders: either `RETREAT` to an eligible adjacent province or `DISBAND`.
- Valid retreat destinations:
  - Must be reachable by the unit type (Army vs Fleet / Coast).
  - Must be unoccupied.
  - Must **not** be the province from which the dislodging attack originated.
  - Must **not** have been contested by a standoff (bounce) during the preceding movement phase.
- If two dislodged units retreat to the same province, both bounce and are disbanded automatically.

### 3. Winter Adjustments Phase (`Adjustments`)
- Occurs each winter following Fall resolution.
- Compares each power's controlled Supply Centers (SCs) to its current surviving unit count:
  - **Surplus SCs (`SC > Units`)**: Power may order `BUILD` (Army or Fleet) in vacant home supply centers up to the difference.
  - **Deficit SCs (`SC < Units`)**: Power must order `DISBAND` (anywhere on board) until unit count equals SC count.
  - **Balanced (`SC == Units`)**: No adjustments required.

---

## 3. Order Translation (`order_to_diplomacy_str`)

The internal Pydantic `Order` model is serialized into standard DATC order notation before injection into `diplomacy.Game`:

| Order Type | Internal Parameters | DATC Notation Example |
| :--- | :--- | :--- |
| `HOLD` | `origin: "PAR"` | `A PAR H` |
| `MOVE` | `origin: "PAR", target: "BUR"` | `A PAR - BUR` |
| `MOVE` (split coast) | `origin: "BAR", target: "STP", target_coast: "NC"` | `F BAR - STP/NC` |
| `SUPPORT` (hold) | `origin: "BER", aux_unit_origin: "MUN", target: "MUN"` | `A BER S A MUN` |
| `SUPPORT` (move) | `origin: "NTH", aux_unit_origin: "BEL", target: "HOL"` | `F NTH S A BEL - HOL` |
| `CONVOY` | `origin: "ENG", aux_unit_origin: "LON", target: "BEL"` | `F ENG C A LON - BEL` |
| `RETREAT` | `origin: "LON", target: "WAL"` | `A LON R WAL` |
| `DISBAND` | `origin: "PAR"` | `A PAR D` |
| `BUILD` | `target: "BUD", unit_type: "A"` | `A BUD B` |
| `WAIVE` | `target: "BUD"` | `A BUD WAIVE` |

---

## 4. Simulation Preview vs. Commit Adjudication

`adjudicator.adjudicate_turn()` operates in two modes:

1. **Simulation Mode (`is_simulation=True`)**:
   - Clones current state into a temporary `diplomacy.Game` instance.
   - Evaluates all orders and extracts tactical outcomes without advancing the live match state.
   - Returns a `SimulationResult` containing:
     - `resolutions`: Per-unit outcomes (`succeeded`, `bounced`, `cut`, `dislodged`, `dislodged_by`, `attack_strength`, `defense_strength`, `reason`).
     - `dislodged_units`: Units needing retreat orders.
     - `clash_provinces`, `bounce_provinces`, `cut_provinces`.
     - `next_phase`: Preview of what phase will follow.
     - `builds` / `retreats`: Available build counts and retreat paths.
     - `winner`: The power these orders would make the winner, if any. Only a commit ends the game.
2. **Commit Adjudication (`is_simulation=False`)**:
   - Commits resolution permanently to authoritative `GameState`.
   - Advances `season`, `year`, and `phase`.
   - Updates `ownership` map during Fall movement resolution.
   - Clears finalized order rosters and updates `turn_history`.

---

## Orders Nobody Gave

`create_default_orders` in `backend/engine/order_utils.py` (re-exported by `main.py`) decides what happens to anything left unordered, and it follows the rulebook. Empty seats, surrendered powers and players who run out of time all get the same result:

| Phase | Left unordered | Result |
| :--- | :--- | :--- |
| Movement | Any unit | Holds |
| Retreats | A dislodged unit | Disbands, even if it had somewhere to go |
| Adjustments | A build | Waived, so nothing is built |
| Adjustments | A required disband | The engine removes a unit by its civil disorder rules |

## 5. Standard Tactical Invariants Enforced

1. **Self-Dislodgement Prohibition**: A player cannot dislodge their own unit, even with superior support.
2. **Support Cutting Exception ("Don't Cut via Target")**: An attack by Province B against Province A does not cut Province A's support into Province B unless Province A is dislodged.
3. **Civil Disorder for Surrendered Powers**: Units belonging to surrendered powers hold passively, never provide support, build nothing, and auto-disband if dislodged or down in supply centers. Any retreat or build chosen before surrendering is dropped.
4. **The Engine Owns the Board**: The engine silently drops orders it finds illegal, with no result code, and the unit holds. `adjudicate_turn` checks each order against `game.get_orders()`, so a dropped order is reported with `succeeded: false` and a "rejected" reason and is never applied. `test_final_positions_always_match_the_engine` compares final positions against the bare engine over random turns.
5. **Incomplete Orders**: `order_to_diplomacy_str` returns `None` for a move with no target, or a support or convoy with no subject, because the engine raises on those. They follow the same rejected path, so drafting one cannot break a game.
6. **Game End**: When a power reaches 18 supply centers the engine's phase becomes the bare word `COMPLETED`, which is not a real phase. `adjudicate_turn` sets `winner` and keeps `next_season`, `next_year` and `next_phase` on the deciding phase. Committing it sets `GameState.winner`, after which `POST /api/adjudicate` returns `409`. A rollback or scenario reset reopens the game.
