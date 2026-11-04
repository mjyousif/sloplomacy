# Macro Sidebar & Controls (`MacroSidebar.tsx`)

The **Macro Sidebar** (`frontend/src/components/MacroSidebar.tsx`) sits alongside the map, providing a complete roster of all military units, phase-aware order builders, diagnostic warnings, surrender status, and turn progression controls.

---

## Layout Sections

### 1. Active Nation Header & Supply Center Tally
- Displays the currently commanded Great Power, national crest, and color bar.
- Shows total controlled Supply Centers and active unit count.
- **Seat Lock Indicator**: In multiplayer matches, locks to the player's claimed nation; in sandbox mode, enables quick-switching across all 7 nations.
- **Civil Disorder Banner**: If the power has surrendered, displays an amber banner indicating units are operating in autonomous defense (holding, no support).
- **Admin Tools & Surrender Buttons**: Quick-action buttons to open `AdminToolsModal.tsx` (for room creators/sandbox) and `SurrenderModal.tsx` (for claimed active seats).

### 2. Real-Time Diagnostics & Blunder Alert Strip
- Evaluates `issues` returned by the backend validator.
- Groups issues by severity (`error`, `warning`, `info`).
- Clicking an issue card zooms the map directly to the implicated provinces and selects the unit.

### 3. Phase-Aware Order Roster

#### A. Movement Phase (`Movement`)
Each active unit is presented as an interactive card:
- **Unit Badge**: Army (`A`) or Fleet (`F`) icon + province name.
- **Current Order Summary**: Formatted symbolic syntax (e.g. `A PAR ──► BUR`, `F LON HOLD`).
- **Interactive Action Buttons**:
  - `HOLD`: Sets unit to hold position.
  - `MOVE`: Expands destination dropdown listing reachable provinces (with coast picker for split-coast destinations like `STP`, `SPA`, `BUL`).
  - `SUPPORT`: Configures supported unit and target destination.
  - `CONVOY`: Configures fleet sea transport bridge for an Army.

#### B. Retreat Phase (`Retreats`)
Only dislodged units requiring orders appear in the roster:
- **Dislodged Badge**: Highlights province and the dislodging attacker origin.
- **Eligible Retreat Options**: Dropdown populated strictly with valid retreat destinations (unoccupied, non-attacker, non-standoff provinces).
- **Disband Option**: Disbands the unit immediately if no safe retreats exist or by choice.

#### C. Winter Adjustments Phase (`Adjustments`)
Displays build and disband quotas:
- **Surplus Supply Centers (`buildCount > 0`)**: Displays cards for vacant home supply centers. Commanders select `BUILD ARMY`, `BUILD FLEET` (with coast options for bicoastal home centers like `STP`), or `WAIVE`.
- **Supply Center Deficit (`buildCount < 0`)**: Prompts commanders to select surplus units to `DISBAND` until the unit count matches the supply center tally.

### 4. Tactical General Staff AI & Automation Tools
- **"Plan Opponents"**: Deploys the built-in Diplomacy Tactical AI to formulate intelligent, DATC-compliant, non-conflicting tactical orders for all other 6 nations.
- **"Plan All 7 Powers"**: Auto-plans tactical orders for every Great Power across the entire board.
- **"Plan [Nation]"**: Formulates tactical orders specifically for the active power.
- **"AI Step Phase"**: Auto-plans foreign powers and steps the game clock directly to the next phase with full adjudication.
- **"Confirm All Holds"**: Marks all unassigned units as explicitly holding, clearing `UNASSIGNED_UNIT` warnings before finalization.
- **"Clear Foreign Pre-Moves"** (Sandbox Mode): Instantly wipes hypothetical moves assigned to rival nations.

### 5. Turn Simulation & Resolution Preview
- **"Simulate Turn" (`POST /api/simulate`)**: Runs non-destructive adjudication. Projects battle clashes, cut supports, bounces, and successful maneuvers directly onto the map.
- **"Clear Simulation Overlay"**: Hides the simulation preview to resume order drafting.

### 6. Turn Finalization & Adjudication
- **"Finalize Orders" (`POST /api/finalize`)**: Initiates pre-finalization checks. If warnings or unassigned units exist, opens `SanityCheckModal.tsx`.
- **Consensus Auto-Adjudication (Multiplayer)**: In multiplayer matches, turns advance automatically once all required active powers finalize their orders. Non-creator players see a real-time consensus status card (`"Resolution Progress: X/Y Ready"`, `"Waiting on: [Powers]"`) rather than a manual button. Connected clients poll state in the background to seamlessly receive phase transitions.
- **"Adjudicate Turn & Advance" (`POST /api/adjudicate`)**:
  - In Solo / Sandbox Mode: Commits moves and advances the season/phase.
  - In Multiplayer Mode: Restricted to the **Game Creator** as `"Force Adjudicate Phase (Host Override)"` to bypass stalled or AFK players. Unauthorized non-creator calls return `403 Forbidden`. Once a power has won, the button is disabled and reads "Game Over".

### 7. Historical Turn Log
- Reverse-chronological audit log detailing tactical outcomes of previous seasons.
