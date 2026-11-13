---
name: frontend-change
description: Use when editing the React UI - map (EuropeMap, MapPiece), sidebars, top bar, modals, CSS, display settings or phone layout. Lists the layout, styling, preference and touch invariants and the visual checks that catch regressions.
---

# Frontend change checklist

Read the matching doc first: `docs/frontend/map-renderer.md`, `sidebar-and-controls.md`, `state-management.md`, `styling-and-themes.md`.

## Rules that have bitten before

- **Types**: `frontend/src/types/diplomacy.ts` mirrors the Pydantic models in `backend/domain/` (`board.py`, `orders.py`, `issues.py`, `game_state.py`, `requests.py`). Change both together.
- **Always pass `activeGameId`** to API calls. A missing one silently hits `proto_1901`.
- **Player power** comes from `resolvePlayerPower` (claimed seat), never from `GameState.active_power`.
- **Phone styles** all live in `src/compact.css` under `[data-layout='compact']`. No width `@media` queries elsewhere. The compact layout must not change the wide one: compare element boxes at 1440×900 before and after.
- **Cascade layers**: `src/styles/index.css` declares `base, components, compact` and must be the first CSS `main.tsx` imports. Wide rules are in `components` (`App.css`), phone rules in `compact`, and nothing may be unlayered. A phone rule beats a wide rule whatever the specificity, so a wide `:hover` or other more specific rule no longer wins over it: restate that state in `compact.css`. Phone rules not scoped by `[data-layout='compact']` (`.compact-*`, the shell height) also beat every wide rule now. Prove a stylesheet change by comparing every element's box and computed style (plus forced `:hover` and `:focus`) between `main` and your build at 1440×900 and 390×844; there is no script for this in the repo, so write a throwaway Playwright dump.
- **Hover**: use `onPointerEnter` / `onPointerLeave` and ignore `pointerType === 'touch'`, so taps leave no stuck highlight.
- **Phone game screen**: no rails. Orders are `MacroSidebar variant="sheet"` in `BottomSheet`, tools are `ToolsSidebar variant="drawer"`, and `EuropeMap` docks its unit menus. Change the shared pieces, not a copy. Something that runs off an edge on purpose needs `overflow: clip` on its container, not `hidden`, which focus and `scrollIntoView` can still scroll.
- **Checking motion in the browser pane**: while the pane is hidden it renders no animation frames, so a CSS transition can sit at its first frame. Read positions with `getBoundingClientRect` after the transition, or use the E2E screenshots, before deciding something is stuck.
- **Map pieces**: drawn by `MapPiece` (`components/MapPiece.tsx`, which re-exports `components/pieces/`), sized by `PieceFrame`. No hardcoded ring radii or badge offsets in the map's layers (`components/map/layers/`). Classic style with `letters` must stay pixel-identical; fix layout in the other styles' rows in `mapLayouts.ts`.
- **Display preferences** are per player and never enter `GameState` or the backend. Run everything read from `localStorage` or `user_metadata` through `sanitizeDisplayPrefs`. A failed account read is not "nothing saved".
- **No redundant UI**: see the anti-redundancy rules in `sidebar-and-controls.md` before adding a toggle, badge or legend entry.
- **Destructive actions** use `ConfirmModal` (in-app), not `window.confirm`.
- **Effect dependencies**: `useExhaustiveDependencies` is off and Biome's unsafe fixes are never applied. A dependency the body never reads, like `userId` in `useDisplayPrefs` (the user is read through a ref) or `authKey` in `useDiplomacyWebSocket`, is what makes the effect re-run. #116's autofix removed three of these and broke sign-in, the socket and the unit menu. Test a re-run with `renderHook`'s `rerender`. State that must reset when a prop changes before the next paint (such as the unit menu on a new selection) is reset during render, not in an effect.
- **Performance**: the map re-renders on hover. Memoize expensive derived data (`useMemo` / `React.memo`) and don't create new objects in render paths that feed the SVG.
- Never reveal other powers' orders in the client. The server masks them, and the client must not reconstruct them from cached state or a fallback poll.

## Verify

1. `cd frontend; npx tsc --noEmit; npm test; npm run build`.
2. Add or extend a Vitest test next to the component (`*.test.ts[x]`). Pure helpers in `utils/` are the easiest to cover. Hooks and clicks need a DOM: start the file with `// @vitest-environment jsdom` and use Testing Library (`renderHook`, `render`, `userEvent`). Mock `lib/supabase` with `vi.mock` instead of reaching the network.
3. Run the matching `python scripts/e2e_runner.py run <scenario>` and open the screenshots. Any change to phone layout also needs `mobile`.
4. Update the frontend docs listed in AGENTS.md section 5.1.
