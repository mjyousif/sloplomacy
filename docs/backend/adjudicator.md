# Tactical Adjudication Engine (`adjudicator.py`)

The adjudication engine (`backend/adjudicator.py`) is responsible for resolving tactical movements, combat conflicts, support cuts, maritime convoys, bounces, and dislodgements under standard Diplomacy rules (inspired by the **Diplomacy Adjudicator Test Cases — DATC**).

---

## Core Algorithm Overview

Adjudication in Diplomacy is inherently interdependent: whether a support is cut depends on whether the attacker is dislodged; whether a fleet is dislodged depends on whether supporting fleets have their supports cut; and circular movement chains depend on whether any single piece in the cycle fails to vacate.

To solve this deterministically, `adjudicator.py` implements an **iterative fixed-point resolution cycle**:

```
+-------------------------------------------------------------------+
|                  Step 1: Order Normalization                      |
|  - Check path legality (direct adjacency vs valid convoy chain).   |
|  - Illegal moves revert to HOLD with reason documented.           |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|              Step 2: Iterative Fixed-Point Loop                   |
|  Repeat until no support cuts or convoy disruptions change:       |
|                                                                   |
|   a. Convoy Chain Evaluation:                                     |
|      - Verify that sea convoys are unbroken.                      |
|      - If a convoying fleet is dislodged, the convoy is disrupted.|
|                                                                   |
|   b. Support Cut Detection:                                       |
|      - Attack on supporter cuts support UNLESS attack comes from   |
|        the province the supporter is supporting against.          |
|      - If dislodged by any unit, support is unconditionally cut.  |
|                                                                   |
|   c. Attack & Defense Strength Calculation:                       |
|      - Base strength = 1.                                         |
|      - Plus 1 for each uncut, legally positioned SUPPORT.         |
|                                                                   |
|   d. Head-to-Head & Destination Contention:                       |
|      - Higher attack strength wins and advances.                  |
|      - Equal strengths bounce; units remain in origin.            |
|                                                                   |
|   e. Circular Movement Resolution:                                |
|      - Detect loops (e.g. A->B, B->C, C->A).                      |
|      - If all units in loop move without external dislodgement,    |
|        the rotation succeeds synchronously.                       |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|               Step 3: Dislodgements & Results                     |
|  - Flag dislodged units (attack strength > defense strength).     |
|  - Enforce self-dislodgement ban (cannot dislodge own unit).      |
|  - Update unit coordinates and Fall supply center ownership.      |
+-------------------------------------------------------------------+
```

---

## Support Resolution & Cutting Rules

A unit ordered to `SUPPORT` another unit's move or hold adds 1 to that unit's tactical strength.

### 1. Support Hold
```
A BER S A MUN H
```
- Valid if `BER` is adjacent to `MUN`.
- Increases `A MUN`'s defense strength from 1 to 2.

### 2. Support Move
```
F NTH S A BEL -> HOL
```
- Valid only if `NTH` can legally reach `HOL` (the destination).
- Note: The supporting unit does NOT need to be able to reach the *origin* (`BEL`), only the *destination* (`HOL`).

### 3. Support Cut Conditions
A support is **cut** (negated to 0) if:
1. The supporting unit is attacked by a foreign unit from any province **other than the province into which support is being directed**.
2. Example:
   - `FRA F MAO S A SPA -> POR`
   - `ENG F IRI -> MAO` (Cuts French support in `MAO`!)
3. Exception (The "Don't Cut via Target" Rule):
   - If `GER A MUN` attacks `BER`, while `BER` is supporting an attack *into* `MUN`, `BER`'s support is **not** cut by `MUN`'s attack. (However, if `MUN` achieves superior strength and dislodges `BER`, the support is cut upon dislodgement).

---

## Maritime Convoy Chains

Armies can travel across multiple contiguous sea zones if friendly or foreign Fleets are ordered to `CONVOY`:

```
A LON -> BEL via convoy
F ENG C A LON -> BEL
```

### Complex Multi-Sea Chains
```
A EDI -> BRE via convoy
F NTH C A EDI -> BRE
F ENG C A EDI -> BRE
```
The adjudicator executes a Breadth-First Search (BFS) over all fleets ordered to convoy the specific army. If a continuous path of sea zones links the army's starting coastline to the destination coastline, the convoy is deemed **active**.

### Disrupted Convoys
If an enemy fleet attacks and dislodges any fleet in the required convoy chain, the convoy is **disrupted**, and the army's move fails (the army remains in its origin province).

---

## Self-Dislodgement Prohibition

Under standard Diplomacy rules:
> **A player's units may not dislodge another unit of the same nationality.**

Even if Power A supports an attack on one of its own units with overwhelming strength (e.g. Strength 3 vs Defense 1), the attack bounces, and the defending unit is **not** dislodged.

However, a player's attack *can* cut support offered by one of their own units if attacking across different provinces.

---

## Circular Movement

When multiple units rotate positions simultaneously:
```
A PAR -> BUR
A BUR -> MAR
A MAR -> PAR
```
If no conflicting external forces enter the chain and each move succeeds, the adjudicator detects the closed loop and permits all units to swap positions synchronously without mutual bouncing.
