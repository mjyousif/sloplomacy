# Frontend Architecture (React 19 + TypeScript + Vite)

The frontend application is located in `frontend/`. It is built with **React 19**, **TypeScript**, and **Vite**, using **Lucide React** for tactical iconography and pure SVG vector mathematics for the interactive European map.

---

## Directory Structure

```
frontend/
├── index.html                   # HTML entry point with viewport & font imports
├── package.json                 # Node dependencies and build scripts
├── vite.config.ts               # Vite configuration and backend API proxy (/api -> :8000)
├── tsconfig.json                # TypeScript compiler configuration
└── src/
    ├── main.tsx                 # React DOM bootstrapping
    ├── App.tsx                  # Root state container, API synchronization & layout
    ├── App.css                  # Global layout, tactical panels, banners & modals
    ├── index.css                # Base reset & typography
    ├── components/
    │   ├── EuropeMap.tsx        # High-performance interactive SVG game board
    │   ├── MacroSidebar.tsx     # Order roster, power switcher, turn controls & warnings
    │   └── SanityCheckModal.tsx # Pre-finalization tactical blunder warning dialogue
    ├── data/
    │   └── europeMapGeometry.ts # Authentic SVG vector paths, province centers & defs
    ├── types/
    │   └── diplomacy.ts         # TypeScript definitions mirroring backend Pydantic models
    └── utils/
        └── orderHelpers.ts      # Reachability calculations and symbolic order formatters
```

---

## Component Tree

```
App.tsx
├── Header Bar
│   ├── Power Selector (7 Great Powers with crests)
│   ├── Phase / Season / Year Badge
│   ├── Sandbox "War Room" Toggle
│   └── Scenario Selector Dropdown
│
├── Main Workspace (Split View)
│   ├── EuropeMap.tsx (Interactive SVG Board)
│   │   ├── Authentic Cartographic Background Layer
│   │   ├── Province Fill & Ownership Borders
│   │   ├── Supply Center Markers
│   │   ├── Hover & Selection Highlights
│   │   ├── Unit Tokens (Armies & Fleets)
│   │   ├── Dynamic SVG Order Vectors & Arrows
│   │   ├── Combat Clashes, Bounces & Cut Indicators
│   │   └── Floating Map Overlay HUD & Controls
│   │
│   └── MacroSidebar.tsx (Tactical Control Panel)
│       ├── Active Nation Header & Supply Center Counter
│       ├── Pre-Flight Diagnostics Warning Banner
│       ├── Unit Order Cards (Hold, Move, Support, Convoy)
│       ├── Quick-Fill Controls ("Confirm All Holds")
│       ├── Turn Simulation Preview Button
│       ├── Adjudicate & Advance Phase Button
│       └── Chronological Turn History Feed
│
└── SanityCheckModal.tsx (Tactical Blunder Gatekeeper)
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
