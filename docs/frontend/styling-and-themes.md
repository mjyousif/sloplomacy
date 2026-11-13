# Styling, Themes & Cartographic Design

The visual styling is defined in `frontend/src/App.css`, `frontend/src/compact.css` and the `*.module.css` files beside the components that have moved out of them (see [Component Stylesheets](#component-stylesheets-css-modules)), ordered by the cascade layers in `frontend/src/styles/index.css` (see [Stylesheet Layers](#stylesheet-layers)). It adopts an authentic, military war-room aesthetic inspired by turn-of-the-century European cartography, antique brass fittings, and parchment maps.

---

## Stylesheet Layers

`src/styles/index.css` is the only place the cascade order is written: `@layer base, components, compact;`. It then imports each sheet into a layer, so a later layer wins over an earlier one whatever the specificity:

| Layer | Holds | File |
| :--- | :--- | :--- |
| `base` | App-wide tokens, the reset and page defaults, the shared `@keyframes`, `.compact-only` | `styles/tokens.css`, `styles/base.css` |
| `components` | The wide layout (desktop and tablets) | `App.css`, and the `@layer components` block of every `*.module.css` |
| `compact` | The phone layout | `compact.css`, and the `@layer compact` block of every `*.module.css` |

- `main.tsx` imports `styles/index.css` first. Vite orders CSS by first import, and the minifier drops the `@layer` line once the blocks already come in order. A sheet imported before it is either unlayered (and beats everything) or, if it opens `@layer compact` or `@layer components`, fixes that layer's rank first. Order still decides ties inside one layer.
- **Nothing may be unlayered.** Unlayered rules beat every layer.
- Because `compact` outranks `components`, a phone rule now beats a wide rule that is *more specific* than it. A wide `:hover` rule used to beat a plain phone rule (specificity), and no longer does. Where that was the look, the phone rules restate the state: the close button's hover in `PromptDialog.module.css`, the `.phase-timer-collapse` hover and the font size of the fields in the Turn & Clock sidebar in `compact.css`. Phone rules that are not scoped by `[data-layout='compact']` (the `.compact-*` family, the shell height, the `(hover: none)` rule) now also beat every wide rule on desktop. Check a change by comparing every element's box and computed style, plus forced `:hover` and `:focus`, between `main` and your build.
- `.compact-only` is in the lowest layer, so a component rule that sets `display` on the same element beats it. Give such an element no `display` rule of its own.
- `@keyframes` are found by name from any layer, but a CSS module renames the keyframes it names. A module that uses one from `base.css` writes `animation: 2s infinite global(pulse-live)`, with the name last: `:global(...)` there is a syntax error.
- `.ai-btn` is styled in `App.css` but no component uses that class.
- `tokens.css` is empty: the stylesheets still write their colours, font stacks and sizes as literals. The only custom properties are `--chip-color` (default in `App.css`, set by `TurnHistorySelector`) and `--docked-bar-h` (set from script by the map), and both belong to one feature. The page itself is `#14171c` behind `#f1ede4` text in Inter.

---

## Component Stylesheets (CSS Modules)

A component's styles live in a `Foo.module.css` beside `Foo.tsx`. `App.css` and `compact.css` shrink as components move out; the modals, the top bars and the display and administrator menus are done (`Modal`, `PromptDialog`, `ConfirmModal`, `SurrenderModal`, `AuthModal`, `SanityCheckModal`, `AccountModal`, `GameOverModal`, `PrivateCampaignCreatedModal`, `FormField`, `BrandEmblem`, `TopHeader`, `CompactTopBar`, `AppHeader`, `DisplaySettings`, `AdminSettingsMenu`).

- **Layers in the file.** The wide rules sit in `@layer components { ... }` and the phone overrides in `@layer compact { :global([data-layout='compact']) .x { ... } }`, both in the same file. Nothing is unlayered.
- **Names.** Write kebab-case classes in the CSS and read them as camelCase: `.sanity-modal-card` is `styles.sanityModalCard` (`css.modules.localsConvention: 'camelCaseOnly'` in `vite.config.ts`). Join several with `cx()` from `utils/cx.ts`.
- **State.** A state or variant is a `data-*` attribute the module styles with `[data-active='true']`, `[data-status='errors']`, `[data-variant='primary']`, not a modifier class. Tests assert the attribute (`toHaveAttribute('data-active', 'true')`), and find elements by role, text or `data-testid`, never by class: a module class name is hashed.
- **A module owns its classes.** To style another component from outside, pass a `className` prop (`BrandEmblem` takes the phone bar's smaller size that way) or put the rule in that component's module. Two modules never rely on the order they load in: a rule that must beat another module's rule uses a more specific selector (`button.admin-mode-card` over `.display-option-card`) or sits in the same file after it.
- **Shared pieces.** `FormField.module.css` holds the field, label, icon input and error alert that the Host and Join cards and two dialogs use; `DisplaySettings.module.css` the menu panel that the Display settings and Administrator menus share; `BrandEmblem` the gold compass badge.

### Modals

`components/modal/Modal.tsx` is the shell every dialog uses: `Modal` (the dimmed backdrop and the card), `ModalCloseButton` and `ModalFooter`.

- `scrim` picks how the backdrop dims the page: `standard`, `raised` (the game-over notice), `emphatic` (surrender) or `blocking` (`ConfirmModal`, above every other modal).
- On a phone the card fits the visible height (`max-height: calc(100dvh - 24px)`) and scrolls (`phone` says what the card does: `scroll` by default, `fit` for a card whose body scrolls on its own like the sanity check, `none` for the game-over card, which has no phone rules), footers stack into full-width 44px buttons with the main action on top, and close buttons are 44px square. These rules are in `Modal.module.css`, not repeated per dialog.
- `onBackdropClick` is a click on the dimmed area; `isolateClicks` (on by default when there is one) keeps clicks inside the card from reaching the page behind it.
- Each dialog's own module styles what is inside. The three dialogs of private campaigns and saved sandboxes (`PasscodePromptModal`, `SaveSandboxModal`, `PrivateCampaignCreatedModal`) share `modal/PromptDialog.module.css`.

---

## Great Power Color Palette

Each Great Power has an authentic historical color token used for province fills, unit tokens, crests, and order vectors:

| Power | Adjective | Primary Color | Fill Color | Border Color | Light Background |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **England** | British | `#183668` (Royal Navy Navy) | `#1e3e73` | `#0e2244` | `rgba(24, 54, 104, 0.18)` |
| **France** | French | `#34789e` (Sky Blue) | `#6aa9c9` | `#215473` | `rgba(52, 120, 158, 0.16)` |
| **Germany** | German | `#404040` (Prussian Slate) | `#737373` | `#262626` | `rgba(64, 64, 64, 0.16)` |
| **Italy** | Italian | `#2e7d32` (Alpine Green) | `#5b9e5f` | `#1b5e20` | `rgba(46, 125, 50, 0.16)` |
| **Austria** | Austrian | `#b91c1c` (Habsburg Crimson)| `#dc2626` | `#7f1d1d` | `rgba(185, 28, 28, 0.16)` |
| **Russia** | Russian | `#67387e` (Imperial Purple)| `#754e85` | `#431d56` | `rgba(103, 56, 126, 0.16)` |
| **Turkey** | Ottoman | `#c2410c` (Ottoman Ochre) | `#ea580c` | `#7c2d12` | `rgba(194, 65, 12, 0.16)` |

---

## Typography & Hierarchy

- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Monospace Code/Provinces**: "JetBrains Mono", Menlo, Monaco, Consolas, monospace (used for 3-letter province codes and symbolic order strings).
- **Cartographic Overlines**: `uppercase`, letter spacing `0.08em`, font-weight `600` (used for section headers and pre-flight badges).
- **Map Labels**: Libre Baskerville. The non-classic piece styles place land names from `data/mapLayouts.ts`, at up to `16px` with a parchment halo (`.map-province-name`). In the Classic style, every land province uses one style, bold upright at `16px`; only Liverpool is smaller, at `12px` under its abbreviation. Sea names use italic capitals, sized to fit inside their zone clear of coastlines and dashed borders, and star markers show supply centers. `europeMapGeometry.test.ts` enforces this.

---

## Responsive & Layout Specifications

The app has two layouts. `useCompactLayout()` (`hooks/useCompactLayout.ts`) decides which one applies from a single media query, `COMPACT_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px)'`. The second half catches phones held sideways. `App.tsx` writes the answer on the shell as `data-layout="compact"` or `data-layout="wide"`.

- **Wide (desktop and tablets)**: the original layout, styled by `App.css`.
  - Header: a `60px` row with the brand, Solo Sandbox, the turn, the order check pill, display settings and the account.
  - Workspace: the Left Tools Sidebar (`290px`, or a `44px` rail), the map (`flex: 1`), and the Right Tactical Sidebar (`360px`, between `340px` and `380px`, or a `44px` rail).
- **Compact (phones)**: every phone rule lives in the `compact` layer, either in `src/compact.css` or in the `@layer compact` block of a component's `*.module.css`, and starts with `[data-layout='compact']`. None of them writes its own width `@media` rule, so the breakpoint is defined only in `COMPACT_LAYOUT_QUERY`. Nothing in them changes the wide layout.
  - **Viewport**: the shell is `100dvh` tall (falling back to `App.css`'s `100vh`), so mobile browser toolbars don't hide the bottom edge. `index.html` sets `viewport-fit=cover`, and the shell pads itself with `env(safe-area-inset-*)`.
  - **Top bar**: `CompactTopBar.tsx` replaces the header. See [Phone Top Bar](sidebar-and-controls.md#phone-top-bar-compacttopbartsx).
  - **Lobby**: one column, in this order: your games, open games, Host, Join, then the intro banner. Power slots wrap to as many columns as fit (about three on a phone), and rows of buttons wrap.
  - **Modals**: cards fit the visible height and scroll. Footers stack into full-width buttons, with the main action on top and Cancel at the bottom. Close buttons are `44px` square. The admin console's tabs scroll sideways and its forms use one column.
  - **Touch**: buttons in modals, the lobby and the top bar are at least `44px` tall. Inputs and selects use `16px` text so iOS doesn't zoom in on focus. Small pills and labels get at least `12px` text.
  - **Game screen**: there are no sidebar rails. The map spans the screen from the top bar down to the order sheet's peek. See [Phone Game Screen](sidebar-and-controls.md#phone-game-screen).
    - **Order sheet** (`BottomSheet.tsx` with `MacroSidebar`'s `variant="sheet"`): a pull-up panel that starts lowered. Its peek holds the power, its counts, the status, Confirm All, Finalize and Resolve, plus the consensus card and host override in a match. It is about 23% of a 390×844 screen in a sandbox. Half and full show the phase notes and the unit cards. While lowered, its list is `inert`.
    - **Tools drawer** (`ToolsSidebar`'s `variant="drawer"`): slides over the game area from the left when ≡ in the top bar is tapped, with a backdrop. It has no zoom section.
    - **Docked unit bar**: the unit, build and coast menus sit in one full-width bar at the bottom of the map instead of floating beside the unit.
    - **Turn clock**: a pill at the top of the map that opens into the full widget.
    - **Turn history**: the selector sits at the foot of the tools drawer with 40px controls. A past turn puts an amber `‹ S1901 M › Live` pill at the top of the map, below the clock pill when there is one.
    - **Hypothetical banner**: one short line at the top of the map, below the clock pill when there is one.
    - **Toasts**: drop from under the top bar at full width, and taps pass through them, so they never cover Finalize.
    - **No scrolling**: `.war-room-workspace` uses `overflow: clip`, because the lowered sheet runs off the bottom of the screen and `overflow: hidden` would still let focus or script scroll the whole game screen up.
    - **Landscape**: the peek's three buttons share a row, so a phone held sideways keeps some map.
  - **Touch map**: 44px zoom buttons sit in the map's bottom-right corner (`.map-zoom-controls`) and ride above the docked unit bar (`--docked-bar-h`). The cartouche and unit popup drop `backdrop-filter` so panning stays smooth. See [Phone camera](map-renderer.md#phone-camera-compact-prop).
- **`.compact-only`**: hidden in the wide layout and shown in the compact one. It carries text that a desktop tooltip already gives, such as what the two surrender buttons do.
- **Touch screens**: `@media (hover: none)` hides the ConfirmModal's Shift tip, because Shift needs a keyboard.
- **Header Bar (wide)**: fixed height `60px` with nation crests, season pill, and sandbox toggle.
- **Interactive Modals**: centered backdrop overlay with blur (`backdrop-filter: blur(6px)`, none for the confirmation) and subtle elevation shadows; see [Modals](#modals).
