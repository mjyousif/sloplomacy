# State Management & API Synchronization

The frontend architecture prioritizes server-authoritative truth, immediate reactive UI feedback, multiplayer lobby management, and risk-free hypothetical experimentation via Sandbox checkpointing.

---

## State Variables (`App.tsx`)

| State Property | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `viewMode` | `'lobby' \| 'sandbox' \| 'multiplayer'` | Router | High-level application mode (match browser vs tactical board). |
| `activeGameId` | `string` | Scoping | ID of the active game session (default: `'proto_1901'`). |
| `currentGameSummary`| `MultiplayerGameSummary \| null` | Room | Metadata for current multiplayer match or saved sandbox. |
| `lockedPower` | `Power \| null` | Match | Claimed sovereign power for active player in multiplayer matches. |
| `authUser` | `AuthUser \| null` | Auth | Authenticated user profile from Supabase (or local dev mode). |
| `authModalOpen` | `boolean` | Modal | Controls visibility of Supabase auth dialogue. |
| `gamesList` | `MultiplayerGameSummary[]` | Lobby | Roster of public matches, lobbies, and sandboxes. |
| `gameState` | `GameState \| null` | Global | Authoritative match state received from FastAPI. |
| `provinces` | `Record<string, ProvinceInfo>` | Global | Static map topology metadata fetched once on bootstrap. |
| `selectedUnitId` | `string \| null` | UI | Currently selected military unit on the map or in the sidebar. |
| `hoveredUnitId` | `string \| null` | UI | Unit hovered for cross-component highlighting. |
| `highlightedProvinces`| `string[]` | UI | Provinces highlighted during targeting or diagnostic inspection. |
| `sandboxMode` | `boolean` | Mode | True when user is in hypothetical "War Room" Sandbox mode. |
| `simulationResult` | `SimulationResult \| null`| UI | Cached non-destructive simulation preview from the server. |
| `showSimulationOverlay`| `boolean` | UI | Whether combat resolutions (arrows, bounces, cuts) are projected on the map. |
| `adminModalOpen` | `boolean` | Modal | Controls visibility of the game creator's Admin Tools modal. |
| `adminOverrideActive`| `boolean` | Admin | Indicates whether admin modifications are active on the current turn. |
| `surrenderModalOpen` | `boolean` | Modal | Controls visibility of the Surrender / Civil Disorder confirmation modal. |
| `sanityModalOpen` | `boolean` | Modal | Controls visibility of pre-finalization warning modal. |
| `sanityModalIssues` | `ValidationIssue[]` | Modal | Issues displayed inside the Sanity Check modal. |
| `toastBanner` | `string \| null` | Banner | Auto-expiring toast message for user notifications. |

---

## Server Synchronization Loop

Every mutation action follows a predictable unidirectional data loop scoped by `activeGameId`:

```
User Click (e.g. Move Army)
         │
         ▼
EuropeMap.tsx or MacroSidebar.tsx
         │
         ▼
App.handleUpdateOrder(order)
         │
         ├──► HTTP POST /api/order?game_id={activeGameId}
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

## Lobby & Match Management Flow

1. **Viewing Matches (`GET /api/games`)**:
   - `LobbyView.tsx` loads the list of open lobbies, ongoing matches, and saved sandboxes.
2. **Creating a Match (`POST /api/games`)**:
   - Users create custom rooms or isolated sandboxes.
3. **Joining & Claiming Seats (`POST /api/games/{id}/join`)**:
   - Claims an available Great Power for the user, setting `lockedPower` so moves cannot be submitted for rival nations.
4. **Surrender & Civil Disorder (`POST /api/games/{id}/surrender`)**:
   - When a player concedes, the power enters Civil Disorder, defaulting to passive hold without player command.
5. **Leaving / Vacating (`POST /api/games/{id}/leave`)**:
   - Frees the claimed seat or deletes saved sandboxes.

---

## Sandbox Mode & State Isolation

When a user enables **Sandbox Mode** in the header:

1. **Entering Sandbox (`handleToggleSandboxMode`)**:
   - Dispatches `POST /api/sandbox/enter?game_id={activeGameId}`.
   - The backend creates an in-memory clone (`SANDBOX_CHECKPOINTS[game_id]`).
   - The UI displays an amber indicator banner: `"WAR ROOM SANDBOX MODE ACTIVE"`.
2. **Multi-Power Operations**:
   - The player can switch across all 7 Great Powers without losing their current orders.
   - Orders for foreign units can be drafted to test theoretical defense combinations.
   - Clicking **"Simulate Turn"** displays how all hypothetical forces interact.
3. **Exiting Sandbox**:
   - Dispatches `POST /api/sandbox/exit?game_id={activeGameId}`.
   - The backend restores the pre-sandbox checkpoint.
   - The player's own active-power orders are merged back.
   - All foreign hypothetical orders are purged to prevent accidental submission.
4. **Clearing Foreign Orders**:
   - Dispatches `POST /api/sandbox/clear-foreign?game_id={activeGameId}`.
   - Cleans all hypothetical enemy orders while remaining in Sandbox mode.
