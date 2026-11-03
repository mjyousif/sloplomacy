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
2. **Wheel Zoom**: Smooth zoom centered around the cursor position with configurable clamping (min `0.6x`, max `3.5x`).
3. **HUD Controls**: On-screen buttons for Zoom In (`+`), Zoom Out (`-`), and Reset Viewport.

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
  │
  ├── 6. Tactical Simulation & Clash Layer:
  │      - Red crossed swords (⚔) at contested provinces
  │      - Amber bounce markers (💥) where attacks fail
  │      - Scissors (✂) denoting cut supports
  │      - Dislodged unit badges with retreat indicators
  │
  ├── 7. Unit Token Layer:
  │      - Circular army / fleet tokens with power badges
  │      - Selection ring and active power indicator
  │
  └── 8. Floating Action Menu / HUD:
         - Contextual radial quick-actions when a unit is clicked
         - Simulation summary banner
</svg>
```

---

## Click-to-Order Interaction Modes

The map supports direct board-level order entry:

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
