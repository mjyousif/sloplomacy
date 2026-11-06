# Dual Collapsible Sidebars & Tactical Controls

The tactical workspace divides user controls into two specialized, independently collapsible sidebars flanking the interactive European map:

1. **Left Sidebar (`ToolsSidebar.tsx`)**: Dedicated to general tools, cartographic legend, map camera & zoom options, Great Powers standing, Pre-Move Sandbox testing, and creator admin tools.
2. **Right Sidebar (`MacroSidebar.tsx`)**: Dedicated strictly to core gameplay: active sovereign command, phase instructions, unit order drafting, home builds, and turn finalization/adjudication.

Both sidebars feature smooth, 44px collapsed rail views with quick tool icons and status badges, maximizing map screen estate while keeping all critical functions accessible.

---

## Left Sidebar: Chancellery Tools & Intel (`ToolsSidebar.tsx`)

### 1. Map View & Camera Controls
- **Zoom In (`+`) & Zoom Out (`-`)**: Stepped zooming across the SVG canvas.
- **Current Zoom Readout**: Real-time percentage indicator (e.g., `105%`).
- **Fit Map / Reset Camera**: Instantly realigns camera to the default center framing at 105% zoom.

### 2. Tactical Map Cartographic Legend
- Displays symbolic explanations for all map vector overlays:
  - **Move / Attack Vector**: Blue curved arrow indicating unit repositioning.
  - **Support Link**: Teal dashed line with target reticle indicating defensive or offensive support.
  - **Fleet Convoy**: Purple wavy line representing naval troop transport.
  - **Tactical Warning / Dislodgement**: Red/amber alert indicating illegal orders, cut supports, or retreats.
- Reference notes for bicoastal provinces (`STP`, `SPA`, `BUL`) and impassable terrain (`SWI`).

### 3. Great Powers Diplomatic Standing & Command Selector
- Lists all 7 Great Powers (Austria, England, France, Germany, Italy, Russia, Turkey) with their heraldic crests, national colors, controlled Supply Centers, and active field units.
- **Sandbox Mode**: Clicking any power immediately switches active command to that nation for hypothetical experimentation.
- **Multiplayer Mode**: Displays diplomatic status (Orders Finalized, Drafting, or Civil Disorder).

### 4. War Room & Pre-Move Sandbox Tools
- **"Enter Pre-Move Sandbox" / "Exit Sandbox"**: Toggles isolated hypothetical planning. In sandbox mode, foreign moves can be freely drafted; exiting wipes foreign moves and restores the authoritative state. In a multiplayer match the sandbox is a private copy: other players cannot see it, it does not show their real orders, and Finalize, Resolve, Surrender and the Admin Console wait until you exit.
- **Tactical General Staff AI**:
  - **"Plan Opponents"**: Generates DATC-compliant, heuristic moves for all 6 other nations.
  - **"Plan All 7 Powers"**: Auto-generates orders for every nation across Europe.
  - **"AI Step Turn"**: Auto-plans foreign powers and steps the game clock directly to the next phase with full adjudication.
- **Foreign Pre-Moves Counter & Clear**: Displays count of drafted foreign guesses with a one-click "Clear" button.
- **Scenario Management**: One-click "Reset 1901" scenario start and "Save Sandbox" to player account.

### 5. Creator Administrator Controls (Game Creator Only)
- Visible exclusively to room creators.
- **"Open Admin Console"**: Launches `AdminToolsModal.tsx` for timeline rollbacks, unit teleportation, and arbitrary unit spawning/destruction.
- **"Direct-Edit Board Override"**: Toggles on-the-fly administrator direct board manipulation.

---

## Right Sidebar: Tactical Command & Orders (`MacroSidebar.tsx`)

### 1. Active Sovereign Command Header & Telemetry
- Displays active nation crest, name, controlled Supply Centers, and active/dislodged unit counts.
- Real-time status badge: `Drafting Orders`, `Finalized`, `Civil Disorder`, or `X Issues`.
- Top-right collapse button for quick toggling into a compact 44px rail.

### 2. Phase-Aware Instructions & Quotas
- **Winter Adjustments**: Summarizes build allowances (`+X` home builds allowed, `Y/X` assigned) or disband requirements (`-X` units required to disband).
- **Retreats**: Prompts commanders on dislodged units requiring retreat destinations or disband orders.

### 3. Quick Action Toolbar
- **"Confirm All (X/Y)"**: Marks all unassigned units as explicitly holding, clearing `UNASSIGNED_UNIT` warnings.
- **"Surrender & Leave"** (Multiplayer): Accessible button to surrender sovereign command and place units in Civil Disorder.

### 4. Macro Force Orders Roster

#### A. Home Supply Center Builds (Winter Adjustments)
- Displays vacant home supply centers for surplus powers.
- Inline controls to toggle `+ Army`, `+ Fleet` (with coastal options for split coasts), or `Waive`.

#### B. Active Field Units & Dislodged Units
- **Unit Badge**: Army (`A`) or Fleet (`F`) with national color.
- **Province Code & Title**: Name and code (with coastal notation, e.g. `STP/SC`).
- **Behavior Visualizer**: Symbolic action summary (e.g. `MOVE -> BUR`, `HOLD Defending Paris`).
- **Order Mode Tabs**: `HOLD`, `MOVE`, `SUPPORT`, `CONVOY`, `RETREAT`, `DISBAND`.
- **Target & Auxiliary Selectors**: Clean, contextual dropdown menus populated strictly with valid reachable provinces and convoy routes.
- **Real-Time Diagnostics**: Inline error/warning alerts explaining DATC violations.
- **Simulation Preview Results**: Instant visual feedback on simulated advances, bounces, or cut supports.

### 5. Sticky Action Footer & Consensus Resolution
- **"Finalize Orders" (`POST /api/finalize`)**: Submits orders. Opens `SanityCheckModal.tsx` if warnings or unconfirmed moves exist.
- **Consensus Auto-Adjudication (Multiplayer)**: In multiplayer matches, turns advance automatically once all required active powers finalize their orders. Non-creator players see a real-time consensus status card rather than a manual button. Connected clients poll state in the background to seamlessly receive phase transitions:
  - **Waiting Lobby Mode (< 2 Players)**: Multiplayer matches require a minimum of 2 players to auto-resolve turns. When a single player prepares and finalizes their orders, the status card clearly indicates `"Orders Locked • Waiting for Players (1/2 min)"` and explains that automatic resolution begins once opponents join.
  - **Active Match Mode (>= 2 Players)**: Displays `"Resolution Progress: X/Y Ready"` and `"Waiting on: [Powers]"`, transitioning to `"Consensus Reached (Y/Y)"` when all required powers finalize.
- **"Adjudicate Turn & Advance" (`POST /api/adjudicate`)**:
  - In Solo / Sandbox Mode: Commits moves and advances the season/phase.
  - In Multiplayer Mode: Restricted to the **Game Creator**. When testing solo in a waiting lobby (< 2 players), the host button explicitly displays `"Advance Phase Solo (Host Override)"` to advance turns without waiting for opponents. In active matches, it acts as `"Force Adjudicate Phase (Host Override)"` to bypass stalled or AFK players. Unauthorized non-creator calls return `403 Forbidden`. Once a power has won, the button is disabled and reads "Game Over".

---

## Collapsible Sidebar Rails

When either sidebar is collapsed:
- **Left Tools Rail (44px)**: Houses collapse toggle, mini Zoom In / Out / Fit buttons, Sandbox active glow indicator, and Admin icon.
- **Right Tactical Rail (44px)**: Houses collapse toggle, active nation crest, unconfirmed orders counter pill (or green checkmark when complete), and warning badge.
- **Header Toggle Pills**: Quick pill buttons in the top bar ("Tools Sidebar", "Tactical Sidebar") let users toggle either panel from anywhere.
### 7. Version Revision Badge (`VersionBadge.tsx`)
- Sits at the sticky footer bottom of the sidebar.
- Displays the current build revision short SHA (`rev <sha>`) with one-click clipboard copy and direct link to the commit on GitHub.

### 8. Historical Turn Log
- Reverse-chronological audit log detailing tactical outcomes of previous seasons.
