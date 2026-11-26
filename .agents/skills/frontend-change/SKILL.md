---
name: frontend-change
description: Use when editing the React UI - map (EuropeMap, MapPiece), sidebars, top bar, modals, CSS, display settings or phone layout. Lists the layout, styling, preference and touch invariants and the visual checks that catch regressions.
---

# Frontend change checklist

Read the matching doc first: `docs/frontend/map-renderer.md`, `sidebar-and-controls.md`, `state-management.md`, `styling-and-themes.md`.

## Reuse Before Writing

Check these shared primitives before writing new component CSS, overlays, forms, or buttons (`cssGuard.test.ts` enforces layering, `:global()` safety, no width `@media` queries, and no raw `z-index >= 10`):

| Primitive | Location | Use for |
| :--- | :--- | :--- |
| `<Button>` | `components/ui/Button.tsx` (`Button.module.css`) | Standard `primary` (brass CTA), `secondary` (slate), `danger` (crimson), `danger-soft`, and `ghost` (sky-hover outline) buttons (`size="md" \| "sm"`, `fullWidth`, 44px compact target) |
| `<Modal>` / `<ModalCloseButton>` / `<ModalFooter>` | `components/modal/Modal.tsx` (`Modal.module.css`) | All dialogs: backdrop scrims (`standard`, `raised`, `emphatic`, `blocking`), `onEscape` LIFO stack, desktop + 44px compact close button, and stacked phone footers |
| `Scrollbars.module.css` | `components/ui/Scrollbars.module.css` | Thin dark scrollbars (`scrollbarStyles.thin`) on scrollable containers |
| `FormField.module.css` | `components/ui/FormField.module.css` | `.field`, `.errorAlert`, `.inputWithIcon` / `.inputIcon` with gold focus rings and 16px/44px compact touch rules |
| `HeaderPopover.module.css` + `useDismissableLayer` | `components/header/HeaderPopover.module.css`, `hooks/useDismissableLayer.ts` | Top-bar dropdown popovers, subview navigation, and outside-click/`Escape` dismissal with focus restoration |
| `<BottomSheet>` | `components/ui/BottomSheet.tsx` | Phone pull-up panel (`peek` / `half` / `full`) |
| `<CollapsibleSection>` | `components/ui/CollapsibleSection.tsx` | Sidebar collapsible sections |
| `<ConfirmModal>` / `useConfirm` | `components/modal/ConfirmModal.tsx` | In-app confirmation for destructive actions |
| `SidebarChrome.module.css` | `components/ui/SidebarChrome.module.css` | Floating `<aside>` sidebar shells (`sidebarShell`, `data-side="left" \| "right"`, `data-expanded`, `data-collapsed`), dark panel headers (`panelHeader`, `panelHeaderTitle`, `panelHeaderIcon`, `panelCloseBtn`), collapse toggles, and collapsed rail buttons |
| `<PowerFlag>` / `<BrandEmblem>` | `components/ui/PowerFlag.tsx`, `BrandEmblem.tsx` | Great Power flags and brand crest |
| `<IconSelectDropdown>` / `<PowerFlagDropdown>` | `components/ui/IconSelectDropdown.tsx`, `PowerFlagDropdown.tsx` | Custom icon select menus with keyboard nav (`ArrowUp`/`ArrowDown`/`Home`/`End`) and `useNative` `<select>` fallback (pass `useNative={isSheet}` / `useNativeSelect={isSheet}` on phone sheets) |
| `<SegmentedControl>` | `components/ui/SegmentedControl.tsx` (`SegmentedControl.module.css`) | Nested-pill toggles (`semantics="toggle"`, `aria-pressed`) and tab strips (`semantics="tabs"`, `role="tablist"`, arrow keys) across `gold`, `sky`, and `neutral` tones |
| `<CountBadge>` / `countBadgeAnchor` | `components/ui/CountBadge.tsx` (`CountBadge.module.css`) | Amber unread-count pills (`inline` or `floating` over `countBadgeAnchor`) |
| `<StatusBadge>` | `components/ui/StatusBadge.tsx` (`StatusBadge.module.css`) | Campaign urgency status pills (`your-move`, `waiting`, `finished`) in `sm` and `md` sizes |
| `useOverlayFocusEscape` | `hooks/useOverlayFocusEscape.ts` | Focuses close control on open and dismisses on `Escape` for mounted mobile overlays (`ToolsSidebar` drawer, `MobilePressSheet`) |

*Non-goals (keep separate)*: Do **not** force domain-specific tactical controls into `<Button>` (`OrderFooter` finalize/unfinalize & `ClearAllButton`, `SandboxToolsSection` sky Hypothetical Mode toggle, `PhaseTimerWidget` bronze countdown pill, `PressSuggestion` amber cards); do **not** build a universal `<PowerSelector>` across power-picking surfaces; do **not** merge `OrderTypeTabs` into `<SegmentedControl>`; and do **not** merge `<BottomSheet>`, `ToolsSidebar` drawer, and `MobilePressSheet`.

## Rules that have bitten before

- **Types**: `frontend/src/types/diplomacy.ts` mirrors the Pydantic models in `backend/domain/` (`board.py`, `orders.py`, `issues.py`, `game_state.py`, `requests.py`). Change both together.
- **Always pass `activeGameId`** to API calls. A missing one silently hits `proto_1901`.
- **Player power** comes from `resolvePlayerPower` (claimed seat), never from `GameState.active_power`.
- **Desktop-first with mobile parity**: Prioritize the desktop (`1440×900`) user experience first—never compromise wide layouts or controls for mobile. Keep mobile (`390×844`) strictly in sync with desktop features, layout hierarchy, and conventions in the **same PR** by updating shared components/controls (`variant="sheet"` / `variant="drawer"` / `@layer compact`) rather than gating desktop polish behind `!isSheet` or leaving the phone sheet/drawer out of sync. Any new or updated desktop feature, header/banner tidy-up, menu action, modal, or order control must have the parallel change on mobile unless a specific viewport or touch constraint prevents it.
- **Phone styles** all live in the `compact` layer, in a component's `*.module.css` (`@layer compact`), under `[data-layout='compact']`. No width `@media` queries elsewhere (enforced by `cssGuard.test.ts`). The compact layout must not change the wide one: compare element boxes at 1440×900 before and after.
- **Cascade layers**: `src/styles/index.css` declares `base, components, compact` and must be the first CSS `main.tsx` imports. Wide rules are in `components` (the `@layer components` block of a `*.module.css`), phone rules in `compact`, and nothing may be unlayered. A phone rule beats a wide rule whatever the specificity, so a wide `:hover` or other more specific rule no longer wins over it: restate that state in the `compact` layer (the module's phone block). Phone rules not scoped by `[data-layout='compact']` (`.compact-*`, the shell height) also beat every wide rule now. Prove a stylesheet change by comparing every element's box and computed style (plus forced `:hover` and `:focus`) between `main` and your build at 1440×900 and 390×844; run `node scripts/compare_styles.mjs --main <dist of main> --scenes <file.mjs>` (a scenes file exports `forcedSelectors` and `run({ page, baseUrl, viewport, hasTouch, snap })`; `includeSvg: true` also compares everything inside the map's `<svg>`, which is skipped by default).
- **CSS modules**: a component's styles go in `Foo.module.css` beside it (wide in `@layer components`, phone in `@layer compact`), kebab-case in the CSS and `styles.camelCase` in the component, joined with `cx()`. State is a `data-*` attribute, never a class, and tests and E2E find elements by role, text or `data-testid`, never by a module class (a global class is still fine to query). Never use `:global(.<module-class>)` to target another CSS module's hashed class (use `data-*` or `data-testid` attributes instead; `cssGuard.test.ts` fails on `:global(.class)`), and never leave dead unmodularized `className="..."` strings that exist in no stylesheet. A dialog uses `components/modal/Modal`. See [styling-and-themes.md](../../../docs/frontend/styling-and-themes.md#component-stylesheets-css-modules).
- **Design tokens**: use the `var(--...)` tokens in `styles/tokens.css` (palette, `--font-*`, `--z-*`, `--radius-*`, `--transition-*`, `--scrim-dark`, `--shadow-popover`) instead of introducing raw hex colors, font stacks, or z-index numbers in `*.module.css` (`cssGuard.test.ts` forbids raw `z-index >= 10`).
- **Hover**: use `onPointerEnter` / `onPointerLeave` and ignore `pointerType === 'touch'`, so taps leave no stuck highlight.
- **Phone game screen**: no rails. Orders are `MacroSidebar variant="sheet"` in `BottomSheet`, tools are `ToolsSidebar variant="drawer"`, and `EuropeMap` docks its unit menus. Change the shared pieces, not a copy. Tapping order-type tabs inside the open phone sheet (`selectOnOrderTypeChange={!isSheet}`) keeps the sheet open for inline editing; only tapping a card header or map piece opens the docked map bar. Something that runs off an edge on purpose needs `overflow: clip` on its container, not `hidden`, which focus and `scrollIntoView` can still scroll.
- **Native `<select>` on mobile, custom `IconSelectDropdown` on desktop**: Inside `MacroSidebar` (`variant="sheet"` / `isSheet`), pass `useNativeSelect={isSheet}` through **every** order-control branch (compact and detailed) so iOS/Android open their native OS pop-up picker. Reserve `IconSelectDropdown` (with `PowerFlag` icons and pointer-hover map highlighting) for desktop (`!isSheet`).
- **Dark scrollbar parity**: Any scrollable container must compose `scrollbarStyles.thin` from `components/ui/Scrollbars.module.css` (`cx(..., scrollbarStyles.thin)`) instead of duplicating `scrollbar-width` / `::-webkit-scrollbar` rules or hardcoding `#333d4e`.
- **Checking motion in the browser pane**: while the pane is hidden it renders no animation frames, so a CSS transition can sit at its first frame. Read positions with `getBoundingClientRect` after the transition, or use the E2E screenshots, before deciding something is stuck.
- **Map pieces**: drawn by `MapPiece` (`components/MapPiece.tsx`, which re-exports `components/pieces/`), sized by `PieceFrame`. No hardcoded ring radii or badge offsets in the map's layers (`components/map/layers/`). Classic style with `letters` keeps the original placements and piece shapes; fix layout in the other styles' rows in `mapLayouts.ts`. Highlights lift the piece (`PieceLift`) and own pieces wear `OWN_RIM`; a ring around a piece goes through `PieceOutline` / `PieceHoldOutline` with the unit type, so it fits flags and fleet plates.
- **Display preferences** are per player and never enter `GameState` or the backend. Run everything read from `localStorage` or `user_metadata` through `sanitizeDisplayPrefs`. A failed account read is not "nothing saved".
- **No redundant UI**: see the anti-redundancy rules in `sidebar-and-controls.md` before adding a toggle, badge or legend entry.
- **Destructive actions** use `ConfirmModal` (in-app), not `window.confirm`.
- **Effect dependencies**: `useExhaustiveDependencies` is off and Biome's unsafe fixes are never applied. A dependency the body never reads, like `userId` in `useDisplayPrefs` (the user is read through a ref) or `authKey` in `useDiplomacyWebSocket`, is what makes the effect re-run. #116's autofix removed three of these and broke sign-in, the socket and the unit menu. Test a re-run with `renderHook`'s `rerender`. State that must reset when a prop changes before the next paint (such as the unit menu on a new selection) is reset during render, not in an effect.
- **Performance**: the map re-renders on hover. Memoize expensive derived data (`useMemo` / `React.memo`) and don't create new objects in render paths that feed the SVG.
- Never reveal other powers' orders in the client. The server masks them, and the client must not reconstruct them from cached state or a fallback poll.

## Verify

1. `cd frontend; npx tsc --noEmit; npm test; npm run build`.
2. Add or extend a Vitest test next to the component (`*.test.ts[x]`). Pure helpers in `utils/` are the easiest to cover. Hooks and clicks need a DOM: start the file with `// @vitest-environment jsdom` and use Testing Library (`renderHook`, `render`, `userEvent`). Mock `lib/supabase` with `vi.mock` instead of reaching the network.
3. Visually inspect **both** desktop (`1440×900`) and mobile (`390×844`) whenever changing top-bar menus, shared sidebars, order controls, map HUD overlays, modals, or lobby layout—before opening or updating a PR. Run the matching desktop scenario **and** `python scripts/e2e_runner.py run mobile`, then open screenshots from both viewports.
4. Update the frontend docs listed in AGENTS.md section 5.1.
