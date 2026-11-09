# Diplomacy 1901 Rulebook Reference & Tactical Interpretation

This document provides a direct mapping between the official standard rules of Diplomacy (1901) and their implementation inside this engine's validator (`engine/validator/`) and adjudicator (`engine/adjudicator/`).

---

## The Great Powers & Starting Positions

In 1901, seven Great Powers contest Europe with 22 initial units:

| Power | Starting Armies | Starting Fleets | Home Supply Centers |
| :--- | :--- | :--- | :--- |
| **Austria-Hungary** | `A VIE`, `A BUD` | `F TRI` | Vienna, Budapest, Trieste (3) |
| **England** | `A LVP` | `F LON`, `F EDI` | London, Edinburgh, Liverpool (3) |
| **France** | `A PAR`, `A MAR` | `F BRE` | Paris, Marseilles, Brest (3) |
| **Germany** | `A BER`, `A MUN` | `F KIE` | Berlin, Munich, Kiel (3) |
| **Italy** | `A ROM`, `A VEN` | `F NAP` | Rome, Venice, Naples (3) |
| **Russia** | `A MOS`, `A WAR` | `F STP/SC`, `F SEV` | Moscow, Warsaw, St. Petersburg, Sevastopol (4) |
| **Turkey** | `A CON`, `A SMY` | `F ANK` | Constantinople, Ankara, Smyrna (3) |

---

## Rulebook Mechanisms & Engine Behavior

### 1. Equal Strength Standoffs (Bounces)
- **Rule**: If two or more units with equal attack strength attempt to enter the same province, none of them succeed. The province remains unoccupied (or occupied by whatever unit was already holding there).
- **Engine Behavior**:
  - The adjudicator flags both units with `bounced = true`, `succeeded = false`.
  - If both units belong to the same power, the validator alerts with `SELF_BOUNCE` before turn execution.

### 2. Head-to-Head Movement vs Passing
- **Head-to-Head Clash**: `A PAR -> BUR` vs `A BUR -> PAR`.
  - Two units attempting to swap positions directly without a convoy bounce unless one possesses superior support.
  - If one has superior support, the inferior unit is **dislodged**.
- **Passing Movement**:
  - Two units can move to each other's territories without conflict if one or both travel via convoy, as they do not meet on the same land route.

### 3. Support Legality
- **Destination Reachability**: A supporting unit only needs to be capable of moving into the *destination* province. It does NOT need to reach the province where the supported unit is originating from.
  - Example: `F IRI` can support `F MAO -> ENG` because `IRI` touches `ENG`, even though `IRI` also touches `MAO`.
- **Engine Behavior**:
  - If a unit orders support into a province it cannot legally reach, the validator raises `ILLEGAL_SUPPORT` (severity: `error`).

### 4. Support Cutting Mechanics
- **Standard Cut**: An attack on a supporting unit cuts its support, reducing the support contribution to 0.
- **The "Target Province" Exemption**: An attack from the very province being attacked by the supported action does **not** cut the support.
  - *Example*: `FRA A PAR S FRA A BUR -> RUH`. If `GER A RUH -> PAR`, RUH's attack does NOT cut `A PAR`'s support!
  - *Exception*: If `RUH` achieves superior strength and actually **dislodges** `A PAR`, the support is cut upon dislodgement.
- **Engine Behavior**:
  - Modeled in the adjudicator during the iterative resolution loop.

### 5. Maritime Convoys
- **Convoy Bridges**: Only Armies can be convoyed. Convoys must take place exclusively through `SEA` provinces (not coastal land provinces).
- **Disruption by Dislodgement**: An attack on a convoying fleet does **not** cut its convoy order, unless the fleet is **dislodged**.
- **Engine Behavior**:
  - If any fleet in the BFS convoy chain is marked `dislodged`, the entire convoy route is broken and the army fails to advance (`bounced = true`).

### 6. Self-Dislodgement Prohibition
- **Rule**: A player can never dislodge one of their own units, even if an attack against it is supported with overwhelming force.
- **Engine Behavior**:
  - The adjudicator checks ownership of attacker and defender. If they match, `dislodged` is barred from being set to `true`.
  - The validator flags this scenario with `FRIENDLY_FIRE`.

### 7. Fall Adjustments & Supply Center Control
- In `Spring`, movements and dislodgements occur, but supply center ownership remains unchanged.
- In `Fall`, any unit occupying a supply center at the conclusion of the movement/retreat phase claims ownership for its Great Power.
- **Engine Behavior**:
  - `POST /api/adjudicate` checks `if CURRENT_GAME.season == "Fall":` and updates `CURRENT_GAME.ownership` for all occupied supply centers.

---

### 8. Missed Orders
Nothing is ordered on a player's behalf:
- A unit with no order holds.
- A dislodged unit with no retreat order disbands, even if it had somewhere to go.
- A build that was not ordered is waived.
- A power that does not choose its required disbands has them chosen by the engine.

Empty seats and surrendered powers follow the same rules, so they never build and their dislodged units always disband. Finalizing warns about a unit that would disband or a build that would be lost.

### 9. Turn Clock
This is a house rule for live multiplayer matches. Nothing is timed until the host starts the clock, which opens the first vote.

- **Movement phases** open with a 60-second vote: 15, 20 or 30 minutes, or pause. Orders stay open during it. The vote ends when everyone has voted or the 60 seconds are up. Most votes wins and a tie goes to the longer option, with pause counting as the longest.
- **Retreats and Adjustments** get a fixed 5 minutes with no vote.
- **Pausing** happens if the vote chooses it or nobody votes. Every player then has to ready up, which opens a new vote.
- **Extending:** 5 of 7 players can add 5 minutes to a running clock, as often as they agree to. With fewer players it scales: 6 need 5, 5 need 4, 4 need 3, 3 need 3, and 2 need 2.
- **Time running out** resolves the phase with whatever players have entered. Anything else follows [Missed Orders](#8-missed-orders).
- **Finishing early** still works: the phase resolves as soon as everyone has finalized, even during a vote or a pause.

Surrendered and eliminated players do not count. The host can still resolve a phase by force, which is also the way out of a pause if someone has gone missing.

### 10. Orders Become Public Once Resolved
Orders are secret until their phase resolves, then everyone sees them, as when the orders are read out at a table. The turn selector at the foot of the tools pane shows any of the last 30 resolved phases with every nation's orders and how each resolved. The phase being played is never in it.

---

## Winning the Game

The game ends as soon as one power controls 18 of the 34 supply centers. This is checked after Fall resolves, including any Fall retreats, and the Winter adjustments for that year are not played.
