# Frontend Architecture (React 19 + TypeScript + Vite)

The frontend application is located in `frontend/`. It is built with **React 19**, **TypeScript**, and **Vite**, using **Lucide React** for tactical iconography, **Supabase** for player authentication, and pure SVG vector mathematics for the interactive European atlas.

---

## Directory Structure

```
frontend/
├── index.html                   # HTML entry point with viewport & typography imports
├── package.json                 # Dependencies (React 19, Lucide, Supabase, Vitest, Testing Library)
├── vite.config.ts               # Vite bundler config (/api -> :8000 proxy, camelCaseOnly CSS modules, Vitest)
├── tsconfig.json                # TypeScript compiler configuration
└── src/
    ├── main.tsx                 # React DOM bootstrapping; its first import is styles/index.css
    ├── App.tsx                  # Root state coordinator and viewMode router ('lobby' | 'multiplayer' | 'sandbox')
    ├── App.module.css           # The app shell, loading and error screens (components / compact layers)
    ├── styles/                  # Cascade layers (index.css), tokens.css, base.css, and layerOrder.test.ts
    ├── components/              # Top-level views, modals, headers, sidebars (with co-located *.module.css & *.test.ts[x])
    │   ├── map/                 # Interactive SVG board: hooks/, hud/, layers/ (orders/), and curve geometry
    │   ├── tools/               # Left ToolsSidebar sections (incl. PressSection and press/), collapsed rail, and standings sort hook
    │   ├── macro/               # Right MacroSidebar order sheet, controls/, admin sidebars, and build slots
    │   ├── lobby/               # Match browser, host/join cards, power picker, and lobby dialogs
    │   ├── admin/               # Turn & clock control tab
    │   ├── modal/               # Shared Modal shell and PromptDialog styles
    │   └── pieces/              # Map piece geometry, outlines, marks, and styles/ (classic, seated, compact, flag, nameplate)
    ├── data/                    # Static SVG map paths (europeMapGeometry), piece placements (mapLayouts), text metrics
    ├── hooks/                   # App state hooks (session, sync, sandbox, match/seat actions, auth, layout, history, display prefs)
    ├── lib/                     # Supabase client singleton & auth helpers, and the press (chat) store
    ├── test/                    # Vitest setup (jest-dom + cleanup) and shared map/macro/DOM fixtures
    ├── types/                   # TypeScript contracts synchronized with backend/domain/*.py
    └── utils/                   # Pure helpers: order builders/reachability/progress, history, rankings, sheet math, cx()
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
│   │   ├── Turn Chronicle Pill & History Viewer (TurnChronicle.tsx: turn, ‹ › step, dropdown, Live, hover-expanding nation chips)
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
│   │   └── Turn History footer on phones (TurnHistorySelector.tsx inside ≡ drawer)
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
│       ├── Quick Command Actions ("Clear All Orders", "Surrender & Leave")
│       ├── Home Supply Center Builds (Army / Fleet / Waive)
│       ├── Unit Order Cards (Hold, Move, Support, Convoy, Retreat, Disband)
│       ├── Inline Validation Diagnostics & Combat Simulation Badges
│       ├── Sticky Footer: Order Finalization & Phase Adjudication Actions
│       └── Past-turn bar ("Viewing … · Back to live"), with everything below it dimmed and inert
│
├── Modals & Overlays (AppModals.tsx renders the dialogues, on every view)
│   ├── DisplaySettingsMenu.tsx (Top bar popover for piece style and marks)
│   ├── AuthModal.tsx (Supabase login/signup & local dev auth toggle)
│   ├── AdminSettingsMenu.tsx (Top bar Wrench popover: Edit Board & Turn and Clock Settings)
│   ├── AdminActionWarningModal.tsx (Creator action notice & acknowledgment prompt)
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
  css: {
    modules: { localsConvention: 'camelCaseOnly' }, // `.sanity-modal-card` is `styles.sanityModalCard`
  },
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
