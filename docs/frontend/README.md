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
    ├── App.tsx                  # Root state container, viewMode router & API coordination
    ├── App.css                  # Tactical HUD styling, CRT brass themes, animations & modals
    ├── compact.css              # Phone layout, applied while the shell has data-layout="compact"
    ├── index.css                # Base reset & typography
    ├── components/
    │   ├── EuropeMap.tsx        # High-performance interactive SVG game board & order arrows
    │   ├── EuropeMap.test.tsx   # The unit menu in the DOM: each newly selected unit gets a fresh menu
    │   ├── map/                 # Decomposed SVG map sub-layers, hooks & utilities
    │   │   ├── hooks/
    │   │   │   ├── useMapCamera.ts        # Camera ref, frame-synced transform, wheel & button zoom, home camera, phone selection pan
    │   │   │   ├── useMapCamera.test.ts
    │   │   │   ├── useMapGestures.ts      # Pointer pan with a tap threshold, two-finger pinch
    │   │   │   ├── useMapGestures.test.ts
    │   │   │   ├── useMapInteraction.ts   # Click state machine: modes, support/convoy picks, coast choice, hover
    │   │   │   ├── useMapInteraction.test.ts # Every click path in all three phases (also covers useMapSelection)
    │   │   │   └── useMapSelection.ts     # The selected unit or build slot, who may command it, where it can go
    │   │   ├── layers/
    │   │   │   ├── StaticLayers.tsx       # Gradients, sea textures & pass-through background defs
    │   │   │   ├── ProvincePolygon.tsx    # Memoized individual SVG province polygons & boundaries
    │   │   │   ├── SupplyCentersLayer.tsx # Memoized supply center stars & markers
    │   │   │   └── MapNamesLayer.tsx      # Memoized typography & province label placements
    │   │   └── utils/
    │   │       └── curveGeometry.ts       # Quadratic Bezier control point math for order arrows
    │   ├── CollapsibleSection.tsx # Reusable collapsible/static section container with accessible toggles
    │   ├── CollapsibleSection.test.tsx # Vitest suite for CollapsibleSection behavior and accessibility
    │   ├── ToolsSidebar.tsx     # Left collapsible sidebar: legend, zoom options, powers, sandbox & admin (a ≡ drawer on phones)
    │   ├── MacroSidebar.tsx     # Right collapsible sidebar: core gameplay orders, builds, finalize & adjudicate (the order sheet on phones)
    │   ├── macro/               # Decomposed order sheet and unit management cards
    │   │   ├── UnitMacroCard.tsx # Unit order card: move, hold, support, convoy & retreat selectors
    │   │   └── BuildSlotCard.tsx # Winter adjustment build/disband quota cards
    │   ├── sidebars.test.ts     # Vitest suite for ToolsSidebar and MacroSidebar collapsible views
    │   ├── TurnHistorySelector.tsx # Left pane footer to pick a resolved turn, nation chips, and the phone's map pill
    │   ├── PhaseTimerWidget.tsx # Bottom-left map widget: turn clock, votes, ready-up & +5 button (a pill on phones)
    │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
    │   ├── lobby/               # Decomposed match browser and lobby dialogs
    │   │   ├── GameRoomCard.tsx              # Match listing card with power indicators and join buttons
    │   │   ├── CreateCampaignPanel.tsx       # Public/private campaign creation form
    │   │   ├── PasscodePromptModal.tsx       # Passcode entry dialog for private matches
    │   │   └── PrivateCampaignCreatedModal.tsx # Shareable credentials modal after creating private room
    │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
    │   ├── admin/               # Decomposed creator console tabs
    │   │   ├── TurnControlTab.tsx      # Timeline rollback and turn jump controls
    │   │   ├── UnitTeleportTab.tsx     # Move units instantly across provinces
    │   │   ├── UnitSpawnerTab.tsx      # Unit creation and disband tools
    │   │   └── TerritoryControlTab.tsx # Supply center ownership modifier
    │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
    │   ├── BottomSheet.tsx      # Phone pull-up panel with peek, half and full stops (holds the order sheet)
    │   ├── CompactTopBar.tsx    # Phone top bar: back, ≡ tools, turn, order-problem count and a ⋯ menu
    │   ├── CompactTopBar.test.ts # Vitest suite for the phone top bar and the surrender note
    │   ├── DisplaySettingsMenu.tsx # Top bar menu for this player's piece style and army and fleet marks
    │   ├── MapPiece.tsx         # Draws unit pieces, stars, rings and hit areas for every display style
    │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
    │   ├── SanityCheckModal.tsx # Pre-finalization tactical blunder warning dialogue
    │   ├── ConfirmModal.tsx     # In-app confirmation for destructive actions; Shift+click skips it
    │   ├── ConfirmModal.test.ts # Vitest suite for the confirmation and its Shift rule
    │   ├── useConfirm.test.tsx  # Asking, confirming, dismissing and Shift-skipping in the DOM
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
    │   └── useDisplayPrefs.test.ts # Device and account saving, failed reads and edits during a read
    ├── lib/
    │   └── supabase.ts          # Supabase client singleton & auth helpers
    ├── test/
    │   ├── setup.ts             # Runs before every test file: jest-dom matchers and Testing Library cleanup
    │   ├── mapDom.ts            # A map <svg> with an on-screen box and pointer capture, for map hook tests
    │   └── mapFixtures.ts       # France and its neighbours, units and orders for map tests
    ├── types/
    │   └── diplomacy.ts         # TypeScript definitions synchronized with backend/domain/*.py
    └── utils/
        ├── orderBuilders.ts     # Hold, move, retreat, support and convoy orders, built one way everywhere
        ├── orderBuilders.test.ts # Each order's exact fields and field order
        ├── orderHelpers.ts      # Reachability calculations, retreat targeting & symbolic formatters
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
        └── sheetHelpers.test.ts # Vitest suite for the sheet's snap math
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
├── View 2: Tactical Workspace (when viewMode === 'multiplayer' | 'sandbox')
│   ├── Imperial Header Bar (CompactTopBar.tsx on phones: back, ≡ tools, turn, problem count, ⋯ menu)
│   │   ├── Return to Lobby (Clickable Brand Emblem & Title)
│   │   ├── Turn Chronicle Pill (Season, Year, Phase & Winner)
│   │   ├── Sanity Check Diagnostics Warning Pill
│   │   ├── Real-Time WebSocket Synchronization Badge
│   │   └── User Auth Profile / Guest Mode
│   │
│   ├── ToolsSidebar.tsx (Left Collapsible Tools & Intel Panel; a ≡ drawer on phones)
│   │   ├── Collapse / Expand Rail Toggle (44px collapsed rail)
│   │   ├── Map View & Camera Controls (Zoom In, Zoom Out, Fit Map 105% - CollapsibleSection static)
│   │   ├── Tactical Map Legend (Move, Support, Convoy, Conflict vectors - CollapsibleSection toggle)
│   │   ├── Great Powers Standing & Command Selector (SC & Unit tallies - CollapsibleSection toggle)
│   │   ├── Hypothetical Mode (What-If Opponent Guesses) & Tactical General Staff AI
│   │   ├── Foreign Guesses Count & Discard Actions
│   │   ├── Creator Admin Console & Direct-Edit Override Trigger
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
├── Modals & Overlays
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
