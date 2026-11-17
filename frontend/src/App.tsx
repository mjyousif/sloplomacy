import { AlertTriangle, Compass } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './App.module.css';
import { AppHeader } from './components/AppHeader';
import { AppModals } from './components/AppModals';
import type { EuropeMapHandle } from './components/EuropeMap';
import { GameWorkspace } from './components/GameWorkspace';
import { LobbyView } from './components/LobbyView';
import { useConfirm } from './components/modal/ConfirmModal';
import { useAdminDirectEdit } from './hooks/useAdminDirectEdit';
import {
  createAdminStateUpdater,
  getInitialViewMode,
  useAppNavigation,
} from './hooks/useAppNavigation';
import { useAuthSession } from './hooks/useAuthSession';
import { useCompactLayout } from './hooks/useCompactLayout';
import { useDisplayPrefs } from './hooks/useDisplayPrefs';
import { useGameOverModal } from './hooks/useGameOverModal';
import { useGameSession } from './hooks/useGameSession';
import { useGameSync } from './hooks/useGameSync';
import { useMatchActions } from './hooks/useMatchActions';
import { useSandboxExit } from './hooks/useSandboxExit';
import { useSandboxSession } from './hooks/useSandboxSession';
import { useSeatActions } from './hooks/useSeatActions';
import { useToast } from './hooks/useToast';
import { useTurnHistory } from './hooks/useTurnHistory';
import { useTurnNotifications } from './hooks/useTurnNotifications';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import type { SimulationResult } from './types/diplomacy';
import { checkIsGameCreator, resolvePlayerPower } from './utils/adminHelpers';
import { DEFAULT_CAMERA } from './utils/mapCameraHelpers';
import { turnLabel } from './utils/timerHelpers';

export function App() {
  const [viewMode, setViewMode] = useState<'lobby' | 'sandbox' | 'multiplayer'>(
    getInitialViewMode,
  );
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const session = useGameSession({ viewMode, setSimulationResult });
  const auth = useAuthSession();
  const {
    prefs: displayPrefs,
    saveState: displayPrefsSaveState,
    updatePrefs: updateDisplayPrefs,
  } = useDisplayPrefs(auth.authUser);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [highlightedProvinces, setHighlightedProvinces] = useState<string[]>(
    [],
  );
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] =
    useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(() =>
    Math.round(DEFAULT_CAMERA.zoom * 100),
  );
  const isCompact = useCompactLayout();
  const layout = useWorkspaceLayout({
    viewMode,
    activeGameId: session.activeGameId,
    isCompact,
  });
  const mapRef = useRef<EuropeMapHandle | null>(null);
  const { toastBanner, triggerToast } = useToast();
  const { confirm, confirmModal } = useConfirm();
  const [matchPasscodes, setMatchPasscodes] = useState<Record<string, string>>(
    {},
  );
  const turnHistory = useTurnHistory({
    gameId: session.activeGameId,
    liveTurnKey: session.gameState ? turnLabel(session.gameState) : '',
    passcode: matchPasscodes[session.activeGameId] ?? null,
    enabled: viewMode !== 'lobby',
  });
  const isGameCreator = checkIsGameCreator(
    session.activeGameSummary,
    auth.authUser,
    viewMode,
  );
  const directEditActive = isGameCreator && adminOverrideActive;
  const handleAdminUpdateState = createAdminStateUpdater(
    session.applyServerState,
    session.fetchGamesList,
  );
  const directEdit = useAdminDirectEdit({
    activeGameId: session.activeGameId,
    viewMode,
    lockedPower: session.lockedPower,
    gameState: session.gameState,
    provinces: session.provinces,
    directEditActive,
    setDirectEditActive: setAdminOverrideActive,
    authUser: auth.authUser,
    onUpdateGameState: handleAdminUpdateState,
    showToast: triggerToast,
    confirm,
  });
  // Hypothetical Mode, the scenario reset and saving a sandbox.
  const sandbox = useSandboxSession({
    activeGameId: session.activeGameId,
    setActiveGameId: session.setActiveGameId,
    setActiveGameSummary: session.setActiveGameSummary,
    gameState: session.gameState,
    playerPower: session.playerPower,
    authUser: auth.authUser,
    openAuthPrompt: auth.openAuthPrompt,
    triggerToast,
    goLive: turnHistory.goLive,
    setLoading: session.setLoading,
    setSelectedUnitId,
    applyServerState: session.applyServerState,
    fetchGame: session.fetchGame,
    fetchGamesList: session.fetchGamesList,
  });

  // In multiplayer Hypothetical Mode, Standings and unit selection can switch the commanded power on the ephemeral branch.
  const activePower = resolvePlayerPower(
    viewMode,
    session.lockedPower,
    session.gameState?.active_power,
    sandbox.sandboxMode,
  );

  // The live socket, the first load and the fallback poll.
  const { wsConnected, handleTimerExpired } = useGameSync({
    viewMode,
    activeGameId: session.activeGameId,
    playerPower: session.playerPower,
    sandboxGameId: sandbox.sandboxGameId,
    sandboxOriginTurn: sandbox.sandboxOriginTurn,
    setSandboxOriginTurn: sandbox.setSandboxOriginTurn,
    setSandboxGameId: sandbox.setSandboxGameId,
    setSandboxMode: sandbox.setSandboxMode,
    setShowSimulationOverlay: sandbox.setShowSimulationOverlay,
    setSelectedUnitId,
    matchPasscodes,
    authKey: auth.authUser?.id ?? null,
    triggerToast,
    setActiveGameSummary: session.setActiveGameSummary,
    setGameState: session.setGameState,
    setGamesList: session.setGamesList,
    setSimulationResult,
    setHypotheticalMatchTimer: sandbox.setHypotheticalMatchTimer,
    applyServerState: session.applyServerState,
    fetchGame: session.fetchGame,
    fetchGamesList: session.fetchGamesList,
    fetchMyGames: session.fetchMyGames,
  });

  useTurnNotifications({
    viewMode,
    gameState: session.gameState,
    activeGameSummary: session.activeGameSummary,
    lockedPower: session.lockedPower,
    sandboxGameId: sandbox.sandboxGameId,
    hypotheticalMatchTimer: sandbox.matchTimer,
    soundEnabled: displayPrefs.soundNotifications,
  });

  // Leaving the match board by any route closes its private sandbox.
  useSandboxExit({
    viewMode,
    sandboxGameId: sandbox.sandboxGameId,
    playerPower: session.playerPower,
    setSandboxGameId: sandbox.setSandboxGameId,
    setSandboxMode: sandbox.setSandboxMode,
    setShowSimulationOverlay: sandbox.setShowSimulationOverlay,
  });

  const { gameOverModalOpen, openGameOverModal, closeGameOverModal } =
    useGameOverModal({
      viewMode,
      activeGameId: session.activeGameId,
      gameState: session.gameState,
      activeGameSummary: session.activeGameSummary,
      authUser: auth.authUser,
      onSummaryUpdated: (updatedSummary) => {
        session.setActiveGameSummary(updatedSummary);
        void session.fetchMyGames();
      },
    });

  // Orders, finalizing, resolving the turn and the turn clock.
  const match = useMatchActions({
    viewMode,
    activeGameId: session.activeGameId,
    lockedPower: session.lockedPower,
    gameState: session.gameState,
    playerPower: activePower,
    directEditActive,
    sandboxMode: sandbox.sandboxMode,
    sandboxGameId: sandbox.sandboxGameId,
    draftGameId: sandbox.draftGameId,
    requireRealBoard: sandbox.requireRealBoard,
    setHypotheticalMatchTimer: sandbox.setHypotheticalMatchTimer,
    triggerToast,
    setSelectedUnitId,
    applyServerState: session.applyServerState,
    fetchGamesList: session.fetchGamesList,
  });

  const seats = useSeatActions({
    viewMode,
    setViewMode,
    activeGameId: session.activeGameId,
    setActiveGameId: session.setActiveGameId,
    activeGameSummary: session.activeGameSummary,
    setActiveGameSummary: session.setActiveGameSummary,
    lockedPower: session.lockedPower,
    setLockedPower: session.setLockedPower,
    setProvinces: session.setProvinces,
    setLoading: session.setLoading,
    boardRequestSeq: session.boardRequestSeq,
    applyServerState: session.applyServerState,
    fetchGamesList: session.fetchGamesList,
    authUser: auth.authUser,
    openAuthPrompt: auth.openAuthPrompt,
    sandboxMode: sandbox.sandboxMode,
    sandboxGameId: sandbox.sandboxGameId,
    draftGameId: sandbox.draftGameId,
    setSandboxGameId: sandbox.setSandboxGameId,
    setSandboxMode: sandbox.setSandboxMode,
    setShowSimulationOverlay: sandbox.setShowSimulationOverlay,
    requireRealBoard: sandbox.requireRealBoard,
    matchPasscodes,
    setMatchPasscodes,
    confirm,
    triggerToast,
    setSelectedUnitId,
  });

  const nav = useAppNavigation({
    viewMode,
    setViewMode,
    isCompact,
    isGameCreator,
    directEditActive,
    adminModalOpen,
    setAdminModalOpen,
    setAdminOverrideActive,
    authUser: auth.authUser,
    session,
    layout,
    turnHistory,
    directEdit,
    sandbox,
    match,
    seats,
    setSelectedUnitId,
    setHighlightedProvinces,
    confirm,
    triggerToast,
  });

  if (session.loading && !session.gameState) {
    return (
      <div className={styles.loadingScreen}>
        <Compass className="spin-icon" size={38} />
        <h2>Unrolling 1901 Imperial War Atlas...</h2>
      </div>
    );
  }

  if (session.errorMsg || !session.gameState) {
    return (
      <div className={styles.errorScreen}>
        <AlertTriangle size={36} />
        <h2>Backend Connection Required</h2>
        <p>{session.errorMsg}</p>
        <button onClick={() => session.fetchGame()}>Retry Connection</button>
      </div>
    );
  }

  const boardState = directEdit.effectiveGameState ?? session.gameState;

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
        activeGameId={session.activeGameId}
        activeGameSummary={session.activeGameSummary}
        games={session.gamesList}
        playerPower={activePower}
        lockedPower={session.lockedPower}
        wsConnected={wsConnected}
        displayPrefs={displayPrefs}
        displayPrefsSaveState={displayPrefsSaveState}
        updateDisplayPrefs={updateDisplayPrefs}
        authUser={auth.authUser}
        openAuthPrompt={auth.openAuthPrompt}
        openAccountModal={auth.openAccountModal}
        handleSignOut={nav.handleSignOut}
        handleBackToLobby={nav.handleBackToLobby}
        handleEnterSoloSandbox={nav.guardedEnterSoloSandbox}
        onSaveSandbox={sandbox.handleOpenSaveSandboxModal}
        onResetSandbox={nav.guardedResetSandbox}
        onDeleteSandbox={nav.guardedDeleteSandbox}
        onSwitchToSoloSandbox={nav.guardedSwitchToSoloSandbox}
        onReturnToPreviousGame={nav.guardedReturnToPreviousGame}
        onSelectGame={nav.guardedSwitchToGame}
        onOpenSurrenderModal={seats.handleOpenSurrenderModal}
        handleFinalizeClick={match.handleFinalizeClick}
        toolsDrawerOpen={layout.toolsDrawerOpen}
        setToolsDrawerOpen={layout.setToolsDrawerOpen}
        toolsToggleRef={layout.toolsToggleRef}
        isGameCreator={isGameCreator}
        directEditActive={directEditActive}
        openAdminTools={nav.openAdminTools}
        onToggleDirectEdit={nav.handleToggleEditBoard}
        turnClockOpen={isGameCreator && adminModalOpen}
        onResolveTurn={nav.handleAdminResolveTurn}
        onExitAdmin={nav.handleExitAdmin}
        toastBanner={toastBanner}
        historyEntries={turnHistory.entries}
        historyViewIndex={turnHistory.viewIndex}
        historyLocked={nav.adminModeActive}
        onSelectHistoryTurn={nav.showPastTurn}
        onStepHistoryTurn={nav.stepPastTurn}
        onOpenGameOverModal={openGameOverModal}
      />

      {/* VIEW 1: MAIN PAGE / LOBBY */}
      {viewMode === 'lobby' ? (
        <LobbyView
          user={auth.authUser}
          games={session.gamesList}
          loadingGames={session.loadingGames}
          onRefreshGames={session.fetchGamesList}
          onEnterSandbox={nav.guardedEnterSoloSandbox}
          onOpenAuth={auth.openAuthPrompt}
          onCreateGame={seats.handleCreateMultiplayerGame}
          onJoinOrEnterGame={seats.handleJoinOrEnterMultiplayerGame}
          onOpenSurrenderModal={seats.handleOpenSurrenderModal}
        />
      ) : (
        <GameWorkspace
          viewMode={viewMode}
          isCompact={isCompact}
          gameState={boardState}
          provinces={session.provinces}
          activeGameSummary={session.activeGameSummary}
          playerPower={activePower}
          lockedPower={session.lockedPower}
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
          historyTurn={nav.historyTurn}
          viewedEntry={nav.viewedEntry}
          showPastTurn={nav.showPastTurn}
          stepPastTurn={nav.stepPastTurn}
          mapRef={mapRef}
          zoomPercent={zoomPercent}
          setZoomPercent={setZoomPercent}
          displayPrefs={displayPrefs}
          onToggleUiSpacing={() =>
            updateDisplayPrefs({
              uiSpacing:
                displayPrefs.uiSpacing === 'compact' ? 'normal' : 'compact',
            })
          }
          selectedUnitId={selectedUnitId}
          setSelectedUnitId={setSelectedUnitId}
          hoveredUnitId={hoveredUnitId}
          setHoveredUnitId={setHoveredUnitId}
          highlightedProvinces={highlightedProvinces}
          setHighlightedProvinces={setHighlightedProvinces}
          simulationResult={simulationResult}
          sandboxMode={sandbox.sandboxMode}
          sandboxGameId={sandbox.sandboxGameId}
          showSimulationOverlay={sandbox.showSimulationOverlay}
          setShowSimulationOverlay={sandbox.setShowSimulationOverlay}
          matchTimer={sandbox.matchTimer}
          handleToggleSandboxMode={sandbox.handleToggleSandboxMode}
          handleClearForeignPreMoves={sandbox.handleClearForeignPreMoves}
          handleLoadScenario={sandbox.handleLoadScenario}
          handleOpenSaveSandboxModal={sandbox.handleOpenSaveSandboxModal}
          handleUpdateOrder={
            directEditActive
              ? directEdit.stageUnitOrder
              : match.handleUpdateOrder
          }
          handleClearAllOrders={match.handleClearAllOrders}
          handleFinalizeClick={match.handleFinalizeClick}
          handleUnfinalizeClick={match.handleUnfinalizeClick}
          handleAdjudicateTurn={match.handleAdjudicateTurn}
          postTimerAction={match.postTimerAction}
          handleTimerExpired={handleTimerExpired}
          handleSelectPower={seats.handleSelectPower}
          isGameCreator={isGameCreator}
          directEditActive={directEditActive}
          historyLocked={nav.adminModeActive}
          directEdit={directEdit}
          turnClockSettings={nav.turnClockSettings}
        />
      )}

      <AppModals
        gameState={session.gameState}
        playerPower={activePower}
        sanityModalOpen={match.sanityModalOpen}
        setSanityModalOpen={match.setSanityModalOpen}
        sanityModalIssues={match.sanityModalIssues}
        handleFinalizeClick={match.handleFinalizeClick}
        setSelectedUnitId={setSelectedUnitId}
        setHighlightedProvinces={setHighlightedProvinces}
        surrenderModalOpen={seats.surrenderModalOpen}
        setSurrenderModalOpen={seats.setSurrenderModalOpen}
        surrenderModalGame={seats.surrenderModalGame}
        surrenderModalPower={seats.surrenderModalPower}
        handleSurrenderPower={seats.handleSurrenderPower}
        handleLeaveGame={seats.handleLeaveGame}
        saveSandboxModalOpen={sandbox.saveSandboxModalOpen}
        setSaveSandboxModalOpen={sandbox.setSaveSandboxModalOpen}
        savingSandbox={sandbox.savingSandbox}
        handleSaveSandboxToAccount={sandbox.handleSaveSandboxToAccount}
        fetchGamesList={session.fetchGamesList}
        triggerToast={triggerToast}
        unacknowledgedAdminEntries={directEdit.unacknowledgedAdminEntries}
        onAcknowledgeAdminEntries={directEdit.handleAcknowledgeAdminEntries}
        acknowledgingAdminEntries={directEdit.acknowledgingAdminEntries}
        authUser={auth.authUser}
        setAuthUser={auth.setAuthUser}
        authModalOpen={auth.authModalOpen}
        setAuthModalOpen={auth.setAuthModalOpen}
        authModalTab={auth.authModalTab}
        authModalReason={auth.authModalReason}
        accountModalOpen={auth.accountModalOpen}
        setAccountModalOpen={auth.setAccountModalOpen}
        accountModalOnboarding={auth.accountModalOnboarding}
        handleSignOut={nav.handleSignOut}
        confirmModal={confirmModal}
        viewMode={viewMode}
        provinces={session.provinces}
        activeGameSummary={session.activeGameSummary}
        gameOverModalOpen={gameOverModalOpen}
        onCloseGameOverModal={closeGameOverModal}
        onReturnToLobby={() => {
          closeGameOverModal();
          void nav.handleBackToLobby();
        }}
      />
    </div>
  );
}

export default App;
