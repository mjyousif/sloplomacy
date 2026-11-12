# Frontend Architecture (React 19 + TypeScript + Vite)

The frontend application is located in `frontend/`. It is built with **React 19**, **TypeScript**, and **Vite**, using **Lucide React** for tactical iconography, **Supabase** for player authentication, and pure SVG vector mathematics for the interactive European atlas.

---

## Directory Structure

```
frontend/
├── index.html                   # HTML entry point with viewport & typography imports
├── package.json                 # Dependencies (React 19, Lucide, Supabase, Vitest, Testing Library)
├── vite.config.ts               # Vite bundler config with /api -> :8000 proxy, and the Vitest setup
├── tsconfig.json                # TypeScript compiler configuration
└── src/
    ├── main.tsx                 # React DOM bootstrapping
    ├── App.tsx                  # Root state container and viewMode router: calls the state hooks, renders the pieces below
    ├── index.css                # Base reset & typography
    ├── styles/                  # Every stylesheet; the import order in index.ts is the cascade
    │   ├── index.ts             # The one place the files below are imported (App.tsx imports it once)
    │   ├── app/                 # The wide layout: 20 consecutive slices of the former App.css, 01-header.css … 20-display-confirm.css
    │   └── compact/             # The phone layout, applied while the shell has data-layout="compact": 1-shell.css, 2-modals.css, 3-top-bar.css, 4-lobby.css, 5-game-screen.css, 6-touch-map.css
    ├── components/
    │   ├── EuropeMap.tsx        # High-performance interactive SVG game board & order arrows
    │   ├── EuropeMap.test.tsx   # The unit menu in the DOM: each newly selected unit gets a fresh menu
    │   ├── map/                 # Decomposed SVG map sub-layers, hooks & utilities
    │   │   ├── hooks/                     # Each with a co-located test
    │   │   │   ├── useEuropeMap.ts        # The map's view model: every hook below wired together for EuropeMap
    │   │   │   ├── usePieceGeometry.ts    # Unit indexes, piece points per style, describePiece, own-units centre
    │   │   │   ├── useBuildHomes.ts       # The winter build slots drawn, live or on a past turn
    │   │   │   ├── useTouchHitRadius.ts   # A phone's finger-sized tap targets, short of each neighbour
    │   │   │   ├── useMapCamera.ts        # Camera ref, frame-synced transform, wheel & button zoom, home camera, phone selection pan
    │   │   │   ├── useMapCamera.test.ts
    │   │   │   ├── useMapGestures.ts      # Pointer pan with a tap threshold, two-finger pinch
    │   │   │   ├── useMapGestures.test.ts
    │   │   │   ├── useMapInteraction.ts   # Click state machine: modes, support/convoy picks, coast choice, hover
    │   │   │   ├── useMapInteraction.test.ts # Every click path in all three phases (also covers useMapSelection)
    │   │   │   ├── mapReachabilityHelpers.ts # Pure click-eligibility predicates over UnitMoveOptions
    │   │   │   ├── useMapSelection.ts     # The selected unit or build slot, who may command it, where it can go
    │   │   │   ├── useOrderOverlay.ts     # Whose orders are drawn, issues by unit and province, support counts, move midpoints
    │   │   │   ├── useOrderOverlay.test.ts
    │   │   │   ├── useUnitMenuPlacement.ts # Floating menu position and drag, the phone's docked bar
    │   │   │   └── useUnitMenuPlacement.test.ts
    │   │   ├── hud/                       # The menus over the map, each with a co-located test
    │   │   │   ├── UnitMenu.tsx           # Move/Hold/Support/Convoy, Retreat/Disband or Keep/Disband, and the step hint
    │   │   │   ├── BuildMenu.tsx          # Army, fleet per coast, or waive for a winter build slot
    │   │   │   ├── CoastPicker.tsx        # Which coast of a split-coast province
    │   │   │   ├── SimulationBanner.tsx   # The Hypothetical Mode strip over the map
    │   │   │   └── MapZoomControls.tsx    # A phone's zoom buttons on the map
    │   │   ├── layers/
    │   │   │   ├── ProvincesLayer.tsx     # Every province polygon, lit where the selected unit can go (with its test)
    │   │   │   ├── targetHighlight.ts     # Green (direct/active) and ocean-blue (potential/chained) target sets + reticles
    │   │   │   ├── OrderArrowsLayer.tsx   # Every drawn order: convoys under supports under moves (with its test)
    │   │   │   ├── BuildTokensLayer.tsx   # A winter's build slots (with its test)
    │   │   │   ├── UnitsLayer.tsx         # Every unit, each drawn by units/UnitToken.tsx, with the shared unitLayerContext.ts (with its test)
    │   │   │   ├── orders/                # ConvoyChain, SupportVector, MoveArrow and their shared context type (orderLayerContext.ts)
    │   │   │   ├── ArrowMarkerDefs.tsx    # The arrowheads in the SVG defs
    │   │   │   ├── StaticLayers.tsx       # Gradients, sea textures & pass-through background defs
    │   │   │   ├── ProvincePolygon.tsx    # Memoized individual SVG province polygons & boundaries
    │   │   │   ├── SupplyCentersLayer.tsx # Memoized supply center stars & markers
    │   │   │   └── MapNamesLayer.tsx      # Memoized typography & province label placements
    │   │   └── utils/
    │   │       └── curveGeometry.ts       # Quadratic Bezier control point math for order arrows
    │   ├── CollapsibleSection.tsx # Reusable collapsible/static section container with accessible toggles
    │   ├── CollapsibleSection.test.tsx # Vitest suite for CollapsibleSection behavior and accessibility
    │   ├── ToolsSidebar.tsx     # Left collapsible sidebar: header, the sections below, history footer (a ≡ drawer on phones)
    │   ├── ToolsSidebar.test.tsx # Panel and drawer: section order, collapse, Escape, backdrop, focus, admin gate
    │   ├── tools/               # The sidebar's parts, each with a co-located test
    │   │   ├── toolsSidebarProps.ts      # ToolsSidebarProps; sections take a Pick<> of it
    │   │   ├── CollapsedRail.tsx         # The 44px rail the desktop panel folds into
    │   │   ├── MapControlsSection.tsx    # Zoom readout, Zoom In/Out and Fit Map (panel only)
    │   │   ├── MapLegendSection.tsx      # The four order marks
    │   │   ├── StandingsSection.tsx      # Power cards, ranks, status tags and the sort toggle
    │   │   ├── useStandingsSort.ts       # Supply Centre and unit tallies, ranking and the remembered sort mode
    │   │   ├── SandboxToolsSection.tsx   # Hypothetical Mode, General Staff AI, foreign moves, reset and save
    │   │   └── AdminSection.tsx          # Open Admin Console and the Direct-Edit override
    │   ├── MacroSidebar.tsx     # Right collapsible sidebar: core gameplay orders, builds, finalize & adjudicate (the order sheet on phones)
    │   ├── MacroSidebar.test.tsx # Panel, collapsed rail and phone sheet: layout, handlers, history lock, one <aside> across collapse
    │   ├── macro/               # Decomposed order sheet and unit management cards
    │   │   ├── PowerHeader.tsx  # StatusBadge, PhaseContext, HistoryLockBar and the power header row (panel banner top or sheet status row)
    │   │   ├── UnitOrderList.tsx # The home build slots in winter and a card per unit; owns the order-type change handler
    │   │   ├── UnitMacroCard.tsx # Unit order card shell, badges, diagnostics & simulation strip
    │   │   ├── OrderTypeTabs.tsx # The row of order-type buttons: Retreat/Disband, Keep/Disband, or Hold/Move/Support/Convoy
    │   │   ├── OrderParameterControls.tsx # Picks the control for the order's type (retreat phase shows only the retreat select)
    │   │   ├── controls/        # RetreatControls, MoveControls (with via-convoy), SupportControls and ConvoyControls, each with its test
    │   │   ├── OrderFooter.tsx  # Confirm All and Surrender buttons, and Finalize/Unlock plus Resolve or the consensus card
    │   │   ├── CollapsedRail.tsx # The contents of the 44px rail (the <aside> stays in MacroSidebar so its width transition plays)
    │   │   ├── useSheetSelection.ts # Phone sheet: highlight the selected unit's provinces, scroll its card up when the sheet is raised
    │   │   ├── BuildSlotCard.tsx # Winter adjustment build/disband quota cards
    │   │   └── *.test.tsx       # Tests beside each piece (BuildSlotCard has none yet)
    │   ├── sidebars.test.ts     # Vitest suite for ToolsSidebar and MacroSidebar collapsible views
    │   ├── TurnHistorySelector.tsx # Left pane footer to pick a resolved turn, nation chips, and the phone's map pill
    │   ├── PhaseTimerWidget.tsx # Bottom-left map widget: turn clock, votes, ready-up & +5 button (a pill on phones)
    │   ├── LobbyView.tsx        # The lobby: form state, create / join / seat-claim handlers and the dialogs; arranges the sections below
    │   ├── LobbyView.test.tsx   # Layout, seat claims, the passcode box, hosting, joining by code and copy
    │   ├── lobby/               # Decomposed match browser and lobby dialogs
    │   │   ├── LobbyHero.tsx                 # Top banner: Solo Sandbox button, sign-in button and the two mode cards
    │   │   ├── MyGamesSection.tsx            # The player's own campaigns and saved sandboxes, with Resume and Leave
    │   │   ├── OpenLobbiesSection.tsx        # Open multiplayer lobbies and Refresh, one GameRoomCard each
    │   │   ├── GameRoomCard.tsx              # Match listing card with power indicators and join buttons
    │   │   ├── CreateCampaignPanel.tsx       # Host New Multiplayer Game card (public/private, passcode, country)
    │   │   ├── JoinWithCodeCard.tsx          # Join Private Campaign card (Game ID, passcode, country)
    │   │   ├── PowerPicker.tsx               # The seven-flag country picker both cards share
    │   │   ├── PasscodePromptModal.tsx       # Passcode entry dialog for private matches
    │   │   ├── PrivateCampaignCreatedModal.tsx # Shareable credentials modal after creating private room
    │   │   └── *.test.tsx, lobby.testkit.ts    # Each section's rendering and callbacks, with shared game fixtures
    │   ├── AdminToolsModal.tsx  # The creator console: header, status strip, tab bar; wires `useAdminActions` into the tabs
    │   ├── AdminToolsModal.test.tsx # Tabs, closing, and each tab's action through to its request
    │   ├── admin/               # Decomposed creator console tabs
    │   │   ├── useAdminActions.ts      # The console's form state, status and error banners, effects and one handler per admin endpoint
    │   │   ├── useAdminActions.test.tsx, .failures.test.tsx, .testkit.ts # Each request, its toast, and every failure path
    │   │   ├── TurnControlTab.tsx      # Timeline rollback and turn jump controls
    │   │   ├── UnitTeleportTab.tsx     # Move units instantly across provinces
    │   │   ├── UnitSpawnerTab.tsx      # Unit creation and disband tools
    │   │   └── TerritoryControlTab.tsx # Supply center ownership modifier
    │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
    │   ├── BottomSheet.tsx      # Phone pull-up panel with peek, half and full stops (holds the order sheet)
    │   ├── CompactTopBar.tsx    # Phone top bar: back, ≡ tools, turn, order-problem count and a ⋯ menu
    │   ├── CompactTopBar.test.ts # Vitest suite for the phone top bar and the surrender note
    │   ├── TopHeader.tsx        # Desktop top bar: brand, Solo Sandbox, turn, order check, Live Sync, display settings, account
    │   ├── TopHeader.test.tsx   # Each part of the desktop top bar and the buttons it hands back to App
    │   ├── AppHeader.tsx        # Above the board: TopHeader or CompactTopBar, the Direct-Edit banner and the toast
    │   ├── AppHeader.test.tsx   # Which bar shows, the problem counts, the banner's buttons and the toast
    │   ├── GameWorkspace.tsx    # The game screen: ToolsSidebar, EuropeMap with the clock and history pill, MacroSidebar
    │   ├── GameWorkspace.test.tsx # Phone and desktop variants, a past turn drawn read-only, the clock, zoom and rail wiring
    │   ├── AppModals.tsx        # Sanity Check, Surrender & Leave, Save Sandbox, admin console, sign-in and confirm
    │   ├── AppModals.test.tsx   # Each modal's wiring, the saved sandbox's default name, admin only for the host
    │   ├── DisplaySettingsMenu.tsx # Top bar menu for this player's piece style and army and fleet marks
    │   ├── MapPiece.tsx         # Draws a unit piece for every display style; the one import path, re-exports the pieces/ helpers
    │   ├── MapPiece.test.tsx    # Every style x mark x unit type x variant, flags, plates and the seated star
    │   ├── pieces/              # What a map piece is made of
    │   │   ├── pieceFrame.ts    # PieceFrame and PiecePill: ring sizes, badge offsets, banners, arrow scales (with its test)
    │   │   ├── PieceOutlines.tsx # PieceOutline, PieceHoldOutline and PieceHitArea (with its test)
    │   │   ├── marks.tsx        # The letter, icon, vehicle and NATO marks and the SupplyStar (with its test)
    │   │   └── styles/          # One body per family: DiscPiece (classic, seated, compact), FlagPiece, PillPiece (nameplate)
    │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
    │   ├── SanityCheckModal.tsx # Pre-finalization tactical blunder warning dialogue
    │   ├── ConfirmModal.tsx     # In-app confirmation for destructive actions; Shift+click skips it
    │   ├── ConfirmModal.test.ts # Vitest suite for the confirmation and its Shift rule
    │   ├── useConfirm.test.tsx  # Asking, confirming, dismissing and Shift-skipping in the DOM
    │   ├── SaveSandboxModal.tsx # Accessible modal to name and save/promote a personal draft sandbox
    │   ├── SaveSandboxModal.test.tsx # Vitest suite for SaveSandboxModal input, submission, and keyboard handling
    │   ├── PowerFlag.tsx        # Vector SVG historical World War I (1901-1918) flags for all 7 Great Powers
    │   ├── PowerFlag.test.tsx   # Vitest suite for historical flag rendering and accessibility
    │   └── VersionBadge.tsx     # Git commit short SHA indicator, clipboard copy & GitHub commit link
    ├── data/
    │   ├── europeMapGeometry.ts # Authentic SVG vector paths, province centers & defs
    │   ├── europeMapGeometry.test.ts # Vitest suite for map label typography
    │   ├── mapLayouts.ts        # Unit, star and name placements for each piece style
    │   ├── mapLayouts.test.ts   # Checks every placement against the province outlines
    │   └── mapTextMetrics.ts    # Libre Baskerville widths for sizing names without the DOM
    ├── hooks/
    │   ├── useDiplomacyWebSocket.ts # Live Sync socket: heartbeat, reconnect rules & clock refresh
    │   ├── useDiplomacyWebSocket.test.ts # Vitest suite for socket URLs and reconnect rules
    │   ├── useDiplomacyWebSocket.connection.test.ts # One socket per player: reconnects on sign-in and sign-out
    │   ├── useTurnHistory.ts    # Turn selector state: resolved phases, the one on show, its record and the nation chip
    │   ├── useTurnHistory.test.ts # Loading, stepping, caching and keeping the viewed turn across refetches
    │   ├── useCompactLayout.ts  # The phone breakpoint (COMPACT_LAYOUT_QUERY) as a live boolean
    │   ├── useCompactLayout.test.ts # Follows the media query, including older Safari listeners
    │   ├── useDisplayPrefs.ts   # This player's display choice, saved on the device and account
    │   ├── useDisplayPrefs.test.ts # Device and account saving, failed reads and edits during a read
    │   ├── useGameSession.ts    # The open game, its summary and seat, the board and the lobby list, and the loads that fill them
    │   ├── useGameSession.test.ts # Seat, board loads, stale replies, the forgotten solo sandbox, errors and the lobby list
    │   ├── useGameSync.ts       # The live socket and its handlers, the first load and the fallback poll
    │   ├── useGameSync.test.ts  # Game and lobby updates, the phase toast, the first load, and when and what the poll fetches
    │   ├── useSandboxSession.ts # Hypothetical Mode and its private copy, the tactical AI, the scenario reset and saving a sandbox
    │   ├── useSandboxSession.test.ts # Entering and leaving in a match and a solo sandbox, the copy's clock, AI, reset and save
    │   ├── useSandboxExit.ts    # Closes a match's private sandbox copy when the player leaves the match board
    │   ├── useSandboxExit.test.ts # When it closes the copy, what it sends, and that a failed close is ignored
    │   ├── useMatchActions.ts   # Orders, confirm-all, finalize with the Sanity Check modal, unlock, resolve and the clock buttons
    │   ├── useMatchActions.test.tsx # Foreign-order guard, finalize problems, double-click resolve, clock behind a private copy
    │   ├── useSeatActions.ts    # Solo Sandbox, create, join, surrender (with its modal), leave and picking a sandbox power
    │   ├── useSeatActions.test.ts # Solo Sandbox, creating and joining: sign-in prompts, bodies, passcodes, refusals
    │   ├── useSeatActions.surrender.test.ts # The Surrender & Leave modal, surrendering, leaving and picking a sandbox power
    │   ├── useSeatActions.testkit.ts # Options, replies and the signed-in player both seat test files share
    │   ├── useAuthSession.ts    # The signed-in user (loaded on mount, then followed) and the sign-in modal
    │   ├── useAuthSession.test.ts # Initial load, sign-in and sign-out, unsubscribe, and the modal's reason and tab
    │   ├── useWorkspaceLayout.ts # Desktop rails, phone order sheet and tools drawer, reset on a new game, view or layout
    │   ├── useWorkspaceLayout.test.ts # Rails, docked-bar peek, drawer focus return and each reset trigger
    │   ├── useToast.ts          # The toast banner and triggerToast
    │   └── useToast.test.ts     # Expiry, and a newer message outliving the older one's timer
    ├── lib/
    │   └── supabase.ts          # Supabase client singleton & auth helpers
    ├── test/
    │   ├── setup.ts             # Runs before every test file: jest-dom matchers and Testing Library cleanup
    │   ├── mapDom.ts            # A map <svg> with an on-screen box and pointer capture, for map hook tests
    │   ├── mapFixtures.ts       # France and its neighbours, units and orders for map tests
    │   └── macroFixtures.ts     # The same board plus a Channel fleet, issues, participants and an OrderProgress, for the order panel's tests
    ├── types/
    │   └── diplomacy.ts         # TypeScript definitions synchronized with backend/domain/*.py
    └── utils/
        ├── orderBuilders.ts     # Hold, move, retreat, support, convoy, disband, build and waive orders, built one way everywhere
        ├── orderBuilders.test.ts # Each order's exact fields and field order
        ├── orderHelpers.ts      # Reachability calculations, retreat targeting & symbolic formatters
        ├── orderProgress.ts     # Which powers a match waits on, and a power's build, disband and confirmed counts (OrderProgress)
        ├── orderProgress.test.ts # Required powers per phase, supply center counts, winter counts and confirmed orders
        ├── orderHelpers.test.ts # Vitest suite for order parsing and valid destinations
        ├── adminHelpers.ts      # Admin permission verification & payload formatters
        ├── adminHelpers.test.ts # Vitest suite for admin authorization and mutations
        ├── displayPrefs.ts      # Display preference types, defaults, sanitizing & sign-in rules
        ├── displayPrefs.test.ts # Vitest suite for display preferences
        ├── historyHelpers.ts    # Turn selector stepping, short labels and past build orders
        ├── historyHelpers.test.ts # Vitest suite for the turn selector helpers
        ├── powerHelpers.ts      # Great Power ranking (SC descending, unit tiebreaker, tied rank sharing)
        ├── powerHelpers.test.ts # Vitest suite for diplomatic standing ranking
        ├── sheetHelpers.ts      # Phone order sheet stops: snap heights, release and tap stepping
        ├── sheetHelpers.test.ts # Vitest suite for the sheet's snap math
        ├── campaignName.ts      # Default campaign names ("<Player>'s <Adjective> Campaign") for a host who leaves the name blank
        ├── campaignName.test.ts # Vitest suite for the generated names
        ├── mapCameraHelpers.ts  # The map camera's state, bounds, clamping and map-size constants
        ├── mapCameraHelpers.test.ts # Vitest suite for camera clamping and zoom maths
        ├── timerHelpers.ts      # Turn clock labels, clock formatting and who has yet to vote
        ├── timerHelpers.test.ts # Vitest suite for the clock helpers
        ├── soloSandboxStorage.ts # The draft solo sandbox id this browser remembers (localStorage)
        └── soloSandboxStorage.test.ts # Only solo_ ids are kept, and blocked storage never throws
```

---

## Component Tree

```
App.tsx (Root View Container: 'lobby' | 'multiplayer' | 'sandbox')
│
├── View 1: LobbyView.tsx (when viewMode === 'lobby')
│   ├── Match List & Lobbies Browser (with Private badge and empty state)
│   ├── Host Game Form (Public vs Private with Passcode protection)
│   ├── Join Private Campaign Form (by Game ID & Passcode)
│   ├── Private Campaign Credentials Modal (Copy Game ID & Passcode)
│   ├── Private Lobby Passcode Modal Prompt
│   ├── Seat Claim Controls (7 Great Powers)
│   ├── Active & Saved Sandboxes Roster
│   └── User Auth Header & Profile Switcher
│
├── View 2: GameWorkspace.tsx (when viewMode === 'multiplayer' | 'sandbox')
│   ├── Imperial Header Bar (AppHeader.tsx, on every view: TopHeader.tsx; CompactTopBar.tsx on phones: back, ≡ tools, turn, problem count, ⋯ menu; then the Direct-Edit banner and the toast)
│   │   ├── Return to Lobby (Clickable Brand Emblem & Title)
│   │   ├── Turn Chronicle Pill (Season, Year, Phase & Winner)
│   │   ├── Sanity Check Diagnostics Warning Pill
│   │   ├── Real-Time WebSocket Synchronization Badge
│   │   └── User Auth Profile / Guest Mode
│   │
│   ├── ToolsSidebar.tsx (Left Collapsible Tools & Intel Panel; a ≡ drawer on phones; its parts are in tools/)
│   │   ├── Collapse / Expand Rail Toggle (CollapsedRail.tsx, the 44px collapsed rail)
│   │   ├── Map View & Camera Controls (MapControlsSection.tsx; Zoom In, Zoom Out, Fit Map 105% - CollapsibleSection static)
│   │   ├── Tactical Map Legend (Move, Support, Convoy, Conflict vectors - CollapsibleSection toggle)
│   │   ├── Great Powers Standing & Command Selector (SC & Unit tallies - CollapsibleSection toggle)
│   │   ├── Hypothetical Mode (What-If Opponent Guesses) & Tactical AI (CollapsibleSection toggle)
│   │   ├── Foreign Guesses Count & Discard Actions
│   │   ├── Creator Admin Console & Direct-Edit Override Trigger (CollapsibleSection toggle)
│   │   └── Turn History footer (TurnHistorySelector.tsx: ‹ turn › Live, nation chips)
│   │
│   ├── EuropeMap.tsx (Center Interactive SVG Board)
│   │   ├── Authentic Cartographic Background Layer
│   │   ├── Province Fill & Ownership Borders
│   │   ├── Province Names Fitted to the Active Piece Style
│   │   ├── Supply Center Markers
│   │   ├── Unit Pieces (MapPiece, in the player's chosen style and mark)
│   │   ├── Dislodged Unit Retreat Badges
│   │   ├── Dynamic SVG Order Vectors & Bezier Arrows
│   │   ├── Combat Clashes, Bounces & Cut Indicators
│   │   ├── Past Turns (`historyView`): every nation's orders with their outcomes, read-only
│   │   ├── Interactive Unit Radial Menu & Coast Picker
│   │   └── Imperative Camera Control Handle (`EuropeMapHandle`)
│   │
│   └── MacroSidebar.tsx (Right Collapsible Tactical Command Panel; the pull-up order sheet on phones)
│       ├── Collapse / Expand Rail Toggle (44px collapsed rail)
│       ├── Active Sovereign Command Header & Supply Center Telemetry
│       ├── Phase Context Alerts (Winter Adjustments Quota, Retreats Dislodgements)
│       ├── Quick Command Actions ("Confirm All", "Surrender & Leave")
│       ├── Home Supply Center Builds (Army / Fleet / Waive)
│       ├── Unit Order Cards (Hold, Move, Support, Convoy, Retreat, Disband)
│       ├── Inline Validation Diagnostics & Combat Simulation Badges
│       ├── Sticky Footer: Order Finalization & Phase Adjudication Actions
│       └── Past-turn bar ("Viewing … · Back to live"), with everything below it dimmed and inert
│
├── Modals & Overlays (AppModals.tsx renders the dialogues, on every view)
│   ├── DisplaySettingsMenu.tsx (Top bar popover for piece style and marks)
│   ├── AuthModal.tsx (Supabase login/signup & local dev auth toggle)
│   ├── AdminToolsModal.tsx (Creator unit teleport, spawn, destroy, turn jump, rollback)
│   ├── SurrenderModal.tsx (Civil Disorder concession dialogue)
│   ├── SanityCheckModal.tsx (Tactical Blunder Gatekeeper before order finalization)
│   └── PhaseTimerWidget.tsx (Turn clock over the bottom left of the map, via EuropeMap's overlay prop)
```

---

## Vite Proxy Setup

The frontend dev server (port `5173`) proxies requests under `/api` to the FastAPI backend (port `8000`), avoiding cross-origin issues during local development:

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
```

---

## Building and Verification

### Development Server
```bash
cd frontend
npm run dev
```

### Type Checking & Production Build
```bash
npm run build
```
This triggers `tsc && vite build`, ensuring zero TypeScript type discrepancies with backend models before bundle generation.

### Unit Testing (Vitest)
```bash
npm test
```
Runs every `src/**/*.test.ts[x]` file. Tests sit next to the code they cover and come in two kinds:

- **Pure logic and static markup** run in node. Helpers in `utils/` and `data/` are called directly, and a few components are checked with `renderToString`.
- **Hooks and interaction** run in [jsdom](https://github.com/jsdom/jsdom). The file opts in with `// @vitest-environment jsdom` as its first line, then uses [Testing Library](https://testing-library.com/): `renderHook` for hooks, `render` and `screen` for components, and `@testing-library/user-event` for clicks and typing. `src/test/setup.ts` adds the `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toHaveFocus` and so on) and unmounts after each test, because Vitest's globals are off and Testing Library can't register that itself.
