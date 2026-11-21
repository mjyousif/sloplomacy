import { useRef, useState } from 'react';
import styles from './App.module.css';
import { AppHeader } from './components/AppHeader';
import { AppModals } from './components/AppModals';
import { ErrorScreen, LoadingScreen } from './components/AppStatusScreens';
import type { EuropeMapHandle } from './components/EuropeMap';
import { GameWorkspace } from './components/GameWorkspace';
import { LobbyView } from './components/LobbyView';
import { useConfirm } from './components/modal/ConfirmModal';
import { useAdminActions } from './hooks/useAdminActions';
import { useAdminMode } from './hooks/useAdminMode';
import { useAppSync } from './hooks/useAppSync';
import { useAuthSession } from './hooks/useAuthSession';
import { useBoardExits } from './hooks/useBoardExits';
import { useCompactLayout } from './hooks/useCompactLayout';
import { useDisplayPrefs } from './hooks/useDisplayPrefs';
import { useGameRoute } from './hooks/useGameRoute';
import { useGameSession } from './hooks/useGameSession';
import { useMatchActions } from './hooks/useMatchActions';
import { useSandboxSession } from './hooks/useSandboxSession';
import { useSeatActions } from './hooks/useSeatActions';
import { useSpectate } from './hooks/useSpectate';
import { useToast } from './hooks/useToast';
import { useTurnHistory } from './hooks/useTurnHistory';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import type { SimulationResult } from './types/diplomacy';
import { resolvePlayerPower } from './utils/adminHelpers';
import { toggledUiSpacing } from './utils/displayPrefs';
import { initialViewMode } from './utils/gameRoute';
import { DEFAULT_CAMERA } from './utils/mapCameraHelpers';
import { turnLabel } from './utils/timerHelpers';
import type { ViewMode } from './utils/viewMode';

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const session = useGameSession({ viewMode, setSimulationResult });
  const {
    activeGameId,
    setActiveGameId,
    activeGameSummary,
    setActiveGameSummary,
    lockedPower,
    setLockedPower,
    matchPasscodes,
    setMatchPasscodes,
    playerPower,
    gamesList,
    loadingGames,
    gameState,
    provinces,
    setProvinces,
    loading,
    setLoading,
    errorMsg,
    boardRequestSeq,
    applyServerState,
    beginOptimisticOrder,
    settleOptimisticOrder,
    clearPendingOrders,
    fetchGame,
    fetchGamesList,
  } = session;
  const {
    authUser,
    authReady,
    setAuthUser,
    authModalOpen,
    setAuthModalOpen,
    authModalReason,
    authModalTab,
    openAuthPrompt,
    accountModalOpen,
    setAccountModalOpen,
    accountModalOnboarding,
    openAccountModal,
  } = useAuthSession();
  const {
    prefs: displayPrefs,
    saveState: displayPrefsSaveState,
    updatePrefs: updateDisplayPrefs,
  } = useDisplayPrefs(authUser);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [highlightedProvinces, setHighlightedProvinces] = useState<string[]>(
    [],
  );
  const [zoomPercent, setZoomPercent] = useState<number>(() =>
    Math.round(DEFAULT_CAMERA.zoom * 100),
  );
  const isCompact = useCompactLayout();
  const layout = useWorkspaceLayout({ viewMode, activeGameId, isCompact });
  const mapRef = useRef<EuropeMapHandle | null>(null);
  const { toastBanner, triggerToast } = useToast();
  const { confirm, confirmModal } = useConfirm();
  const turnHistory = useTurnHistory({
    gameId: activeGameId,
    liveTurnKey: gameState ? turnLabel(gameState) : '',
    passcode: matchPasscodes[activeGameId] ?? null,
    enabled: viewMode !== 'lobby',
  });
  const admin = useAdminMode({
    viewMode,
    activeGameId,
    activeGameSummary,
    lockedPower,
    gameState,
    provinces,
    authUser,
    applyServerState,
    fetchGamesList,
    triggerToast,
    confirm,
  });
  const { isGameCreator, directEditActive, directEdit } = admin;
  // Hypothetical Mode, the scenario reset and saving a sandbox.
  const sandbox = useSandboxSession({
    activeGameId,
    setActiveGameId,
    setActiveGameSummary,
    gameState,
    playerPower,
    authUser,
    openAuthPrompt,
    triggerToast,
    goLive: turnHistory.goLive,
    setLoading,
    setSelectedUnitId,
    applyServerState,
    fetchGame,
    fetchGamesList,
  });
  const {
    sandboxMode,
    setSandboxMode,
    sandboxGameId,
    setSandboxGameId,
    setHypotheticalMatchTimer,
    showSimulationOverlay,
    setShowSimulationOverlay,
    saveSandboxModalOpen,
    setSaveSandboxModalOpen,
    savingSandbox,
    draftGameId,
    matchTimer,
    requireRealBoard,
    handleOpenSaveSandboxModal,
    handleSaveSandboxToAccount,
    handleClearForeignPreMoves,
    handleToggleSandboxMode,
    handleLoadScenario,
  } = sandbox;

  // In multiplayer Hypothetical Mode, Standings and unit selection can switch the commanded power on the ephemeral branch.
  const activePower = resolvePlayerPower(
    viewMode,
    lockedPower,
    gameState?.active_power,
    sandboxMode,
    session.spectatorPower,
  );

  // The live socket, the first load, the fallback poll, turn alerts and sandbox exit.
  const { handleTimerExpired, gameOver } = useAppSync({
    viewMode,
    session,
    sandbox,
    authUser,
    soundEnabled: displayPrefs.soundNotifications,
    triggerToast,
    setSelectedUnitId,
    setSimulationResult,
  });

  // Orders, finalizing, resolving the turn and the turn clock.
  const {
    sanityModalOpen,
    setSanityModalOpen,
    sanityModalIssues,
    handleUpdateOrder,
    handleClearAllOrders,
    handleFinalizeClick,
    handleUnfinalizeClick,
    postTimerAction,
    handleAdjudicateTurn,
  } = useMatchActions({
    viewMode,
    activeGameId,
    lockedPower,
    gameState,
    playerPower: activePower,
    directEditActive,
    sandboxMode,
    sandboxGameId,
    draftGameId,
    requireRealBoard,
    setHypotheticalMatchTimer,
    triggerToast,
    setSelectedUnitId,
    applyServerState,
    beginOptimisticOrder,
    settleOptimisticOrder,
    clearPendingOrders,
    fetchGamesList,
  });

  const seats = useSeatActions({
    viewMode,
    setViewMode,
    activeGameId,
    setActiveGameId,
    activeGameSummary,
    setActiveGameSummary,
    lockedPower,
    setLockedPower,
    setProvinces,
    setLoading,
    boardRequestSeq,
    applyServerState,
    fetchGamesList,
    authUser,
    openAuthPrompt,
    sandboxMode,
    sandboxGameId,
    draftGameId,
    setSandboxGameId,
    setSandboxMode,
    setShowSimulationOverlay,
    requireRealBoard,
    matchPasscodes,
    setMatchPasscodes,
    confirm,
    triggerToast,
    setSelectedUnitId,
  });
  const spectate = useSpectate({
    session,
    seats,
    setViewMode,
    authUser,
    triggerToast,
  });
  const exits = useBoardExits({
    setViewMode,
    authUser,
    viewMode,
    seats,
    triggerToast,
    confirmIfDirty: directEdit.confirmIfDirty,
    confirm,
    closeAdminTools: () => {
      admin.setAdminModalOpen(false);
      admin.setAdminOverrideActive(false);
    },
    goLive: turnHistory.goLive,
    handleLoadScenario,
    fetchGamesList,
  });
  // The address bar: `/game/<id>` links, Back and Forward, and `?view=sandbox`.
  const route = useGameRoute({
    viewMode,
    activeGameId,
    authUser,
    authReady,
    matchPasscodes,
    enterSeat: seats.handleJoinOrEnterMultiplayerGame,
    watchGame: spectate.watchGame,
    leaveToLobby: exits.handleBackToLobby,
    openSandbox: exits.guardedEnterSoloSandbox,
    triggerToast,
  });

  const adminActions = useAdminActions({
    viewMode,
    isCompact,
    activeGameId,
    authUser,
    gameState,
    admin,
    turnHistory,
    layout,
    requireRealBoard,
    handleAdjudicateTurn,
    setSelectedUnitId,
    setHighlightedProvinces,
    triggerToast,
    confirm,
  });
  const {
    adminModeActive,
    turnClockSettings,
    openAdminTools,
    handleToggleEditBoard,
    handleExitAdmin,
    showPastTurn,
    stepPastTurn,
    handleAdminResolveTurn,
  } = adminActions;

  if (loading && !gameState) return <LoadingScreen />;
  if (errorMsg || !gameState) {
    return <ErrorScreen message={errorMsg} onRetry={() => fetchGame()} />;
  }
  const boardState = directEdit.effectiveGameState ?? gameState;

  return (
    <div
      className={styles.diplomacyAppShell}
      data-layout={isCompact ? 'compact' : 'wide'}
      data-spacing={displayPrefs.uiSpacing}
    >
      <AppHeader
        viewMode={viewMode}
        isCompact={isCompact}
        gameState={boardState}
        activeGameId={activeGameId}
        activeGameSummary={activeGameSummary}
        games={gamesList}
        playerPower={activePower}
        lockedPower={lockedPower}
        displayPrefs={displayPrefs}
        displayPrefsSaveState={displayPrefsSaveState}
        updateDisplayPrefs={updateDisplayPrefs}
        authUser={authUser}
        openAuthPrompt={openAuthPrompt}
        openAccountModal={openAccountModal}
        handleSignOut={exits.handleSignOut}
        handleBackToLobby={exits.handleBackToLobby}
        handleEnterSoloSandbox={exits.guardedEnterSoloSandbox}
        onSaveSandbox={handleOpenSaveSandboxModal}
        onResetSandbox={exits.guardedResetSandbox}
        onDeleteSandbox={exits.guardedDeleteSandbox}
        onSwitchToSoloSandbox={exits.guardedSwitchToSoloSandbox}
        onReturnToPreviousGame={exits.guardedReturnToPreviousGame}
        onSelectGame={exits.guardedSwitchToGame}
        onOpenSurrenderModal={seats.handleOpenSurrenderModal}
        toolsDrawerOpen={layout.toolsDrawerOpen}
        setToolsDrawerOpen={layout.setToolsDrawerOpen}
        toolsToggleRef={layout.toolsToggleRef}
        isGameCreator={isGameCreator}
        directEditActive={directEditActive}
        openAdminTools={openAdminTools}
        onToggleDirectEdit={handleToggleEditBoard}
        turnClockOpen={isGameCreator && admin.adminModalOpen}
        onResolveTurn={handleAdminResolveTurn}
        onExitAdmin={handleExitAdmin}
        toastBanner={toastBanner}
        historyEntries={turnHistory.entries}
        historyViewIndex={turnHistory.viewIndex}
        historyLocked={adminModeActive}
        onSelectHistoryTurn={showPastTurn}
        onStepHistoryTurn={stepPastTurn}
        onOpenGameOverModal={gameOver.openGameOverModal}
      />

      {/* VIEW 1: MAIN PAGE / LOBBY */}
      {viewMode === 'lobby' ? (
        <LobbyView
          user={authUser}
          games={gamesList}
          loadingGames={loadingGames}
          onRefreshGames={fetchGamesList}
          onEnterSandbox={exits.guardedEnterSoloSandbox}
          onOpenAuth={openAuthPrompt}
          onCreateGame={seats.handleCreateMultiplayerGame}
          onJoinOrEnterGame={seats.handleJoinOrEnterMultiplayerGame}
          onWatchGame={spectate.watchGame}
          passcodeRequest={route.passcodeRequest}
          onPasscodeRequestShown={route.clearPasscodeRequest}
          onOpenSurrenderModal={seats.handleOpenSurrenderModal}
        />
      ) : (
        <GameWorkspace
          viewMode={viewMode}
          isCompact={isCompact}
          gameState={boardState}
          provinces={provinces}
          activeGameSummary={activeGameSummary}
          playerPower={activePower}
          lockedPower={lockedPower}
          leftSidebarCollapsed={layout.leftSidebarCollapsed}
          setLeftSidebarCollapsed={layout.setLeftSidebarCollapsed}
          rightSidebarCollapsed={layout.rightSidebarCollapsed}
          setRightSidebarCollapsed={layout.setRightSidebarCollapsed}
          sheetSnap={layout.sheetSnap}
          setSheetSnap={layout.setSheetSnap}
          toolsDrawerOpen={layout.toolsDrawerOpen}
          closeToolsDrawer={layout.closeToolsDrawer}
          handleDockedBarChange={layout.handleDockedBarChange}
          turnHistory={turnHistory}
          historyTurn={turnHistory.turn}
          viewedEntry={turnHistory.viewedEntry}
          mapRef={mapRef}
          zoomPercent={zoomPercent}
          setZoomPercent={setZoomPercent}
          displayPrefs={displayPrefs}
          onToggleUiSpacing={() =>
            updateDisplayPrefs(toggledUiSpacing(displayPrefs))
          }
          selectedUnitId={selectedUnitId}
          setSelectedUnitId={setSelectedUnitId}
          hoveredUnitId={hoveredUnitId}
          setHoveredUnitId={setHoveredUnitId}
          highlightedProvinces={highlightedProvinces}
          setHighlightedProvinces={setHighlightedProvinces}
          simulationResult={simulationResult}
          sandboxMode={sandboxMode}
          sandboxGameId={sandboxGameId}
          showSimulationOverlay={showSimulationOverlay}
          setShowSimulationOverlay={setShowSimulationOverlay}
          matchTimer={matchTimer}
          handleToggleSandboxMode={handleToggleSandboxMode}
          handleClearForeignPreMoves={handleClearForeignPreMoves}
          handleLoadScenario={handleLoadScenario}
          handleOpenSaveSandboxModal={handleOpenSaveSandboxModal}
          handleUpdateOrder={
            directEditActive ? directEdit.stageUnitOrder : handleUpdateOrder
          }
          handleClearAllOrders={handleClearAllOrders}
          handleFinalizeClick={handleFinalizeClick}
          handleUnfinalizeClick={handleUnfinalizeClick}
          handleAdjudicateTurn={handleAdjudicateTurn}
          postTimerAction={postTimerAction}
          handleTimerExpired={handleTimerExpired}
          handleSelectPower={spectate.handleSelectPower}
          spectator={spectate.spectator}
          isGameCreator={isGameCreator}
          directEditActive={directEditActive}
          directEdit={directEdit}
          turnClockSettings={turnClockSettings}
        />
      )}

      <AppModals
        gameState={gameState}
        playerPower={activePower}
        sanityModalOpen={sanityModalOpen}
        setSanityModalOpen={setSanityModalOpen}
        sanityModalIssues={sanityModalIssues}
        handleFinalizeClick={handleFinalizeClick}
        setSelectedUnitId={setSelectedUnitId}
        setHighlightedProvinces={setHighlightedProvinces}
        surrenderModalOpen={seats.surrenderModalOpen}
        setSurrenderModalOpen={seats.setSurrenderModalOpen}
        surrenderModalGame={seats.surrenderModalGame}
        surrenderModalPower={seats.surrenderModalPower}
        handleSurrenderPower={seats.handleSurrenderPower}
        handleLeaveGame={seats.handleLeaveGame}
        saveSandboxModalOpen={saveSandboxModalOpen}
        setSaveSandboxModalOpen={setSaveSandboxModalOpen}
        savingSandbox={savingSandbox}
        handleSaveSandboxToAccount={handleSaveSandboxToAccount}
        fetchGamesList={fetchGamesList}
        triggerToast={triggerToast}
        unacknowledgedAdminEntries={directEdit.unacknowledgedAdminEntries}
        onAcknowledgeAdminEntries={directEdit.handleAcknowledgeAdminEntries}
        acknowledgingAdminEntries={directEdit.acknowledgingAdminEntries}
        authUser={authUser}
        setAuthUser={setAuthUser}
        authModalOpen={authModalOpen}
        setAuthModalOpen={setAuthModalOpen}
        authModalTab={authModalTab}
        authModalReason={authModalReason}
        accountModalOpen={accountModalOpen}
        setAccountModalOpen={setAccountModalOpen}
        accountModalOnboarding={accountModalOnboarding}
        handleSignOut={exits.handleSignOut}
        confirmModal={confirmModal}
        viewMode={viewMode}
        provinces={provinces}
        activeGameSummary={activeGameSummary}
        gamePasscode={matchPasscodes[activeGameId] ?? null}
        gameOverModalOpen={gameOver.gameOverModalOpen}
        onCloseGameOverModal={gameOver.closeGameOverModal}
        onReturnToLobby={() => {
          gameOver.closeGameOverModal();
          void exits.handleBackToLobby();
        }}
      />
    </div>
  );
}

export default App;
