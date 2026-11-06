# Frontend Architecture (React 19 + TypeScript + Vite)

The frontend application is located in `frontend/`. It is built with **React 19**, **TypeScript**, and **Vite**, using **Lucide React** for tactical iconography, **Supabase** for player authentication, and pure SVG vector mathematics for the interactive European atlas.

---

## Directory Structure

```
frontend/
├── index.html                   # HTML entry point with viewport & typography imports
├── package.json                 # Dependencies (React 19, Lucide, Supabase, Vitest)
├── vite.config.ts               # Vite bundler config with /api -> :8000 proxy
├── tsconfig.json                # TypeScript compiler configuration
└── src/
    ├── main.tsx                 # React DOM bootstrapping
    ├── App.tsx                  # Root state container, viewMode router & API coordination
    ├── App.css                  # Tactical HUD styling, CRT brass themes, animations & modals
    ├── index.css                # Base reset & typography
    ├── components/
    │   ├── EuropeMap.tsx        # High-performance interactive SVG game board & order arrows
    │   ├── ToolsSidebar.tsx     # Left collapsible sidebar: legend, zoom options, powers, sandbox & admin
    │   ├── MacroSidebar.tsx     # Right collapsible sidebar: core gameplay orders, builds, finalize & adjudicate
    │   ├── sidebars.test.ts     # Vitest suite for ToolsSidebar and MacroSidebar collapsible views
    │   ├── PhaseTimerWidget.tsx # Bottom-left map widget: turn clock, votes, ready-up & +5 button
    │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
    │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
    │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
    │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
    │   ├── SanityCheckModal.tsx # Pre-finalization tactical blunder warning dialogue
│   └── VersionBadge.tsx     # Git commit short SHA indicator, clipboard copy & GitHub commit link
    ├── data/
    │   ├── europeMapGeometry.ts # Authentic SVG vector paths, province centers & defs
    │   └── europeMapGeometry.test.ts # Vitest suite for map label typography
    ├── lib/
    │   └── supabase.ts          # Supabase client singleton & auth helpers
    ├── types/
    │   └── diplomacy.ts         # TypeScript definitions synchronized with backend models.py
    └── utils/
        ├── orderHelpers.ts      # Reachability calculations, retreat targeting & symbolic formatters
        ├── orderHelpers.test.ts # Vitest suite for order parsing and valid destinations
        ├── adminHelpers.ts      # Admin permission verification & payload formatters
        └── adminHelpers.test.ts # Vitest suite for admin authorization and mutations
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
│   ├── Imperial Header Bar
│   │   ├── Back to Lobby Navigation Button & Solo Sandbox Switcher
│   │   ├── Turn Chronicle Pill (Season, Year, Phase & Winner)
│   │   ├── Sanity Check Diagnostics Warning Pill
│   │   ├── Real-Time WebSocket Synchronization Badge
│   │   ├── Sidebar Visibility Pill Toggles ("Tools Sidebar", "Tactical Sidebar")
│   │   └── User Auth Profile / Guest Mode
│   │
│   ├── ToolsSidebar.tsx (Left Collapsible Tools & Intel Panel)
│   │   ├── Collapse / Expand Rail Toggle (44px collapsed rail)
│   │   ├── Map View & Camera Controls (Zoom In, Zoom Out, Fit Map 105%)
│   │   ├── Tactical Map Legend (Move, Support, Convoy, Conflict vectors & dual coasts)
│   │   ├── Great Powers Standing & Command Selector (SC & Unit tallies)
│   │   ├── Hypothetical Mode (What-If Opponent Guesses) & Tactical General Staff AI
│   │   ├── Foreign Guesses Count & Discard Actions
│   │   └── Creator Admin Console & Direct-Edit Override Trigger
│   │
│   ├── EuropeMap.tsx (Center Interactive SVG Board)
│   │   ├── Authentic Cartographic Background Layer
│   │   ├── Province Fill & Ownership Borders
│   │   ├── Supply Center Markers
│   │   ├── Unit Tokens (Armies & Fleets)
│   │   ├── Dislodged Unit Retreat Badges
│   │   ├── Dynamic SVG Order Vectors & Bezier Arrows
│   │   ├── Combat Clashes, Bounces & Cut Indicators
│   │   ├── Interactive Unit Radial Menu & Coast Picker
│   │   └── Imperative Camera Control Handle (`EuropeMapHandle`)
│   │
│   └── MacroSidebar.tsx (Right Collapsible Tactical Command Panel)
│       ├── Collapse / Expand Rail Toggle (44px collapsed rail)
│       ├── Active Sovereign Command Header & Supply Center Telemetry
│       ├── Phase Context Alerts (Winter Adjustments Quota, Retreats Dislodgements)
│       ├── Quick Command Actions ("Confirm All", "Surrender & Leave")
│       ├── Home Supply Center Builds (Army / Fleet / Waive)
│       ├── Unit Order Cards (Hold, Move, Support, Convoy, Retreat, Disband)
│       ├── Inline Validation Diagnostics & Combat Simulation Badges
│       └── Sticky Footer: Order Finalization & Phase Adjudication Actions
│
├── Modals & Overlays
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
Runs the Vitest test suites (`orderHelpers.test.ts`, `adminHelpers.test.ts`, `supabase.test.ts`, `europeMapGeometry.test.ts` and `useDiplomacyWebSocket.test.ts`), verifying order reachability algorithms, retreat validation, and administrative permission checks.
