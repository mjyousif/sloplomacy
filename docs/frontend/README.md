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
    ├── components/              # App & feature entrypoints (with co-located *.module.css & *.test.ts[x])
    │   ├── header/              # Desktop/compact top bars, display settings menu, turn chronicle, version badge
    │   ├── ui/                  # Shared UI primitives (BottomSheet, CollapsibleSection, BrandEmblem, PowerFlag, chrome/form styles)
    │   ├── map/                 # Interactive SVG board: hooks/, hud/, layers/ (orders/, units/), and curve geometry
    │   ├── tools/               # Left ToolsSidebar sections (incl. PressSection and press/), TurnHistorySelector, SaveSandboxModal, and collapsed rail
    │   ├── macro/               # Right MacroSidebar order sheet, controls/, admin sidebars, and build slots
    │   ├── lobby/               # Match browser, Host/Join buttons and their form dialogs, power picker
    │   ├── admin/               # AdminSettingsMenu, TurnControlTab, and AdminActionWarningModal
    │   ├── auth/                # Sign-in / sign-up modal and account settings modal
    │   ├── game/                # PhaseTimerWidget and match-lifecycle modals (surrender, game over, sanity check)
    │   ├── modal/               # Generic modal primitives (Modal, ConfirmModal, PromptDialog styles)
    │   └── pieces/              # Map piece geometry, outlines, marks, and styles/ (classic, seated, compact, flag, nameplate)
    ├── data/                    # Static SVG map paths (europeMapGeometry), piece placements (mapLayouts), text metrics
    ├── hooks/                   # App state hooks (session, sync, sandbox, match/seat actions, auth, layout, history, display prefs)
    ├── lib/                     # Supabase client singleton & auth helpers, and the press (chat) store
    ├── test/                    # Vitest setup (jest-dom + cleanup) and shared map/macro/DOM fixtures
    ├── types/                   # TypeScript contracts synchronized with backend/domain/*.py
    └── utils/                   # Pure helpers: order builders/reachability/progress, history, rankings, sheet math, cx()
```

---

## View & Package Architecture

```
App.tsx (Root View Container: 'lobby' | 'multiplayer' | 'sandbox')
├── AppHeader                                ──► components/header/ & components/admin/AdminSettingsMenu
├── LobbyView (viewMode === 'lobby')          ──► components/lobby/
├── GameWorkspace (multiplayer | sandbox)
│   ├── ToolsSidebar                         ──► components/tools/
│   ├── EuropeMap (SVG board + HUD)          ──► components/map/, components/pieces/, & components/game/PhaseTimerWidget
│   └── MacroSidebar (order sheet & admin)   ──► components/macro/ & components/admin/
└── AppModals (global modal coordinator)     ──► components/modal/, auth/, admin/, game/, tools/
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
