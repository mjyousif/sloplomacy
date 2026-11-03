# Macro Sidebar & Controls (`MacroSidebar.tsx`)

The **Macro Sidebar** (`frontend/src/components/MacroSidebar.tsx`) sits alongside the map, providing a complete roster of all military units, order builders, diagnostic warnings, and turn progression controls.

---

## Layout Sections

### 1. Active Nation Header & Supply Center Tally
- Displays the currently commanded Great Power, national crest, and color bar.
- Shows total controlled Supply Centers and active unit count.
- Provides quick-switch buttons to view the board from other national perspectives.

### 2. Real-Time Diagnostics & Blunder Alert Strip
- Evaluates `issues` returned by the backend validator.
- Groups issues by severity (`error`, `warning`, `info`).
- Clicking an issue card zooms the map directly to the implicated provinces and selects the unit.

### 3. Unit Order Roster
Each unit owned by the active power is presented as an interactive card:
- **Unit Badge**: Army (`A`) or Fleet (`F`) icon + current province name.
- **Current Order Summary**: Formatted symbolic syntax (e.g. `A PAR ──► BUR`, `F LON HOLD`).
- **Interactive Action Buttons**:
  - `HOLD`: Immediately sets unit to hold.
  - `MOVE`: Expands destination dropdown listing all reachable provinces.
  - `SUPPORT`: Configures support target and auxiliary unit.
  - `CONVOY`: Configures sea transport bridge.
- **Status Indicator**: Shows whether an order is explicit (manually entered) or implicit (default hold).

### 4. Batch Operations & Automation Tools
- **"Confirm All Holds"**: Marks all unassigned units as explicitly holding, clearing `UNASSIGNED_UNIT` warnings before finalization.
- **"Clear Foreign Pre-Moves"** (Sandbox Mode): Instantly wipes hypothetical moves assigned to rival nations.

### 5. Turn Simulation & Resolution Preview
- **"Simulate Turn" (`POST /api/simulate`)**: Runs non-destructive adjudication. Projects battle clashes, cut supports, and successful maneuvers directly onto the map.
- **"Clear Simulation Overlay"**: Hides the simulation preview to resume order drafting.

### 6. Turn Finalization & Adjudication
- **"Finalize Orders" (`POST /api/finalize`)**: Initiates pre-finalization checks. If warnings exist, opens `SanityCheckModal.tsx`.
- **"Adjudicate Turn & Advance" (`POST /api/adjudicate`)**: Commits all finalized moves, updates the board, advances the season (Spring -> Fall -> Spring next year), and updates supply center ownership.

### 7. Historical Turn Log
- Reverse-chronological audit log detailing tactical outcomes of previous seasons.
