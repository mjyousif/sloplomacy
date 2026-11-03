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
    │   ├── MacroSidebar.tsx     # Order roster, phase controls, diagnostics, admin/surrender
    │   ├── LobbyView.tsx        # Match browser, game creation, seat claim & sandbox cards
    │   ├── AdminToolsModal.tsx  # Unit teleport, spawn, destroy, turn jump & timeline rollback
    │   ├── AuthModal.tsx        # Supabase signin/signup & local dev auth toggle
    │   ├── SurrenderModal.tsx   # Concession flow & Civil Disorder confirmation
    │   └── SanityCheckModal.tsx # Pre-finalization tactical blunder warning dialogue
    ├── data/
    │   └── europeMapGeometry.ts # Authentic SVG vector paths, province centers & defs
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
│   ├── Match List & Lobbies Browser
│   ├── Create Game Modal / Drawer
│   ├── Seat Claim Controls (7 Great Powers)
│   ├── Active & Saved Sandboxes Roster
│   └── User Auth Header & Profile Switcher
│
├── View 2: Tactical Workspace (when viewMode === 'multiplayer' | 'sandbox')
│   ├── Header Bar
│   │   ├── Back to Lobby Navigation Button
│   │   ├── Active Nation Crest & Power Selector (with seat locking)
│   │   ├── Phase / Season / Year Badge
│   │   ├── Sandbox "War Room" Toggle
│   │   ├── Admin Tools Button (creator only)
│   │   └── Surrender Button (active player seat)
│   │
│   ├── EuropeMap.tsx (Interactive SVG Board)
│   │   ├── Authentic Cartographic Background Layer
│   │   ├── Province Fill & Ownership Borders
│   │   ├── Supply Center Markers
│   │   ├── Unit Tokens (Armies & Fleets)
│   │   ├── Dislodged Unit Retreat Badges
│   │   ├── Dynamic SVG Order Vectors & Bezier Arrows
│   │   ├── Combat Clashes, Bounces & Cut Indicators
│   │   └── Floating Map Overlay HUD & Controls
│   │
│   └── MacroSidebar.tsx (Tactical Control Panel)
│       ├── Active Nation Header & Supply Center Counter
│       ├── Pre-Flight Diagnostics Warning Banner
│       ├── Unit Order Cards (Hold, Move, Support, Convoy, Retreat, Disband, Build)
│       ├── Batch Operations ("Confirm All Holds")
│       ├── Turn Simulation Preview Button
│       ├── Adjudicate & Advance Phase Button
│       └── Chronological Turn History Feed
│
├── Modals & Overlays
│   ├── AuthModal.tsx (Supabase login/signup & local dev auth toggle)
│   ├── AdminToolsModal.tsx (Creator unit teleport, spawn, destroy, turn jump, rollback)
│   ├── SurrenderModal.tsx (Civil Disorder concession dialogue)
│   └── SanityCheckModal.tsx (Tactical Blunder Gatekeeper before order finalization)
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
Runs the Vitest test suites (`orderHelpers.test.ts` and `adminHelpers.test.ts`), verifying order reachability algorithms, retreat validation, and administrative permission checks.
