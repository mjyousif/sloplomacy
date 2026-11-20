# State Management & API Synchronization

The frontend architecture prioritizes server-authoritative truth, immediate reactive UI feedback, multiplayer lobby management, and risk-free hypothetical experimentation via Sandbox checkpointing.

---

## State Variables (`App.tsx`)

`App.tsx` keeps most of this state itself. Some of it comes from hooks named for what they do, and the table says which:

- `hooks/useGameSession.ts`: the open game (`activeGameId`, `activeGameSummary`), the player's seat (`lockedPower`, and `playerPower` derived from it by `resolvePlayerPower`), the passcodes typed this visit (`matchPasscodes`), whether the player is watching without a seat (`isSpectator`, from `isSpectating`) and the power a spectator looks at (`spectatorPower`, `setWatchedPower`), the board (`gameState`, `provinces`, `loading`, `errorMsg`) and the lobby's games (`gamesList`, `loadingGames`), with `fetchGame`, `fetchGamesList`, `fetchMyGames`, `applyServerState` and `boardRequestSeq`. It runs no effects.
- `hooks/useGameSync.ts`: what keeps them current: the socket (`useDiplomacyWebSocket`) and its two message handlers, the first load on mount, `handleTimerExpired`, and the fallback poll. App calls it later than `useGameSession`, where these effects have always run, so they keep their order among App's effects (after the display-prefs, layout-reset and turn-history effects, before `useSandboxExit`).
- `hooks/useSandboxSession.ts`: the sandbox tools. Hypothetical Mode (`sandboxMode`, the private copy's `sandboxGameId`, `sandboxOriginTurn`, `hypotheticalMatchTimer`, `showSimulationOverlay`, `handleToggleSandboxMode`, `handleClearForeignPreMoves`), what is worked out from the copy (`draftGameId`, `matchTimer`, `requireRealBoard`), the scenario reset (`handleLoadScenario`) and saving to an account (`saveSandboxModalOpen`, `savingSandbox`, `handleOpenSaveSandboxModal`, `handleSaveSandboxToAccount`). It runs no effects, and App calls it just before `useGameSync`, which reads `sandboxGameId` and `sandboxOriginTurn`.
- `hooks/useSandboxExit.ts`: the one effect that closes the private copy when the player leaves the match board by any route. App calls it right after `useGameSync`, where this effect has always run, so on leaving a match from Hypothetical Mode the socket switches before `POST /api/sandbox/exit` goes out.
- `hooks/useSidebarSelection.ts`: where the selected unit was picked. The selection is the one `selectedUnitId` the map and the sidebar share, so a unit picked on the map still lights its card and a unit picked on the sidebar still lights its provinces. `GameWorkspace` sends the sidebar's picks through `selectFromSidebar` and the map's through `selectFromMap`, and the hook's `suppressUnitMenu` tells the map not to float its unit menu over a unit whose card is already on screen. The next different selection, or the map re-picking the unit, ends it.
- `hooks/useMatchActions.ts`: what a player does in a match: `handleUpdateOrder`, `handleConfirmAllHolds`, `handleFinalizeClick` with the Sanity Check modal (`sanityModalOpen`, `sanityModalIssues`), `handleUnfinalizeClick`, `handleAdjudicateTurn` with its double-click guard, and the clock buttons (`postTimerAction`). It runs no effects.
- `hooks/useSpectate.ts`: watching a match without a seat. `watchGame(gameId, passcode?)` reads `GET /api/game` with no `power` (and `X-Passcode`), then opens it with `lockedPower` null; a player who already holds a seat there is taken into it instead. A refusal (`403` passcode, `429` too many tries, `404`) is shown as a toast and thrown, for the Join with code form. `handleSelectPower` changes only `watchedPower` for a spectator, and `spectator` (the passcode, `onClaimSeat`, `onLeave`) is what `GameWorkspace` and `MacroSidebar` read. App calls it after `useSeatActions`.
- `hooks/useGameRoute.ts`: the address bar. See [Game Links & Routing](#game-links--routing-usegameroute). App calls it after `useBoardExits`, and hands its `passcodeRequest` to `LobbyView`.
- `hooks/useBoardExits.ts`: the ways off the board on show, each asking first while Edit Board changes are staged (`confirmIfDirty`) and closing the admin tools: `handleBackToLobby` (keeps the seat, and returns false when the player chose to stay), `guardedEnterSoloSandbox`, `guardedResetSandbox`, `guardedDeleteSandbox`, `guardedSwitchToSoloSandbox`, `guardedSwitchToGame` and `guardedReturnToPreviousGame`. It runs no effects, and App calls it after `useSpectate`.
- `hooks/useSeatActions.ts`: taking and giving up a seat: `handleEnterSoloSandbox` (asking first when it leaves a match), `handleCreateMultiplayerGame`, `handleJoinOrEnterMultiplayerGame` (which keeps a typed passcode in `matchPasscodes`), the Surrender & Leave modal (`surrenderModalOpen`, `surrenderModalGame`, `surrenderModalPower`, `handleOpenSurrenderModal`), `handleSurrenderPower`, `handleLeaveGame`, and `handleSelectPower` for the power a sandbox player commands. It runs no effects, and App calls it after `useMatchActions`.
- `hooks/useAuthSession.ts`: who is signed in and the sign-in modal. It reads the saved user once on mount (`authReady` turns true once that first read is done, so a game link knows the player's seat) and then follows every sign-in and sign-out through `subscribeToAuthChanges`. `openAuthPrompt(reason?, tab?)` opens the modal with an optional reason banner and a tab (sign-in by default).
- `hooks/useWorkspaceLayout.ts`: the desktop rails (defaulting to left-collapsed below `1200px` and both-collapsed below `960px` via `NARROW_DESKTOP_QUERY` / `TABLET_COLLAPSED_QUERY`), the phone order sheet and the tools drawer, with the effect that resets the sheet and drawer.
- `useMobilePressSheet` (in `components/tools/press/MobilePressSheet.tsx`): used in `GameWorkspace` to coordinate the full-width phone Press sheet, focus return (`pressToggleRef`), and mutual exclusion with the Tools drawer.
- `hooks/useAdminDirectEdit.ts`: local board staging (`stagedUnits`, `stagedOwnership`, `stagedOrders`, `effectiveGameState`, `diffLines`), `AdminTileInspector` selection (`inspectedProvince`, `relocatingUnitId`), atomic batch commit (`POST /api/admin/board-edit` with `409 Conflict` detection), unapplied-edits confirmation guards (`confirmIfDirty`), and per-participant admin audit warning acknowledgement (`unacknowledgedAdminEntries`, `handleAcknowledgeAdminEntries`).
- `components/macro/useSheetSelection.ts`: not App state but the order sheet's own reaction to `selectedUnitId` (the phone has no hover, so it calls `onHighlightProvinces` for the selected unit's provinces, and raising the sheet scrolls that unit's card to the top). `utils/orderProgress.ts` holds the order panel's derived counts, recomputed on each render of `MacroSidebar` and never stored.
- `hooks/useToast.ts`: the toast banner and `triggerToast`.
- `hooks/usePress.ts` and `lib/pressStore.ts`: press (chat). This is the one piece of game data that is not App state. `pressStore` is a small store outside React holding the messages of the match on screen for the player's seat, how far each conversation was read, the countries picked as recipients of the next message (picked on the standings rows, used by the Press section), and whether the game socket is up. `useDiplomacyWebSocket` adds `press` socket messages to it, `usePressSync` (called by `GameWorkspace`) reads `GET /api/press` when the match, the seat or game-over changes, catches up with `?after=` when the socket comes back and polls while it is down, and `usePressState` / `usePressBadge` read it with `useSyncExternalStore`. That lets `PressSection`, the collapsed rail and the phone's ≡ button share it without props through App. The store drops anything for another match or seat, and is emptied when the player leaves the board. A spectator holds the match with `power` null: the public feed, its own read marks (`…:spectator`) and no recipients.
- `hooks/useSuggestion.ts` and `lib/suggestionStore.ts`: the move suggestion on the map. The store, outside React like `pressStore`, holds either the draft being written (`{ members, turn, orders }`) or the received message being looked at, never both. `PressSection` starts, lists and sends the draft; `useSuggestionBoard` (called by `GameWorkspace`) turns whichever is held into the board the map draws (the suggested orders, a plain hold for every other unit, and which units and powers are involved) and ends it when the turn resolves, the phase is not Movement, the game is over, the game screen is left, or the board is needed for Hypothetical Mode, Direct-Edit or a past turn. A draft never reaches the server or `gameState.orders` until it is sent as press. Taking a suggestion goes through `suggestionStore.adopt`, which `useMatchActions` registers because it holds `applyServerState`: one `POST /api/orders/batch` with the player's own units and the turn.

App renders four pieces, none of which keeps state; each takes one prop per value it uses, named as in App:

- `components/AppHeader.tsx`: passes the shared header state and handlers to either the desktop header (`components/header/TopHeader.tsx`) or the phone bar (`components/header/CompactTopBar.tsx`, sharing `TurnChronicle`, `GameSettingsMenu`, and `AccountDropdownMenu`), plus the toast banner.
- `LobbyView` in the lobby, or `components/GameWorkspace.tsx` on a board: the tools sidebar, the map with the clock and suggestion overlays over it, and the order sidebar. It also counts the other powers' changed orders for the tools sidebar. On a past turn it hands the map that turn, with the selection, hover, issues and order callbacks switched off.
- `components/AppModals.tsx`: the Sanity Check, Surrender & Leave, Save Sandbox (and its default name), admin action warning and sign-in modals, and the confirm prompt. They render on the lobby too.

The state the workspace alone uses (`mapRef`, `zoomPercent`, `hoveredUnitId`) and the turn-selector helpers (`showPastTurn`, `stepPastTurn`, `viewedEntry`) stay in App, so they survive a trip to the lobby as before.

| State Property | Type | Scope | Description |
| :--- | :--- | :--- | :--- |
| `viewMode` | `'lobby' \| 'sandbox' \| 'multiplayer'` | Router | High-level application mode (match browser vs tactical board). |
| `activeGameId` | `string` | Scoping | ID of the active game session, from `useGameSession`: the solo sandbox this browser remembers (`readStoredSoloSandboxId`), else `'proto_1901'`. |
| `activeGameSummary`| `MultiplayerGameSummary \| null` | Room | Metadata for current multiplayer match or saved sandbox, from `useGameSession`. |
| `lockedPower` | `Power \| null` | Match | Claimed sovereign power for active player in multiplayer matches, from `useGameSession`. `playerPower`, derived by `resolvePlayerPower`, is what the app uses as the player's power: this seat in multiplayer, `gameState.active_power` in a sandbox. |
| `authUser` | `AuthUser \| null` | Auth | Authenticated user profile from Supabase (or local dev mode), from `useAuthSession`. The sign-in modal's `onSuccess` also sets it. |
| `authModalOpen`, `authModalReason`, `authModalTab` | `boolean`, `string \| null`, `'signin' \| 'signup'` | Modal | The Supabase auth dialogue, from `useAuthSession`: whether it is open, the banner saying why it was asked for, and the tab asked for. `AuthModal` stays mounted while closed, so it resets its tab to `authModalTab` (and clears the typed email, password, name and messages) each time it opens, during render. |
| `displayPrefs` | `DisplayPrefs` | Display | This player's piece style and army and fleet marks, from `useDisplayPrefs`. |
| `gamesList` | `MultiplayerGameSummary[]` | Lobby | The player's own games (`GET /api/games/mine`: private campaigns and saved sandboxes included) followed by the public matches (`GET /api/games` and the lobby socket), each game once, from `useGameSession`. `setGamesList` replaces only the public part. |
| `gameState` | `GameState \| null` | Global | Authoritative match state received from FastAPI, from `useGameSession`. |
| `provinces` | `Record<string, ProvinceInfo>` | Global | Static map topology metadata, from `useGameSession`, sent with every board. |
| `selectedUnitId` | `string \| null` | UI | Currently selected military unit on the map or in the sidebar. |
| `hoveredUnitId` | `string \| null` | UI | Unit hovered for cross-component highlighting. Set from `onPointerEnter`/`onPointerLeave` on map pieces and sidebar cards, which ignore `pointerType === 'touch'`: a finger has no hover, so a tap would otherwise leave the highlight on. |
| `highlightedProvinces`| `string[]` | UI | Provinces highlighted during targeting or diagnostic inspection. |
| `sandboxMode` | `boolean` | Mode | True when user is in Hypothetical Mode (Eye icon, ephemeral what-if exploration), from `useSandboxSession`. |
| `sandboxGameId` | `string \| null` | Mode | Id of the ephemeral server-side copy used by Multiplayer Hypothetical Mode, or `null`, from `useSandboxSession`. Drafts, power switches, previews, and hypothetical `Step Turn Forward` resolves go to `draftGameId`, which is this id when set and `activeGameId` otherwise. |
| `sandboxOriginTurn` | `string \| null` | Mode | Live match turn label (`turnLabel(gameState)`) captured before entering Hypothetical Mode, from `useSandboxSession`. `useGameSync` uses it to auto-exit Hypothetical Mode when the real match advances to a new turn. |
| `simulationResult` | `SimulationResult \| null`| UI | The server's `preview` of the phase being played, a hypothetical `Step Turn Forward` resolution, or a past turn's resolution. |
| `showSimulationOverlay`| `boolean` | UI | Whether combat resolutions (arrows, bounces, cuts) are projected on the map, from `useSandboxSession`. |
| `adminModalOpen` | `boolean` | Admin | Controls visibility of the game creator's Turn and Clock Settings sidebar panel (`AdminTurnClockSidebar`). |
| `adminOverrideActive`| `boolean` | Admin | The host's Direct-Edit toggle. It only takes effect through the derived `directEditActive`, which also requires `isGameCreator`, so it does nothing in a game the player does not host. |
| `leftSidebarCollapsed`| `boolean` | UI | Whether the Left Tools Sidebar is collapsed into a 44px rail, from `useWorkspaceLayout`. Desktop only: phones have no rails. The sidebar floats over the map, so this never moves the camera. |
| `rightSidebarCollapsed`| `boolean` | UI | Whether the Right Tactical Sidebar is collapsed into a 44px rail, from `useWorkspaceLayout`. Desktop only. |
| `sheetSnap` | `'peek' \| 'half' \| 'full'` | UI (phone) | Where the phone order sheet sits, from `useWorkspaceLayout`. It goes back to `'peek'` whenever the game, the view or the layout changes, and drops to `'peek'` when `EuropeMap` reports through `onDockedBarChange` that its docked unit bar is up. |
| `toolsDrawerOpen` | `boolean` | UI (phone) | Whether the tools drawer is open, from `useWorkspaceLayout`. ≡ toggles it, and it shuts when the game, the view or the layout changes. Closing it hands focus back to ≡ (`toolsToggleRef`). |
| `zoomPercent` | `number` | UI | Map zoom percentage (default: `105`, more on a phone). `EuropeMap` reports it at most once per frame and after a pinch ends, so zooming doesn't re-render App on every event. |
| `isCompact` | `boolean` | Layout | True on phone-sized screens, from `useCompactLayout()`. It follows rotation and resizes. App writes it on the shell as `data-layout`, which the `@layer compact` blocks of the `*.module.css` files style, and `AppHeader` uses it to swap in `CompactTopBar` for `TopHeader`. |
| `surrenderModalOpen` | `boolean` | Modal | Controls visibility of the Surrender / Civil Disorder confirmation modal, from `useSeatActions`, with the game and power it is for (`surrenderModalGame`, `surrenderModalPower`). |
| `sanityModalOpen` | `boolean` | Modal | Controls visibility of pre-finalization warning modal, from `useMatchActions`. |
| `sanityModalIssues` | `ValidationIssue[]` | Modal | Issues displayed inside the Sanity Check modal, from `useMatchActions`. |
| `saveSandboxModalOpen` | `boolean` | Modal | Controls visibility of modal to name and save/promote a draft sandbox, from `useSandboxSession`. |
| `savingSandbox` | `boolean` | UI | True while saving or promoting a sandbox session via the API, from `useSandboxSession`. |
| `hypotheticalMatchTimer` | `PhaseTimer \| null` | Multiplayer | The real match's clock while `sandboxGameId` is set, because the private copy has none, from `useSandboxSession`. Components read the derived `matchTimer`. |
| `turnHistory` | `TurnHistory` | History | From `useTurnHistory`: the resolved phases (`entries`), the one on show (`viewIndex`, `null` = live), its `TurnRecord` (`turn`) and the nation chip (`power`). The list is refetched whenever the live turn changes, which covers WebSocket updates and rollbacks. If the phase on show has moved it is found again by season, year and phase, and if it is gone the view goes back to live. Records are cached until the list is refetched. It always reads `activeGameId`, never `sandboxGameId`, and sends the passcode the player typed for a private match as `X-Passcode`. While `turn` is set, the map shows that turn read-only and the orders panel is dimmed (`viewingHistory`). |
| `toastBanner` | `string \| null` | Banner | Auto-expiring toast message for user notifications, from `useToast`. A new message replaces the one showing, and each clears itself after 4.5 seconds unless a different message has replaced it. |
| `wsConnected` | `boolean` | Network | Active real-time WebSocket connection to room feed or lobby, from `useGameSync`. |

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
         ├──► setSimulationResult(st.preview)
         └──► Triggers re-render of map arrows & diagnostics
```

---

## Lobby & Match Management Flow

1. **Viewing Matches (`GET /api/games`, `GET /api/games/mine`, `GET /api/games/browse`)**:
   - `useGameSession` keeps the lobby list: the player's own games from `/api/games/mine` (private campaigns and saved sandboxes included) merged with the public list from `/api/games` and the lobby socket.
   - **A player with games** gets the map-first homepage. `sortMyGames` (`utils/heroGame.ts`) orders their games: the ones waiting on their orders first (soonest clock deadline first, untimed ones after), then the ones waiting on others, finished campaigns, and saved sandboxes; ties go to a game that has resolved a turn, then to the most recently played. `pickHeroGame` takes the first that is not a sandbox for `lobby/FeaturedGameHero.tsx`, and the rest go to `lobby/OtherGamesStrip.tsx`. Both draw `lobby/MiniMap.tsx` from the summary's `board`, which only `GET /api/games/mine` sends; a game with no `board` yet draws the bare map. Leave, Surrender and Delete sit behind the ⋯ menu (`lobby/GameActionsMenu.tsx`) and still open the surrender dialog.
   - **A guest, or a player with no games** (or only saved sandboxes), keeps the `LobbyHero` banner. `MyGamesSection` now holds only the guest's sign-in box and the no-games hint.
   - The public games are the browser (`lobby/GameBrowser.tsx`). `lobby/hooks/useLobbyBrowse.ts` holds its filters (seats open, full or all; countries that must be free; a turn at, before or after a season and year) and its page, and asks `GET /api/games/browse` for that one page. Changing a filter goes back to page 1, an older reply never replaces a newer one, and a page emptied since the last look steps back to the new last page. The lobby list is its refresh signal: whenever the lobby socket or Refresh replaces it, the open page is asked for again, so a seat someone just took turns taken without a reload. The query and the row helpers are pure functions in `utils/lobbyBrowse.ts`.
   - Each row (`lobby/GameBrowserRow.tsx`) shows the name, turn, host and a strip of the seven seats, each `data-seat` `free`, `taken` or `mine`, with its buttons. A browse row carries no user ids, so the player's seat comes from their own games (`myPowerIn`): a game they are in offers **Resume**; otherwise **Watch** opens it without a seat (signed out too) and **Join** opens the row into the seats, where a seat is claimed. A guest's claim opens the sign-in prompt. Public games never have a passcode, so the browser never asks for one; private games are joined, or watched with **Watch without a seat**, from **Join with code**.
2. **Creating a Match (`POST /api/games`)**:
   - Users create custom rooms or isolated sandboxes.
   - The lobby's **Host game** and **Join with code** buttons (`lobby/LobbyActionRow.tsx`) each open their form in a dialog (`lobby/LobbyFormDialog.tsx`: closes on Escape, the ✕ or a click outside). `LobbyView` holds only which dialog is open. The fields and submit handlers live in `lobby/hooks/useHostGameForm.ts` and `useJoinWithCodeForm.ts`, so what was typed survives closing the dialog, and an old error is cleared when it opens again. A dialog closes itself once the game is created or the seat claimed, or when a guest is sent to sign in.
3. **Joining & Claiming Seats (`POST /api/games/{id}/join`)**:
   - Claims an available Great Power for the user, setting `lockedPower` so moves cannot be submitted for rival nations.
   - Joining never changes what other players see: the server leaves the shared game's `active_power` alone in multiplayer.
4. **Surrender & Civil Disorder (`POST /api/games/{id}/surrender`)**:
   - When a player concedes, the power enters Civil Disorder, defaulting to passive hold without player command.
5. **Leaving / Vacating (`POST /api/games/{id}/leave`)**:
   - Frees the claimed seat or deletes saved sandboxes.
6. **Watching (`useSpectate`)**:
   - Opens a match with `viewMode` `multiplayer` and `lockedPower` null. `isSpectating` is that state, and while it holds the client never sends a `power` (`fetchGame`, the fallback poll, the socket and press): without a token, a named `power` would claim a seat taken without an account.
   - The map takes no clicks (`readOnly`), Hypothetical Mode is hidden (it needs a seat), and press is the public box alone (`pressStore` with `power` null, which the socket's `power: null` pushes land in). Leaving does not remember the match as the previous game, since there is no seat to return to.

## Game Links & Routing (`useGameRoute`)

There is no router library: the address bar is kept by `hooks/useGameRoute.ts`, and the pure pieces (`parseGameRoute`, `isLinkableGameId`, `urlFor`, `gameLink`) are in `utils/gameRoute.ts`.

- **Addresses.** A multiplayer match is at `/game/<id>` and everything else is `/`. Only `mp_` ids are linkable: a `solo_`, `saved_` or `sbx_` sandbox belongs to one player (`saved_sandbox_guard`), and `proto_1901` has no lobby summary to open it by, so a link to any of them opens the lobby. `?view=sandbox` and `#sandbox` still open the Solo Sandbox (`initialViewMode`), and a sandbox opened that way keeps its address; any other sandbox is at `/`, so a reload opens the lobby as it always has.
- **Opening a link** (on load, once `authReady`, and on Forward/Back to a game) reads `GET /api/games/{id}`:
  - a player who holds a seat there (`myPowerIn`) is taken into it through `handleJoinOrEnterMultiplayerGame`;
  - otherwise, a private match (`has_passcode`) whose passcode was not typed this visit opens the lobby's **Join with code** dialog with the Game ID filled in (`passcodeRequest`, which `LobbyView` turns into `join.prefill(id)` and the open dialog);
  - otherwise the match is watched (`watchGame`);
  - a `404` (or any other refusal) shows the lobby and a toast.
- **Keeping the address in step.** Each change of `viewMode` or `activeGameId` is a `pushState`, so Back goes from a match to the lobby. The first write after a load is a `replaceState`, so Back never lands on the page that was just replaced. While a link or a Back/Forward is being followed the address is left alone, and written once the screen has settled. The address never holds a passcode; a private match's link asks for it.
- **Back and Forward** (`popstate`): to `/`, the board is left through `handleBackToLobby`, which keeps the seat; if the player chooses to keep staged Edit Board changes, the game's address is pushed back. To `/game/<id>`, another board is left through the lobby first (closing its private sandbox), then the link is opened as above. To `?view=sandbox`, the Solo Sandbox opens.
- **Copy game link.** The top-bar `GameSettingsMenu` (desktop and phone) has **Copy game link** in a multiplayer match, for players and spectators alike, and `PrivateCampaignCreatedModal` shows the link beside the Game ID and passcode. Both copy `location.origin + '/game/' + id` through `hooks/useCopyFeedback.ts`, which `LobbyView` also uses for its Copy buttons.
- **Serving the path.** The Vite dev server answers any path with `index.html`, and in production `backend/main.py`'s `serve_spa` does the same for every path that is not a file, `/api/`, `/ws/` or the API docs. Built assets are linked as `/assets/...` (Vite's `base` is unset), so they load from `/game/<id>` too.

---

## Hypothetical Mode & State Isolation

When a user enables **Hypothetical Mode** (`Eye` icon in tools sidebar):

1. **Entering Hypothetical Mode (`handleToggleSandboxMode`)**:
   - Captures `sandboxOriginTurn` from the live board's `turnLabel(gameState)` before applying the sandbox state.
   - Dispatches `POST /api/sandbox/enter?game_id={activeGameId}`.
   - In a multiplayer match the backend returns (or resumes, if on the same live turn) an ephemeral private copy (`sbx_`) stored in `sandboxGameId`. Elsewhere it checkpoints the real board (`SANDBOX_CHECKPOINTS[game_id]`) and resumes any same-turn `SANDBOX_BRANCHES[game_id]`.
   - The UI displays an indicator banner: `"HYPOTHETICAL PLANNING & OUTCOME PREVIEW"`.
2. **Multi-Power Operations, Move Visibility & Stepping Turns**:
   - Clicking any nation in Diplomatic Standings switches active command (`handleSelectPower` posts to `draftGameId`, allowed in multiplayer when `sandboxMode` is true via `resolvePlayerPower(..., sandboxMode)`).
   - `GameWorkspace` holds `showAllSandboxMoves` (`All Moves` vs `Selected Nation` in `StandingsSection`) so commanders can view all 7 powers' orders or focus on `activePower`.
   - `Step Turn Forward` (`handleAdjudicateTurn`) adjudicates `draftGameId` when `sandboxMode` is true, advancing the ephemeral branch across turns without touching the live match.
   - The outcome overlay is on while in Hypothetical Mode, so the map shows how all hypothetical forces interact.
3. **Exiting Hypothetical Mode & Live Turn Advancement**:
   - Dispatches `POST /api/sandbox/exit?game_id={draftGameId}`.
   - The backend restores the real match or pre-sandbox checkpoint and real orders without mutating real game state (never carrying hypothetical orders back to the live match).
   - The ephemeral branch (`sbx_` or `SANDBOX_BRANCHES`) persists across exit/re-enter for the duration of the live turn and is erased when the real turn ends (resolution, admin rollback/set-turn/board-edit, scenario load/seed).
   - While `sandboxGameId` is set, if `useGameSync` receives a WebSocket update or poll response whose `turnLabel` differs from `sandboxOriginTurn`, it automatically exits Hypothetical Mode, clears `sandboxGameId` / `sandboxOriginTurn`, applies the live board, and notifies the player with a toast.
4. **Clearing Foreign Orders**:
   - Dispatches `POST /api/sandbox/clear-foreign?game_id={draftGameId}`.
   - Cleans all hypothetical enemy orders while remaining in Hypothetical Mode.

While `sandboxGameId` is set, the board shows the ephemeral private copy and is kept apart from the real match:

- WebSocket updates (and fallback polling when disconnected) for the match update `activeGameSummary` and `hypotheticalMatchTimer`. The clock continues to run via WebSocket heartbeats or fallback polling.
- Finalize, Unlock, Surrender and the Admin Console are refused with a toast (`requireRealBoard`), because they act on the real match and the player would be looking at a hypothetical board.
- Leaving the match view by any route closes Hypothetical Mode through the effect in `useSandboxExit`, which watches `viewMode`.

### Solo Sandbox Isolation, Session Persistence & In-Place Promotion

1. **Entering, Resuming & Exporting to Solo Sandbox (`handleEnterSoloSandbox`)**:
   - Reads `sloplomacy_solo_sandbox_id` from `localStorage` (`readStoredSoloSandboxId`) and dispatches `POST /api/games/solo-sandbox` (passing `?resume_game_id=<storedId>` when present).
   - When invoked from any active board (`viewMode !== 'lobby'`), also sends `source_game_id` (`draftGameId ?? activeGameId`) and any match `X-Passcode`: the backend validates view access, sanitizes live multiplayer state (masking opponent orders to `HOLD`), deletes any previous draft sandbox (`solo_*`, `is_draft: true`), and creates a new draft seeded from that snapshot, resetting `sandboxGameId` to `null`.
   - From the lobby, if the stored draft ID is still active (or if the signed-in user already owns an unpromoted draft), the backend resumes it with all orders and turns intact. Otherwise, it initializes a fresh isolated draft sandbox (`solo_<uuid>`, `is_sandbox: true`, `is_draft: true`) and stores the ID in `localStorage`.
   - Draft sandboxes are excluded from public lobby lists and `/ws/lobby` broadcasts, ensuring that two visitors launching Solo Sandbox never interact or see each other's moves.
2. **Promoting to Saved Sandbox (`handleSaveSandboxToAccount`)**:
   - Clicking "Save Sandbox" opens `SaveSandboxModal` (`saveSandboxModalOpen = true`), allowing the commander to specify a custom name.
   - Dispatches `POST /api/games/save-sandbox` with the custom name and caller's credentials.
   - For draft sandboxes (`is_draft: true`), the backend promotes the session in-place (`is_draft: false`), updates the name and creator attribution, and records it in the saved games list. The frontend clears `sloplomacy_solo_sandbox_id` so future Solo Sandbox launches start a fresh draft while the promoted scenario remains in the user's saved campaigns.


---

## Real-Time WebSocket Synchronization (`useDiplomacyWebSocket`)

To guarantee seamless multiplayer coordination, the frontend maintains a persistent WebSocket connection via the custom hook `useDiplomacyWebSocket`, which `useGameSync` calls with its two handlers:

```
                           CLIENT BROWSER (useGameSync)
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │ viewMode === 'lobby'                              │ viewMode !== 'lobby'
            ▼                                                   ▼
     ws://.../ws/lobby                                   ws://.../ws/games/{activeGameId}
            │                                                   │
            ▼                                                   ▼
  handleWsLobbyUpdate                                  handleWsGameUpdate
  - Update gamesList (public part)                     - Update gameState
  - Re-read /api/games/mine
  - Update participant counts                          - Update activeGameSummary
                                                       - Trigger phase-advance toast
```

### Key Capabilities:
1. **Live Room State Synchronization**:
   - Order submissions, finalizations, adjudications, and admin overrides by other players are immediately pushed to all connected clients without page reloads.
2. **Phase Advance Alerts**:
   - Automatically detects when `season`, `year`, or `phase` transitions occur and triggers a persistent toast announcement to notify the commander.
3. **Connection Resilience**:
   - Sends a `{ type: 'ping' }` heartbeat every 25 seconds to keep proxies and serverless Cloud Run instances active. Each socket owns its heartbeat, and a late close event from a replaced socket is ignored.
   - Reconnects 2 seconds after an unexpected drop. It stops for good on `4004` (game deleted), `4403` (passcode missing or wrong) and `4429` (too many wrong passcodes), because a retry cannot fix them (`shouldReconnect`). The fallback HTTP poll then takes over.
   - Game sockets ask for the auth handshake (`?handshake=1`) and send `{ type: 'auth', token }` as their first message, with the token from `getAuthHeaders`. The server works out the player's seat from it, so it shows them their own orders and lets a seated player into a private match without the passcode. The socket reconnects when the player signs in or out (`authKey`).
   - The passcode a player types when joining or watching a private match is kept in `matchPasscodes` for this visit only and sent with the socket, `fetchGame` and the fallback poll (`X-Passcode`), for anyone not yet seated.
   - When the turn clock reaches zero, `PhaseTimerWidget` calls `onExpire`, and the app sends `{ type: 'refresh' }`. Only `refresh` makes the server run the clock; `ping` just keeps the connection open. Without a socket, the fallback poll runs the clock within 4 seconds. The countdown keeps `onExpire` in a ref, so a new callback never restarts it from an old server value.
5. **Requests and stale replies**:
   - Every call that acts on a game sends the player's token, through `authedFetch` (`lib/supabase.ts`) or `getAuthHeaders`. The server finds the player's seat and their saved sandboxes from it, so a call sent without it is treated as a stranger's.
   - `handleAdjudicateTurn` (in `useMatchActions`) ignores a click while a resolve is in flight and sends the turn it means (`?turn=`), so a double-click resolves one phase.
   - `fetchGame` (in `useGameSession`) and joining a match bump `boardRequestSeq`. A `GET /api/game` reply that comes back after a newer request is dropped, so the startup load of `proto_1901` cannot replace a match the player has just joined.
6. **Visual Telemetry**:
   - On phones, the `⋯` overflow menu displays the real-time connection row (`Live Sync` or `Connecting…`, plus an amber dot on `⋯` when offline).
