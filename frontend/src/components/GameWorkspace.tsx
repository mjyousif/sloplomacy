import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useState,
} from 'react';
import { usePressSync } from '../hooks/usePress';
import { useSidebarSelection } from '../hooks/useSidebarSelection';
import { useSuggestionBoard } from '../hooks/useSuggestion';
import type { TurnHistory } from '../hooks/useTurnHistory';
import { suggestionStore } from '../lib/suggestionStore';
import type {
  GameState,
  MultiplayerGameSummary,
  Order,
  PhaseTimer,
  Power,
  ProvinceInfo,
  SimulationResult,
  TurnHistoryEntry,
  TurnRecord,
  ValidationIssue,
} from '../types/diplomacy';
import type { DisplayPrefs } from '../utils/displayPrefs';
import { supplyCenterOwners } from '../utils/powerHelpers';
import type { SheetSnap } from '../utils/sheetHelpers';
import { turnLabel } from '../utils/timerHelpers';
import {
  type DirectEditMapHandlers,
  EuropeMap,
  type EuropeMapHandle,
} from './EuropeMap';
import styles from './GameWorkspace.module.css';
import { PhaseTimerWidget } from './game/PhaseTimerWidget';
import { MacroSidebar } from './MacroSidebar';
import type { AdminTurnClockSettings } from './macro/AdminTurnClockSidebar';
import type { HistoryHighlightFocus } from './macro/HistoryTurnPanel';
import { SuggestionPill } from './map/hud/SuggestionPill';
import { ToolsSidebar } from './ToolsSidebar';
import type { PressSectionProps } from './tools/PressSection';
import {
  MobilePressSheet,
  useMobilePressSheet,
} from './tools/press/MobilePressSheet';

// Stable empties for a past turn, so memoized layers are not rebuilt every render.
const NO_ISSUES: ValidationIssue[] = [];
const NO_PROVINCES: string[] = [];
const NO_POWERS: Power[] = [];

export interface GameWorkspaceProps {
  viewMode: 'sandbox' | 'multiplayer';
  isCompact: boolean;
  gameState: GameState;
  provinces: Record<string, ProvinceInfo>;
  activeGameSummary: MultiplayerGameSummary | null;
  playerPower: Power;
  /** The seat this player holds in a multiplayer match. */
  lockedPower: Power | null;
  /** From `useWorkspaceLayout`. */
  leftSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  rightSidebarCollapsed: boolean;
  setRightSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
  sheetSnap: SheetSnap;
  setSheetSnap: Dispatch<SetStateAction<SheetSnap>>;
  toolsDrawerOpen: boolean;
  closeToolsDrawer: () => void;
  handleDockedBarChange: (visible: boolean) => void;
  /** The turn selector, and the past turn on the map (null for the live turn). */
  turnHistory: TurnHistory;
  historyTurn: TurnRecord | null;
  viewedEntry: TurnHistoryEntry | null;
  mapRef: RefObject<EuropeMapHandle | null>;
  zoomPercent: number;
  setZoomPercent: Dispatch<SetStateAction<number>>;
  displayPrefs: DisplayPrefs;
  onToggleUiSpacing?: () => void;
  selectedUnitId: string | null;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
  hoveredUnitId: string | null;
  setHoveredUnitId: Dispatch<SetStateAction<string | null>>;
  highlightedProvinces: string[];
  setHighlightedProvinces: Dispatch<SetStateAction<string[]>>;
  simulationResult: SimulationResult | null;
  /** From `useSandboxSession`. */
  sandboxMode: boolean;
  sandboxGameId: string | null;
  showSimulationOverlay: boolean;
  setShowSimulationOverlay: Dispatch<SetStateAction<boolean>>;
  matchTimer: PhaseTimer | null;
  handleToggleSandboxMode: () => void;
  handleClearForeignPreMoves: () => void;
  handleLoadScenario: (scenarioId: string) => void;
  handleOpenSaveSandboxModal: () => void;
  /** From `useMatchActions` and `useGameSync`. */
  handleUpdateOrder: (order: Order) => void;
  handleClearAllOrders: () => void;
  handleFinalizeClick: (force?: boolean) => void;
  handleUnfinalizeClick: () => void;
  handleAdjudicateTurn: () => void;
  postTimerAction: (
    action: 'start' | 'vote' | 'extend' | 'ready',
    body?: Record<string, unknown>,
  ) => void;
  handleTimerExpired: () => void;
  /** From `useSeatActions`. */
  handleSelectPower: (power: Power) => void;
  /** The host's tools. */
  isGameCreator: boolean;
  directEditActive: boolean;
  directEdit?: DirectEditMapHandlers;
  turnClockSettings?: AdminTurnClockSettings;
}

/**
 * The game screen of a sandbox or a match: the tools sidebar (a drawer on a phone), the map
 * with the turn clock over it, and the order sidebar (a pull-up sheet on a phone). A past turn
 * from the turn selector is drawn on the map with nothing on it selectable. A move suggestion
 * from press takes the board the same way: the map holds its orders and the order sidebar is
 * locked, so the player's real orders stay as they are.
 */
export function GameWorkspace({
  viewMode,
  isCompact,
  gameState,
  provinces,
  activeGameSummary,
  playerPower,
  lockedPower,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  sheetSnap,
  setSheetSnap,
  toolsDrawerOpen,
  closeToolsDrawer,
  handleDockedBarChange,
  turnHistory,
  historyTurn,
  viewedEntry,
  mapRef,
  zoomPercent,
  setZoomPercent,
  displayPrefs,
  onToggleUiSpacing,
  selectedUnitId,
  setSelectedUnitId,
  hoveredUnitId,
  setHoveredUnitId,
  highlightedProvinces,
  setHighlightedProvinces,
  simulationResult,
  sandboxMode,
  sandboxGameId,
  showSimulationOverlay,
  setShowSimulationOverlay,
  matchTimer,
  handleToggleSandboxMode,
  handleClearForeignPreMoves,
  handleLoadScenario,
  handleOpenSaveSandboxModal,
  handleUpdateOrder,
  handleClearAllOrders,
  handleFinalizeClick,
  handleUnfinalizeClick,
  handleAdjudicateTurn,
  postTimerAction,
  handleTimerExpired,
  handleSelectPower,
  isGameCreator,
  directEditActive,
  directEdit,
  turnClockSettings,
}: GameWorkspaceProps) {
  const viewingHistory = historyTurn !== null;
  const ignore = () => {};
  const [showAllSandboxMoves, setShowAllSandboxMoves] = useState<boolean>(true);
  const [hoveredHistoryFocus, setHoveredHistoryFocus] =
    useState<HistoryHighlightFocus | null>(null);
  const [pinnedHistoryFocus, setPinnedHistoryFocus] =
    useState<HistoryHighlightFocus | null>(null);
  const [prevHistoryTurn, setPrevHistoryTurn] = useState(historyTurn);
  const [prevHistoryPowers, setPrevHistoryPowers] = useState(
    turnHistory.powers,
  );
  if (
    prevHistoryTurn !== historyTurn ||
    prevHistoryPowers !== turnHistory.powers
  ) {
    setPrevHistoryTurn(historyTurn);
    setPrevHistoryPowers(turnHistory.powers);
    setHoveredHistoryFocus(null);
    setPinnedHistoryFocus(null);
  }
  const activeHistoryFocus = viewingHistory
    ? (hoveredHistoryFocus ?? pinnedHistoryFocus)
    : null;
  const isMultiplayer = viewMode === 'multiplayer';
  const ownPower = lockedPower ?? playerPower;
  const { selectFromSidebar, selectFromMap, suppressUnitMenu } =
    useSidebarSelection(selectedUnitId, setSelectedUnitId);
  // Press is for a seated player of a multiplayer match. The summary names the match even
  // while the board shows the player's private sandbox copy of it.
  const pressGameId =
    viewMode === 'multiplayer' && lockedPower && !activeGameSummary?.is_sandbox
      ? (activeGameSummary?.game_id ?? null)
      : null;
  const { pressToggleRef, pressSheetOpen, openPressSheet, closePressSheet } =
    useMobilePressSheet({
      isCompact,
      pressGameId,
      toolsDrawerOpen,
      closeToolsDrawer,
    });
  const gameOver = Boolean(gameState.winner);
  usePressSync({ gameId: pressGameId, power: lockedPower, gameOver });
  const suggestion = useSuggestionBoard({
    gameState,
    power: pressGameId ? lockedPower : null,
    blocked: sandboxMode || directEditActive || viewingHistory,
  });
  const suggestionView = suggestion?.mode === 'view';
  const readOnly = viewingHistory || suggestionView;
  const boardOwnership =
    historyTurn?.phase === 'Admin' && historyTurn.resolution?.new_ownership
      ? historyTurn.resolution.new_ownership
      : (historyTurn?.ownership ?? gameState.ownership);
  const boardUnits =
    historyTurn?.phase === 'Admin' && historyTurn.resolution?.new_units
      ? historyTurn.resolution.new_units
      : (historyTurn?.units ?? gameState.units);
  const pressProps: Omit<PressSectionProps, 'visible' | 'variant'> | undefined =
    pressGameId && lockedPower
      ? {
          gameId: pressGameId,
          power: lockedPower,
          gameOver,
          surrendered: (gameState.surrendered_powers ?? []).includes(
            lockedPower,
          ),
          provinces,
          units: gameState.units,
          participants: activeGameSummary?.participants,
          turn: turnLabel(gameState),
          // Moves can be suggested, shown and taken while the live Movement turn is on
          // the board.
          suggestTurn:
            gameState.phase === 'Movement' &&
            !gameOver &&
            !sandboxMode &&
            !directEditActive &&
            !viewingHistory
              ? turnLabel(gameState)
              : null,
          onHighlightProvinces: setHighlightedProvinces,
          onProvincePicked: isCompact ? closePressSheet : undefined,
        }
      : undefined;

  return (
    <main
      className={styles.warRoomWorkspace}
      data-testid="game-workspace"
      data-left-collapsed={leftSidebarCollapsed ? 'true' : undefined}
      data-right-collapsed={rightSidebarCollapsed ? 'true' : undefined}
    >
      {/* LEFT SIDEBAR: Tools, Legend, Zoom, Standing, Sandbox & Admin */}
      <ToolsSidebar
        collapsed={leftSidebarCollapsed}
        onToggleCollapse={() => setLeftSidebarCollapsed((prev) => !prev)}
        variant={isCompact ? 'drawer' : 'panel'}
        open={toolsDrawerOpen}
        onClose={closeToolsDrawer}
        zoomPercent={zoomPercent}
        onZoomIn={() => mapRef.current?.stepZoom(0.2)}
        onZoomOut={() => mapRef.current?.stepZoom(-0.2)}
        onResetCamera={() => mapRef.current?.resetCamera()}
        activePower={playerPower}
        onSelectPower={handleSelectPower}
        ownership={supplyCenterOwners(boardOwnership, provinces)}
        units={boardUnits}
        finalizedPowers={
          viewingHistory ? NO_POWERS : gameState.finalized_powers
        }
        surrenderedPowers={
          viewingHistory ? NO_POWERS : gameState.surrendered_powers
        }
        issues={viewingHistory ? NO_ISSUES : gameState.issues}
        isMultiplayer={isMultiplayer}
        participants={activeGameSummary?.participants}
        showAllMoves={showAllSandboxMoves}
        onChangeShowAllMoves={setShowAllSandboxMoves}
        sandboxMode={sandboxMode}
        viewingHistory={viewingHistory}
        onToggleSandboxMode={handleToggleSandboxMode}
        onClearForeignPreMoves={handleClearForeignPreMoves}
        foreignModifiedOrdersCount={
          gameState.units
            .filter((u) => u.power !== ownPower)
            .filter((u) => {
              const o = gameState.orders[u.id];
              return o && (o.order_type !== 'HOLD' || o.is_explicit);
            }).length
        }
        onLoadScenario={handleLoadScenario}
        onSaveSandboxClick={handleOpenSaveSandboxModal}
        adminOverrideActive={directEditActive}
        press={pressProps}
        onOpenPress={isCompact && pressProps ? openPressSheet : undefined}
      />

      {/* CENTER: Europe Map */}
      <EuropeMap
        ref={mapRef}
        onZoomChange={setZoomPercent}
        compact={isCompact}
        onDockedBarChange={handleDockedBarChange}
        pieceStyle={displayPrefs.pieceStyle}
        unitMark={displayPrefs.unitMark}
        provinces={provinces}
        units={historyTurn?.units ?? gameState.units}
        orders={historyTurn?.orders ?? suggestion?.orders ?? gameState.orders}
        suggestion={suggestion?.map}
        ownership={historyTurn?.ownership ?? gameState.ownership}
        activePower={playerPower}
        sandboxMode={sandboxMode}
        showAllMoves={
          directEditActive ||
          ((!isMultiplayer || sandboxMode) && showAllSandboxMoves)
        }
        directEditActive={directEditActive}
        directEdit={directEdit}
        selectedUnitId={readOnly ? null : selectedUnitId}
        hoveredUnitId={
          viewingHistory
            ? (activeHistoryFocus?.unitId ?? null)
            : readOnly
              ? null
              : hoveredUnitId
        }
        highlightedProvinces={
          viewingHistory
            ? (activeHistoryFocus?.provinces ?? NO_PROVINCES)
            : highlightedProvinces
        }
        issues={viewingHistory || suggestion ? NO_ISSUES : gameState.issues}
        simulationResult={
          historyTurn?.resolution ?? (suggestion ? null : simulationResult)
        }
        showSimulationOverlay={
          viewingHistory || (showSimulationOverlay && !suggestion)
        }
        onSelectUnit={readOnly ? ignore : selectFromMap}
        suppressUnitMenu={suppressUnitMenu}
        onHoverUnit={readOnly ? ignore : setHoveredUnitId}
        onUpdateOrder={
          readOnly ? ignore : (suggestion?.stage ?? handleUpdateOrder)
        }
        historyView={readOnly}
        historyPowers={turnHistory.powers}
        historyActions={turnHistory.actions}
        phase={historyTurn?.phase ?? gameState.phase}
        season={historyTurn?.season ?? gameState.season}
        builds={historyTurn ? (historyTurn.builds ?? null) : gameState.builds}
        retreats={
          historyTurn ? (historyTurn.retreats ?? null) : gameState.retreats
        }
        unitOptions={viewingHistory ? null : (gameState.unit_options ?? null)}
        onClearSimulationOverlay={() => setShowSimulationOverlay(false)}
        onAdjudicateTurn={handleAdjudicateTurn}
        overlay={
          <>
            {viewMode === 'multiplayer' &&
              activeGameSummary?.status === 'active' &&
              !gameState.winner && (
                <PhaseTimerWidget
                  compact={isCompact}
                  timer={matchTimer}
                  seatPower={lockedPower}
                  isHost={isGameCreator}
                  hypothetical={!!sandboxGameId}
                  onStart={() => postTimerAction('start')}
                  onVote={(choice) =>
                    postTimerAction('vote', { power: lockedPower, choice })
                  }
                  onExtend={(active) =>
                    postTimerAction('extend', {
                      power: lockedPower,
                      active,
                    })
                  }
                  onReady={(active) =>
                    postTimerAction('ready', { power: lockedPower, active })
                  }
                  onExpire={handleTimerExpired}
                />
              )}
            {suggestion && !viewingHistory && (
              <SuggestionPill
                suggestion={suggestion}
                onClose={suggestionStore.clear}
              />
            )}
          </>
        }
      />

      {/* RIGHT SIDEBAR: Core Gameplay Orders & Unit Command */}
      <MacroSidebar
        collapsed={rightSidebarCollapsed}
        onToggleCollapse={() => setRightSidebarCollapsed((prev) => !prev)}
        variant={isCompact ? 'sheet' : 'panel'}
        sheetSnap={sheetSnap}
        onSheetSnapChange={setSheetSnap}
        historyTurn={historyTurn}
        historyPowers={turnHistory.powers}
        historyActions={turnHistory.actions}
        unitMark={displayPrefs.unitMark}
        uiSpacing={displayPrefs.uiSpacing}
        onToggleUiSpacing={onToggleUiSpacing}
        selectedHistoryOrderId={pinnedHistoryFocus?.id ?? null}
        onSelectHistoryPowers={turnHistory.setPowers}
        onSelectHistoryActions={turnHistory.setActions}
        onHoverHistoryOrder={setHoveredHistoryFocus}
        onTogglePinHistoryOrder={(focus) =>
          setPinnedHistoryFocus((prev) =>
            prev?.id === focus.id ? null : focus,
          )
        }
        historyLabel={
          viewedEntry ? turnLabel(viewedEntry) : (suggestion?.label ?? null)
        }
        historyIsAdmin={viewedEntry?.phase === 'Admin'}
        onReturnToLive={
          viewedEntry ? turnHistory.goLive : suggestionStore.clear
        }
        provinces={provinces}
        units={gameState.units}
        orders={gameState.orders}
        ownership={gameState.ownership}
        activePower={playerPower}
        finalizedPowers={gameState.finalized_powers}
        surrenderedPowers={gameState.surrendered_powers}
        sandboxMode={sandboxMode}
        selectedUnitId={selectedUnitId}
        hoveredUnitId={hoveredUnitId}
        issues={gameState.issues}
        simulationResult={simulationResult}
        showSimulationOverlay={showSimulationOverlay}
        phase={gameState.phase}
        season={gameState.season}
        builds={gameState.builds}
        retreats={gameState.retreats}
        unitOptions={gameState.unit_options}
        isMultiplayer={viewMode === 'multiplayer'}
        isGameCreator={isGameCreator}
        gameOver={gameOver}
        directEditActive={directEditActive}
        directEdit={directEdit}
        turnClockSettings={turnClockSettings}
        participants={activeGameSummary?.participants}
        lobbyStatus={activeGameSummary?.status}
        onSelectUnit={selectFromSidebar}
        onSelectPower={handleSelectPower}
        onOpenPress={isCompact && pressProps ? openPressSheet : undefined}
        pressToggleRef={pressToggleRef}
        onHoverUnit={setHoveredUnitId}
        onHighlightProvinces={setHighlightedProvinces}
        onUpdateOrder={handleUpdateOrder}
        onClearAllOrders={handleClearAllOrders}
        onFinalizeClick={() => handleFinalizeClick(false)}
        onUnfinalizeClick={handleUnfinalizeClick}
        onAdjudicateTurn={handleAdjudicateTurn}
      />

      {isCompact && pressProps && (
        <MobilePressSheet
          open={pressSheetOpen}
          onClose={closePressSheet}
          press={pressProps}
        />
      )}
    </main>
  );
}
