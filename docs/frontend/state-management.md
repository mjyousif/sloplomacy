# State Management & API Synchronization

The frontend architecture prioritizes server-authoritative truth, immediate reactive UI feedback, multiplayer lobby management, and risk-free hypothetical experimentation via Sandbox checkpointing.

---

## State Variables (`App.tsx`)

| State Property | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `viewMode` | `'lobby' \| 'sandbox' \| 'multiplayer'` | Router | High-level application mode (match browser vs tactical board). |
| `activeGameId` | `string` | Scoping | ID of the active game session (default: `'proto_1901'`). |
| `currentGameSummary`| `MultiplayerGameSummary \| null` | Room | Metadata for current multiplayer match or saved sandbox. |
| `lockedPower` | `Power \| null` | Match | Claimed sovereign power for active player in multiplayer matches. `playerPower`, derived by `resolvePlayerPower`, is what the app uses as the player's power: this seat in multiplayer, `gameState.active_power` in a sandbox. |
| `authUser` | `AuthUser \| null` | Auth | Authenticated user profile from Supabase (or local dev mode). |
| `authModalOpen` | `boolean` | Modal | Controls visibility of Supabase auth dialogue. |
| `displayPrefs` | `DisplayPrefs` | Display | This player's piece style and army and fleet marks, from `useDisplayPrefs`. |
| `gamesList` | `MultiplayerGameSummary[]` | Lobby | Roster of public matches, lobbies, and sandboxes. |
| `gameState` | `GameState \| null` | Global | Authoritative match state received from FastAPI. |
| `provinces` | `Record<string, ProvinceInfo>` | Global | Static map topology metadata fetched once on bootstrap. |
| `selectedUnitId` | `string \| null` | UI | Currently selected military unit on the map or in the sidebar. |
| `hoveredUnitId` | `string \| null` | UI | Unit hovered for cross-component highlighting. |
| `highlightedProvinces`| `string[]` | UI | Provinces highlighted during targeting or diagnostic inspection. |
| `sandboxMode` | `boolean` | Mode | True when user is in Hypothetical Mode (Eye icon, guessing opponent moves). |
| `sandboxGameId` | `string \| null` | Mode | Id of the private server-side copy used by a multiplayer sandbox, or `null`. Drafts, AI plans and previews go to `draftGameId`, which is this id when set and `activeGameId` otherwise. |
| `simulationResult` | `SimulationResult \| null`| UI | Cached non-destructive simulation preview from the server. |
| `showSimulationOverlay`| `boolean` | UI | Whether combat resolutions (arrows, bounces, cuts) are projected on the map. |
| `adminModalOpen` | `boolean` | Modal | Controls visibility of the game creator's Admin Tools modal. |
| `adminOverrideActive`| `boolean` | Admin | The host's Direct-Edit toggle. It only takes effect through the derived `directEditActive`, which also requires `isGameCreator`, so it does nothing in a game the player does not host. |
| `leftSidebarCollapsed`| `boolean` | UI | Whether the Left Tools Sidebar is collapsed into a 44px rail. |
| `rightSidebarCollapsed`| `boolean` | UI | Whether the Right Tactical Sidebar is collapsed into a 44px rail. |
| `zoomPercent` | `number` | UI | Real-time map zoom percentage (default: `105`). |
| `surrenderModalOpen` | `boolean` | Modal | Controls visibility of the Surrender / Civil Disorder confirmation modal. |
| `sanityModalOpen` | `boolean` | Modal | Controls visibility of pre-finalization warning modal. |
| `sanityModalIssues` | `ValidationIssue[]` | Modal | Issues displayed inside the Sanity Check modal. |
| `hypotheticalMatchTimer` | `PhaseTimer \| null` | Multiplayer | The real match's clock while `sandboxGameId` is set, because the private copy has none. Components read the derived `matchTimer`. |
| `toastBanner` | `string \| null` | Banner | Auto-expiring toast message for user notifications. |
| `wsConnected` | `boolean` | Network | Active real-time WebSocket connection to room feed or lobby. |

---

## Display Preferences (`useDisplayPrefs`)

`hooks/useDisplayPrefs.ts` holds each player's choice of piece style and marks. It never touches game state or the FastAPI backend, because it only changes what that player sees.

| Situation | What happens |
| :--- | :--- |
| Page load | The copy in `localStorage` applies at once, so the wrong style never flashes. Anyone with none gets `DEFAULT_DISPLAY_PREFS`. |
| Changing a setting | Applies immediately and saves on the device, then saves to the account after 600ms, so clicking through options doesn't send a request per click. |
| Signing in, account has a saved value | The account wins, and the device copy is updated. |
| Signing in, account has none | The device's choice is uploaded. Someone who never chose uploads nothing, so they keep following the default. |
| Changing a setting while the account is loading | The newer change is kept and saved over what the account held. |
| An account read or save fails | The local value stays, and the menu says so. **A failed read is never treated as an empty account**, because the upload that follows would overwrite the player's saved choice. |
| Signing out | The device keeps its last choice. |

Accounts store the value in Supabase `user_metadata.display_prefs`, next to `display_name`. It needs no table, migration or backend route. `fetchAccountDisplayPrefs` calls `supabase.auth.getUser()` rather than reading the cached session, so a choice made on another device appears on the next page load. Tabs already open pick up a change on their next load.

Players can edit their own metadata, so everything read back goes through `sanitizeDisplayPrefs` before it reaches the map. Local demo accounts use a per-user `localStorage` key instead, so the same flow works without Supabase.

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
         │      Payload: { order: Order, turn: "Spring 1901 Movement" }
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
   - Joining never changes what other players see: the server leaves the shared game's `active_power` alone in multiplayer.
4. **Surrender & Civil Disorder (`POST /api/games/{id}/surrender`)**:
   - When a player concedes, the power enters Civil Disorder, defaulting to passive hold without player command.
5. **Leaving / Vacating (`POST /api/games/{id}/leave`)**:
   - Frees the claimed seat or deletes saved sandboxes.

---

## Hypothetical Mode & State Isolation

When a user enables **Hypothetical Mode** (`Eye` icon in tools sidebar):

1. **Entering Hypothetical Mode (`handleToggleSandboxMode`)**:
   - Dispatches `POST /api/sandbox/enter?game_id={activeGameId}`.
   - In a multiplayer match the backend returns a private copy with its own `game_id`, stored in `sandboxGameId`. Elsewhere it creates an in-memory clone (`SANDBOX_CHECKPOINTS[game_id]`).
   - The UI displays an indicator banner: `"HYPOTHETICAL PLANNING & OUTCOME PREVIEW"`.
2. **Multi-Power Operations**:
   - The player can assign orders to foreign units to test opponent combinations and battle predictions.
   - Clicking **"Simulate Turn"** displays how all hypothetical forces interact.
3. **Exiting Hypothetical Mode**:
   - Dispatches `POST /api/sandbox/exit?game_id={draftGameId}`.
   - The backend restores the pre-sandbox checkpoint, or discards the private copy and returns the real match.
   - The player's own active-power orders are preserved. In a multiplayer match that needs the match to still be on the same turn; if it moved on, a toast says the sandbox orders were not kept.
   - All foreign hypothetical orders are purged to prevent accidental submission.
4. **Clearing Foreign Orders**:
   - Dispatches `POST /api/sandbox/clear-foreign?game_id={draftGameId}`.
   - Cleans all hypothetical enemy orders while remaining in Hypothetical mode.

While `sandboxGameId` is set, the board shows the private copy and is kept apart from the real match:

- WebSocket updates (and fallback polling when disconnected) for the match update `activeGameSummary` and `hypotheticalMatchTimer`. The clock continues to run via WebSocket heartbeats or fallback polling. A deadline can pass here, and orders in the copy reach the match only on exit, so the timer widget warns the player. Exiting brings the board back up to date.
- Finalize, Unlock, Resolve, Surrender and the Admin Console are refused with a toast (`requireRealBoard`), because they act on the real match and the player would be looking at a hypothetical board.
- Leaving the match view by any route closes the sandbox through the effect that watches `viewMode`.


---

## Real-Time WebSocket Synchronization (`useDiplomacyWebSocket`)

To guarantee seamless multiplayer coordination, the frontend maintains a persistent WebSocket connection via the custom hook `useDiplomacyWebSocket`:

```
                           CLIENT BROWSER (App.tsx)
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │ viewMode === 'lobby'                              │ viewMode !== 'lobby'
            ▼                                                   ▼
     ws://.../ws/lobby                                   ws://.../ws/games/{activeGameId}
            │                                                   │
            ▼                                                   ▼
  handleWsLobbyUpdate                                  handleWsGameUpdate
  - Update gamesList                                   - Update gameState
  - Update participant counts                          - Update activeGameSummary
                                                       - Trigger phase-advance toast
```

### Key Capabilities:
1. **Live Room State Synchronization**:
   - Order submissions, finalizations, adjudications, and admin overrides by other players are immediately pushed to all connected clients without page reloads.
2. **Phase Advance Alerts**:
   - Automatically detects when `season`, `year`, or `phase` transitions occur and triggers a persistent toast announcement to notify the commander.
3. **Connection Resilience**:
   - Sends a `{ type: 'ping' }` heartbeat every 25 seconds to keep proxies and serverless Cloud Run instances active.
   - Automatically reconnects with exponential backoff on unexpected connection drops.
4. **Visual Telemetry**:
   - The header displays a real-time badge (`.header-ws-badge`):
     - `Live Sync` with a pulsating green indicator when actively connected.
     - `Connecting...` with amber indicator during connection attempts or fallbacks.
