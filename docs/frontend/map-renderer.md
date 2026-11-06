# Europe Map Renderer (`EuropeMap.tsx`)

The visual centerpiece of the application is `frontend/src/components/EuropeMap.tsx`. It is a fully vectorized, GPU-accelerated SVG cartographic map representing the European theatre in 1901.

---

## Geometry & Coordinate System

- **ViewBox**: Defined in `frontend/src/data/europeMapGeometry.ts` (`MAP_VIEWBOX = "0 0 2000 1500"`).
- **Provinces & Borders**: Exact SVG boundary paths for all 76 provinces (including neutral territories and coastal divisions) extracted from authentic historical cartography (`AUTHENTIC_BACKGROUND_SVG` and `AUTHENTIC_FOREGROUND_SVG`).
- **Centroids**: Pre-calculated `Point { x, y }` coordinates for each province and split coast (e.g. `STP_NC`, `STP_SC`), determining unit placement and vector arrow anchors.

---

## Pan & Zoom Engine

The map features smooth multi-modal navigation without external library bloat:
1. **Mouse Drag / Touch Pan**: Tracks `(dx, dy)` deltas and updates the SVG transform matrix:
   ```css
   transform: translate(${pan.x}px, ${pan.y}px) scale(${zoom})
   ```
2. **Bounded Panning (`mapCameraHelpers.ts`)**: Prevents dragging or zooming the map endlessly off-screen into an empty void. Panning coordinates `(x, y)` are dynamically clamped to allowable zoom-dependent boundaries via `clampCamera`, keeping the map firmly in view while allowing full inspection of border territories and split coasts without dead-zone drag lag.
3. **Wheel Zoom**: Smooth zoom centered around the cursor position with configurable clamping (min `0.75x`, max `3.0x`), notifying external toolbars via `onZoomChange`.
4. **Imperative Handle (`EuropeMapHandle`)**: Exposes `stepZoom(delta)`, `resetCamera()`, and `getZoom()` via React `forwardRef`, enabling seamless zoom and fit control from the Left Tools Sidebar without SVG re-renders.

---

## SVG Rendering Layers

The map is rendered as a layered SVG pipeline:

```
<svg viewBox="0 0 2000 1500">
  │
  ├── 1. Static Defs Layer (<defs>): Drop shadows, glow filters, arrow markers
  ├── 2. Background Map Layer: Landmass contours, ocean bathymetry, topography
  ├── 3. Dynamic Province Fill Layer:
  │      - Semi-transparent fills colored by owning Great Power
  │      - Hover highlighting for candidate destinations
  │      - Pulsing red highlights for provinces with tactical errors
  │      - Amber glow on valid retreat destinations during Retreats phase
  │      - Gold pulsing border on vacant home SCs during Winter Adjustments
  │
  ├── 4. Supply Center Layer:
  │      - Circular markers with gold star / power crest
  │      - Distinguishes neutral vs power-owned centers
  │
  ├── 5. Order Vector Layer:
  │      - Blue curved bezier arrows for MOVE orders
  │      - Teal dashed arrows with target reticles for SUPPORT orders
  │      - Purple wavy arrows for CONVOY paths
  │      - Grey circular shields for HOLD orders
  │      - Amber arrows for RETREAT orders
  │
  ├── 6. Tactical Simulation & Clash Layer:
  │      - Red crossed swords (⚔) at contested provinces
  │      - Amber bounce markers (💥) where attacks fail
  │      - Scissors (✂) denoting cut supports
  │      - Dislodged unit badges with retreat indicators
  │
  ├── 7. Unit Token Layer:
  │      - Circular army / fleet tokens with power badges
  │      - Offset dislodged unit tokens with dashed red border
  │      - Semi-transparent phantom tokens for pending BUILD orders
  │      - Selection ring and active power indicator
  │
  └── 8. Floating Action Menu / HUD:
         - Contextual radial quick-actions when a unit is clicked
         - Simulation summary banner
</svg>
```

---

## Map Overlay

`EuropeMap` renders its `overlay` prop inside the map viewport, outside the SVG, so panning and zooming do not move it and it does not trigger them. `App.tsx` uses it to place `PhaseTimerWidget` over the bottom left of the map, where it stays visible with both sidebars collapsed. Toasts are centered at the bottom of the window to keep clear of it.

---

## Click-to-Order Interaction Modes

A player can only control their own units, and other powers' units are marked `foreign-locked`. Every control check goes through `canEditAnyPower`, which is true in the sandbox and for a host with Direct-Edit on (`directEditActive`). That also decides whose orders and diagnostics are drawn.

The map supports direct board-level order entry across all phases:

### 1. Movement Phase
1. **Select Unit**: Clicking an army or fleet sets `selectedUnitId` and displays valid move destinations as highlighted pulses.
2. **Click Destination (Move)**: Clicking any valid adjacent province immediately dispatches a `MOVE` order. If the destination has split coasts (e.g. `STP`), a coast-selection popup appears.
3. **Support Mode**:
   - Step 1: Select supporting unit and click **Support**.
   - Step 2: Click the friendly or foreign unit to be supported.
   - Step 3: Click the target destination province.
4. **Convoy Mode**:
   - Click a fleet in a sea zone.
   - Click the coastal Army to be transported.
   - Click the destination coastal territory.

### 2. Retreat Phase
- Dislodged units are rendered with an offset position and pulsating amber badge.
- Clicking a dislodged unit automatically queries valid retreat destinations (`getValidRetreatDestinations()`) and pulses safe candidate provinces.
- Clicking an eligible destination province immediately dispatches a `RETREAT` order; clicking the unit's action card disbands it.

### 3. Winter Adjustments Phase
- Vacant home supply centers pulse with gold recruitment rings when builds are available.
- Clicking a home center opens a unit recruitment badge (`BUILD A` or `BUILD F`, with coast pickers for `STP`).
- If in a deficit, clicking existing units marks them for `DISBAND`.
