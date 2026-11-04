# Styling, Themes & Cartographic Design

The visual styling is defined in `frontend/src/App.css` and `frontend/src/types/diplomacy.ts`. It adopts an authentic, military war-room aesthetic inspired by turn-of-the-century European cartography, antique brass fittings, and parchment maps.

---

## Design System Tokens

### Neutral & Surface Palette
```css
:root {
  --bg-primary: #0f172a;       /* Deep slate command surface */
  --bg-secondary: #1e293b;     /* Card & panel backgrounds */
  --bg-surface: #334155;       /* Elevated dialogs & headers */
  --border-subtle: #475569;    /* Panel borders */
  --text-main: #f8fafc;        /* High-contrast labels & headers */
  --text-muted: #94a3b8;       /* Secondary descriptions */
  --accent-gold: #e2b144;      /* Historical brass & brass highlights */
  --danger-crimson: #ef4444;   /* Tactical errors & contested battles */
  --warning-amber: #f59e0b;    /* Sanity warnings & sandbox indicators */
  --success-emerald: #10b981;  /* Confirmed orders & successful moves */
}
```

---

## Great Power Color Palette

Each Great Power has an authentic historical color token used for province fills, unit tokens, crests, and order vectors:

| Power | Adjective | Primary Color | Fill Color | Border Color | Light Background |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **England** | British | `#23477d` (Royal Navy Navy) | `#4c72a8` | `#19335c` | `rgba(35, 71, 125, 0.16)` |
| **France** | French | `#34789e` (Sky Blue) | `#6aa9c9` | `#215473` | `rgba(52, 120, 158, 0.16)` |
| **Germany** | German | `#404040` (Prussian Slate) | `#737373` | `#262626` | `rgba(64, 64, 64, 0.16)` |
| **Italy** | Italian | `#2e7d32` (Alpine Green) | `#5b9e5f` | `#1b5e20` | `rgba(46, 125, 50, 0.16)` |
| **Austria** | Austrian | `#b91c1c` (Habsburg Crimson)| `#dc2626` | `#7f1d1d` | `rgba(185, 28, 28, 0.16)` |
| **Russia** | Russian | `#6b21a8` (Imperial Purple)| `#9333ea` | `#4c1d95` | `rgba(107, 33, 168, 0.16)` |
| **Turkey** | Ottoman | `#c2410c` (Ottoman Ochre) | `#ea580c` | `#7c2d12` | `rgba(194, 65, 12, 0.16)` |

---

## Typography & Hierarchy

- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- **Monospace Code/Provinces**: "JetBrains Mono", Menlo, Monaco, Consolas, monospace (used for 3-letter province codes and symbolic order strings).
- **Cartographic Overlines**: `uppercase`, letter spacing `0.08em`, font-weight `600` (used for section headers and pre-flight badges).
- **Map Labels**: Libre Baskerville. Every land province uses one style, bold upright at `16px`; only Liverpool is smaller, at `12px` under its abbreviation. Sea names use italic capitals, sized to fit inside their zone clear of coastlines and dashed borders, and star markers show supply centers. `europeMapGeometry.test.ts` enforces this.

---

## Responsive & Layout Specifications

- **Desktop (Split View)**:
  - Left pane: `flex: 1` interactive Europe Map.
  - Right pane: Fixed-width `460px` scrollable tactical Macro Sidebar.
- **Header Bar**: Fixed height `60px` with nation crests, season pill, and sandbox toggle.
- **Interactive Modals**: Centered backdrop overlay with blur (`backdrop-filter: blur(4px)`) and subtle elevation shadows.
