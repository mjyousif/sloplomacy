import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useSidebarSelection } from '../hooks/useSidebarSelection';
import type { TurnHistory } from '../hooks/useTurnHistory';
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
import type { SheetSnap } from '../utils/sheetHelpers';
import { turnLabel } from '../utils/timerHelpers';
import {
  type DirectEditMapHandlers,
  EuropeMap,
  type EuropeMapHandle,
} from './EuropeMap';
import styles from './GameWorkspace.module.css';
import { MacroSidebar } from './MacroSidebar';
import type { AdminTurnClockSettings } from './macro/AdminTurnClockSidebar';
import { PhaseTimerWidget } from './PhaseTimerWidget';
import { ToolsSidebar } from './ToolsSidebar';
import { TurnHistoryPill, TurnHistorySelector } from './TurnHistorySelector';

// Stable empties for a past turn, so the map's memoized layers are not rebuilt every render.
const NO_ISSUES: ValidationIssue[] = [];
const NO_PROVINCES: string[] = [];

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
  showPastTurn: (index: number | null) => void;
  stepPastTurn: (delta: -1 | 1) => void;
  mapRef: RefObject<EuropeMapHandle | null>;
  zoomPercent: number;
  setZoomPercent: Dispatch<SetStateAction<number>>;
  displayPrefs: DisplayPrefs;
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
  handleGenerateAIMoves: (powers?: Power[], includeActive?: boolean) => void;
  handleAIStepTurn: () => void;
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
  handleOpenSurrenderModal: (
    game: MultiplayerGameSummary,
    power: Power,
  ) => void;
  /** The host's tools. */
  isGameCreator: boolean;
  directEditActive: boolean;
  historyLocked?: boolean;
  directEdit?: DirectEditMapHandlers;
  turnClockSettings?: AdminTurnClockSettings;
}

/**
 * The game screen of a sandbox or a match: the tools sidebar (a drawer on a phone), the map
 * with the turn clock over it, and the order sidebar (a pull-up sheet on a phone). A past turn
 * from the turn selector is drawn on the map with nothing on it selectable.
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
  showPastTurn,
  stepPastTurn,
  mapRef,
  zoomPercent,
  setZoomPercent,
  displayPrefs,
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
  handleGenerateAIMoves,
  handleAIStepTurn,
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
  handleOpenSurrenderModal,
  isGameCreator,
  directEditActive,
  historyLocked = false,
  directEdit,
  turnClockSettings,
}: GameWorkspaceProps) {
  const viewingHistory = historyTurn !== null;
  const ignore = () => {};
  const { selectFromSidebar, selectFromMap, suppressUnitMenu } =
    useSidebarSelection(selectedUnitId, setSelectedUnitId);
  return (
    <main className={styles.warRoomWorkspace} data-testid="game-workspace">
      {/* LEFT SIDEBAR: Tools, Legend, Zoom, Standing, Sandbox & Admin */}
      <ToolsSidebar
        collapsed={leftSidebarCollapsed}
        onToggleCollapse={() => setLeftSidebarCollapsed((prev) => !prev)}
        variant={isCompact ? 'drawer' : 'panel'}
        open={toolsDrawerOpen}
        onClose={closeToolsDrawer}
        historyFooter={
          isCompact ? (
            <TurnHistorySelector
              entries={turnHistory.entries}
              viewIndex={turnHistory.viewIndex}
              liveLabel={turnLabel(gameState)}
              power={turnHistory.power}
              locked={historyLocked}
              onSelect={showPastTurn}
              onStep={stepPastTurn}
              onSelectPower={turnHistory.setPower}
              onPickedTurn={closeToolsDrawer}
            />
          ) : undefined
        }
        zoomPercent={zoomPercent}
        onZoomIn={() => mapRef.current?.stepZoom(0.2)}
        onZoomOut={() => mapRef.current?.stepZoom(-0.2)}
        onResetCamera={() => mapRef.current?.resetCamera()}
        activePower={playerPower}
        onSelectPower={handleSelectPower}
        ownership={gameState.ownership}
        units={gameState.units}
        finalizedPowers={gameState.finalized_powers}
        surrenderedPowers={gameState.surrendered_powers}
        issues={gameState.issues}
        isMultiplayer={viewMode === 'multiplayer'}
        participants={activeGameSummary?.participants}
        sandboxMode={sandboxMode}
        onToggleSandboxMode={handleToggleSandboxMode}
        onClearForeignPreMoves={handleClearForeignPreMoves}
        foreignModifiedOrdersCount={
          gameState.units
            .filter((u) => u.power !== playerPower)
            .filter((u) => {
              const o = gameState.orders[u.id];
              return o && (o.order_type !== 'HOLD' || o.is_explicit);
            }).length
        }
        onGenerateAIMoves={handleGenerateAIMoves}
        onAIStepTurn={handleAIStepTurn}
        onLoadScenario={handleLoadScenario}
        onSaveSandboxClick={handleOpenSaveSandboxModal}
        adminOverrideActive={directEditActive}
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
        orders={historyTurn?.orders ?? gameState.orders}
        ownership={historyTurn?.ownership ?? gameState.ownership}
        activePower={playerPower}
        sandboxMode={sandboxMode}
        directEditActive={directEditActive}
        directEdit={directEdit}
        selectedUnitId={viewingHistory ? null : selectedUnitId}
        hoveredUnitId={viewingHistory ? null : hoveredUnitId}
        highlightedProvinces={
          viewingHistory ? NO_PROVINCES : highlightedProvinces
        }
        issues={viewingHistory ? NO_ISSUES : gameState.issues}
        simulationResult={historyTurn?.resolution ?? simulationResult}
        showSimulationOverlay={viewingHistory || showSimulationOverlay}
        onSelectUnit={viewingHistory ? ignore : selectFromMap}
        suppressUnitMenu={suppressUnitMenu}
        onHoverUnit={viewingHistory ? ignore : setHoveredUnitId}
        onUpdateOrder={viewingHistory ? ignore : handleUpdateOrder}
        historyView={viewingHistory}
        historyPower={turnHistory.power}
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
            {isCompact && viewedEntry && (
              <TurnHistoryPill
                entry={viewedEntry}
                isOldest={turnHistory.viewIndex === 0}
                onStep={stepPastTurn}
                onGoLive={turnHistory.goLive}
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
        historyLabel={viewedEntry ? turnLabel(viewedEntry) : null}
        onReturnToLive={turnHistory.goLive}
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
        gameOver={Boolean(gameState.winner)}
        directEditActive={directEditActive}
        directEdit={directEdit}
        turnClockSettings={turnClockSettings}
        participants={activeGameSummary?.participants}
        lobbyStatus={activeGameSummary?.status}
        onSelectUnit={selectFromSidebar}
        onHoverUnit={setHoveredUnitId}
        onHighlightProvinces={setHighlightedProvinces}
        onUpdateOrder={handleUpdateOrder}
        onClearAllOrders={handleClearAllOrders}
        onFinalizeClick={() => handleFinalizeClick(false)}
        onUnfinalizeClick={handleUnfinalizeClick}
        onAdjudicateTurn={handleAdjudicateTurn}
        onSurrenderClick={() => {
          if (activeGameSummary && lockedPower) {
            handleOpenSurrenderModal(activeGameSummary, lockedPower);
          }
        }}
      />
    </main>
  );
}
