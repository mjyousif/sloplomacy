# State Management & API Synchronization

The frontend architecture prioritizes server-authoritative truth, immediate reactive UI feedback, and risk-free hypothetical experimentation via Sandbox checkpointing.

---

## State Variables (`App.tsx`)

| State Property | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `gameState` | `GameState \| null` | Global | Authoritative state received from the FastAPI server. |
| `provinces` | `Record<string, ProvinceInfo>` | Global | Static map topology metadata fetched once on bootstrap. |
| `selectedUnitId`| `string \| null` | UI | Currently selected military unit on the map or in the sidebar. |
| `hoveredUnitId` | `string \| null` | UI | Unit currently hovered for cross-component highlighting. |
| `highlightedProvinces` | `string[]` | UI | Provinces highlighted during order targeting or diagnostic inspection. |
| `sandboxMode` | `boolean` | Mode | True when user is in hypothetical "War Room" Sandbox mode. |
| `simulationResult` | `SimulationResult \| null`| UI | Cached non-destructive simulation preview from the server. |
| `showSimulationOverlay`| `boolean` | UI | Whether combat resolutions (arrows, bounces, cuts) are projected on the map. |
| `sanityModalOpen` | `boolean` | Modal | Controls visibility of pre-finalization warning modal. |
| `sanityModalIssues` | `ValidationIssue[]` | Modal | Issues displayed inside the Sanity Check modal. |
| `toastBanner` | `string \| null` | Banner | Auto-expiring toast message for confirmation notifications. |

---

## Server Synchronization Loop

Every mutation action follows a predictable unidirectional data loop:

```
User Click (e.g. Move Army)
         │
         ▼
EuropeMap.tsx or MacroSidebar.tsx
         │
         ▼
App.handleUpdateOrder(order)
         │
         ├──► HTTP POST /api/order
         │      Payload: { order: Order, active_power: Power }
         │
         ├──► HTTP 200 OK: Returns refreshed authoritative GameState
         │
         ▼
App.applyServerState(st)
         │
         ├──► setGameState(st)
         ├──► setSimulationResult(st.last_resolution)
         └──► Triggers re-render of map arrows & diagnostics
```

---

## Sandbox Mode & State Isolation

When a user enables **Sandbox Mode** in the header:

1. **Entering Sandbox (`handleToggleSandboxMode`)**:
   - Dispatches `POST /api/sandbox/enter`.
   - The backend creates an in-memory clone (`SANDBOX_CHECKPOINT`).
   - The UI displays an amber indicator banner: `"WAR ROOM SANDBOX MODE ACTIVE"`.
2. **Multi-Power Operations**:
   - The player can switch to England, Germany, Austria, etc., without losing their current orders.
   - Orders for foreign units can be drafted to test theoretical defense combinations.
   - Clicking **"Simulate Turn"** displays how all hypothetical forces interact.
3. **Exiting Sandbox**:
   - Dispatches `POST /api/sandbox/exit`.
   - The backend restores the pre-sandbox checkpoint.
   - The player's own active-power orders are merged back.
   - All foreign hypothetical orders are purged to prevent accidental submission.
4. **Clearing Foreign Orders**:
   - Dispatches `POST /api/sandbox/clear-foreign`.
   - Cleans all hypothetical enemy orders while remaining in Sandbox mode.
