import { AlertTriangle, Compass } from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './App.module.css';
import { AppHeader } from './components/AppHeader';
import { AppModals } from './components/AppModals';
import { useConfirm } from './components/ConfirmModal';
import type { EuropeMapHandle } from './components/EuropeMap';
import { GameWorkspace } from './components/GameWorkspace';
import { LobbyView } from './components/LobbyView';
import { useAdminDirectEdit } from './hooks/useAdminDirectEdit';
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
import { signOutUser } from './lib/supabase';
import type { SimulationResult } from './types/diplomacy';
import { checkIsGameCreator } from './utils/adminHelpers';
import { turnLabel } from './utils/timerHelpers';

export function App() {
  const [viewMode, setViewMode] = useState<'lobby' | 'sandbox' | 'multiplayer'>(
    () =>
      typeof window !== 'undefined' &&
      (new URLSearchParams(window.location.search).get('view') === 'sandbox' ||
        window.location.hash === '#sandbox')
        ? 'sandbox'
        : 'lobby',
  );
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const {
    activeGameId,
    setActiveGameId,
    activeGameSummary,
    setActiveGameSummary,
    lockedPower,
    setLockedPower,
    playerPower,
    gamesList,
    setGamesList,
    loadingGames,
    gameState,
    setGameState,
    provinces,
    setProvinces,
    loading,
    setLoading,
    errorMsg,
    boardRequestSeq,
    applyServerState,
    fetchGame,
    fetchGamesList,
    fetchMyGames,
  } = useGameSession({ viewMode, setSimulationResult });
  const {
    authUser,
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
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] =
    useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(105);
  const isCompact = useCompactLayout();
  const layout = useWorkspaceLayout({ viewMode, activeGameId, isCompact });
  const mapRef = useRef<EuropeMapHandle | null>(null);
  const { toastBanner, triggerToast } = useToast();
  const { confirm, confirmModal } = useConfirm();
  const [matchPasscodes, setMatchPasscodes] = useState<Record<string, string>>(
    {},
  );
  const turnHistory = useTurnHistory({
    gameId: activeGameId,
    liveTurnKey: gameState ? turnLabel(gameState) : '',
    passcode: matchPasscodes[activeGameId] ?? null,
    enabled: viewMode !== 'lobby',
  });
  const isGameCreator = checkIsGameCreator(
    activeGameSummary,
    authUser,
    viewMode,
  );
  const directEditActive = isGameCreator && adminOverrideActive;
  const handleAdminUpdateState = (st: typeof gameState) => {
    if (!st) return;
    applyServerState(st);
    fetchGamesList();
  };
  const directEdit = useAdminDirectEdit({
    activeGameId,
    viewMode,
    lockedPower,
    gameState,
    provinces,
    directEditActive,
    setDirectEditActive: setAdminOverrideActive,
    authUser,
    onUpdateGameState: handleAdminUpdateState,
    showToast: triggerToast,
    confirm,
  });
  // Hypothetical Mode, the AI, the scenario reset and saving a sandbox.
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
    handleGenerateAIMoves,
    handleAIStepTurn,
    handleOpenSaveSandboxModal,
    handleSaveSandboxToAccount,
    handleClearForeignPreMoves,
    handleToggleSandboxMode,
    handleLoadScenario,
  } = useSandboxSession({
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

  // The live socket, the first load and the fallback poll.
  const { wsConnected, handleTimerExpired } = useGameSync({
    viewMode,
    activeGameId,
    playerPower,
    sandboxGameId,
    matchPasscodes,
    authKey: authUser?.id ?? null,
    triggerToast,
    setActiveGameSummary,
    setGameState,
    setGamesList,
    setSimulationResult,
    setHypotheticalMatchTimer,
    applyServerState,
    fetchGame,
    fetchGamesList,
    fetchMyGames,
  });

  useTurnNotifications({
    viewMode,
    gameState,
    activeGameSummary,
    lockedPower,
    sandboxGameId,
    hypotheticalMatchTimer: matchTimer,
    soundEnabled: displayPrefs.soundNotifications,
  });

  // Leaving the match board by any route closes its private sandbox.
  useSandboxExit({
    viewMode,
    sandboxGameId,
    playerPower,
    setSandboxGameId,
    setSandboxMode,
    setShowSimulationOverlay,
  });

  const { gameOverModalOpen, openGameOverModal, closeGameOverModal } =
    useGameOverModal({
      viewMode,
      activeGameId,
      gameState,
      activeGameSummary,
      authUser,
      onSummaryUpdated: (updatedSummary) => {
        setActiveGameSummary(updatedSummary);
        void fetchMyGames();
      },
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
    playerPower,
    directEditActive,
    sandboxMode,
    sandboxGameId,
    draftGameId,
    requireRealBoard,
    setHypotheticalMatchTimer,
    triggerToast,
    setSelectedUnitId,
    applyServerState,
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
    setSandboxMode,
    setShowSimulationOverlay,
    requireRealBoard,
    setMatchPasscodes,
    confirm,
    triggerToast,
    setSelectedUnitId,
  });

  if (loading && !gameState) {
    return (
      <div className={styles.loadingScreen}>
        <Compass className="spin-icon" size={38} />
        <h2>Unrolling 1901 Imperial War Atlas...</h2>
      </div>
    );
  }

  if (errorMsg || !gameState) {
    return (
      <div className={styles.errorScreen}>
        <AlertTriangle size={36} />
        <h2>Backend Connection Required</h2>
        <p>{errorMsg}</p>
        <button onClick={() => fetchGame()}>Retry Connection</button>
      </div>
    );
  }

  const openAdminTools = async () => {
    if (!requireRealBoard('use the admin tools')) return;
    if (!(await directEdit.confirmIfDirty('open Turn and Clock Settings')))
      return;
    turnHistory.goLive();
    setAdminOverrideActive(false);
    setAdminModalOpen(true);
    layout.setRightSidebarCollapsed(false);
    if (isCompact) layout.setSheetSnap('half');
  };
  const handleToggleEditBoard = () => {
    if (!directEditActive) turnHistory.goLive();
    setAdminModalOpen(false);
    layout.setRightSidebarCollapsed(false);
    directEdit.handleToggleDirectEdit();
  };
  const adminModeActive = directEditActive || (isGameCreator && adminModalOpen);
  // Leaves either admin mode; Edit Board asks first if edits are still staged.
  const handleExitAdmin = async () => {
    if (directEditActive) await directEdit.handleToggleDirectEdit();
    setAdminModalOpen(false);
  };

  const historyTurn = turnHistory.turn;
  const viewedEntry =
    turnHistory.viewIndex === null
      ? null
      : (turnHistory.entries[turnHistory.viewIndex] ?? null);
  const showPastTurn = async (index: number | null) => {
    if (adminModeActive) return;
    if (
      index !== null &&
      !(await directEdit.confirmIfDirty('view a past turn'))
    )
      return;
    if (index !== null) {
      setSelectedUnitId(null);
      setHighlightedProvinces([]);
    }
    turnHistory.select(index);
  };
  const stepPastTurn = async (delta: -1 | 1) => {
    if (adminModeActive) return;
    if (!(await directEdit.confirmIfDirty('view a past turn'))) return;
    setSelectedUnitId(null);
    setHighlightedProvinces([]);
    turnHistory.step(delta);
  };
  const handleBackToLobby = async () => {
    if (!(await directEdit.confirmIfDirty('return to the lobby'))) return;
    setViewMode('lobby');
    fetchGamesList();
  };
  const guardedEnterSoloSandbox = async (event?: React.MouseEvent) => {
    if (!(await directEdit.confirmIfDirty('open the Solo Sandbox'))) return;
    seats.handleEnterSoloSandbox(event);
  };
  const handleSignOut = async () => {
    await signOutUser();
    if (viewMode === 'multiplayer') setViewMode('lobby');
    triggerToast('Signed out — now in Guest Mode.');
  };
  const boardState = directEdit.effectiveGameState ?? gameState;

  return (
    <div
      className={styles.diplomacyAppShell}
      data-layout={isCompact ? 'compact' : 'wide'}
    >
      <AppHeader
        viewMode={viewMode}
        isCompact={isCompact}
        gameState={boardState}
        activeGameId={activeGameId}
        activeGameSummary={activeGameSummary}
        playerPower={playerPower}
        wsConnected={wsConnected}
        displayPrefs={displayPrefs}
        displayPrefsSaveState={displayPrefsSaveState}
        updateDisplayPrefs={updateDisplayPrefs}
        authUser={authUser}
        openAuthPrompt={openAuthPrompt}
        openAccountModal={openAccountModal}
        handleSignOut={handleSignOut}
        handleBackToLobby={handleBackToLobby}
        handleEnterSoloSandbox={guardedEnterSoloSandbox}
        handleFinalizeClick={handleFinalizeClick}
        toolsDrawerOpen={layout.toolsDrawerOpen}
        setToolsDrawerOpen={layout.setToolsDrawerOpen}
        toolsToggleRef={layout.toolsToggleRef}
        isGameCreator={isGameCreator}
        directEditActive={directEditActive}
        openAdminTools={openAdminTools}
        onToggleDirectEdit={handleToggleEditBoard}
        turnClockOpen={isGameCreator && adminModalOpen}
        onExitAdmin={handleExitAdmin}
        toastBanner={toastBanner}
        historyEntries={turnHistory.entries}
        historyViewIndex={turnHistory.viewIndex}
        historyPower={turnHistory.power}
        historyLocked={adminModeActive}
        onSelectHistoryTurn={showPastTurn}
        onStepHistoryTurn={stepPastTurn}
        onSelectHistoryPower={turnHistory.setPower}
        onOpenGameOverModal={openGameOverModal}
      />

      {/* VIEW 1: MAIN PAGE / LOBBY */}
      {viewMode === 'lobby' ? (
        <LobbyView
          user={authUser}
          games={gamesList}
          loadingGames={loadingGames}
          onRefreshGames={fetchGamesList}
          onEnterSandbox={guardedEnterSoloSandbox}
          onOpenAuth={openAuthPrompt}
          onCreateGame={seats.handleCreateMultiplayerGame}
          onJoinOrEnterGame={seats.handleJoinOrEnterMultiplayerGame}
          onOpenSurrenderModal={seats.handleOpenSurrenderModal}
        />
      ) : (
        <GameWorkspace
          viewMode={viewMode}
          isCompact={isCompact}
          gameState={boardState}
          provinces={provinces}
          activeGameSummary={activeGameSummary}
          playerPower={playerPower}
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
          historyTurn={historyTurn}
          viewedEntry={viewedEntry}
          showPastTurn={showPastTurn}
          stepPastTurn={stepPastTurn}
          mapRef={mapRef}
          zoomPercent={zoomPercent}
          setZoomPercent={setZoomPercent}
          displayPrefs={displayPrefs}
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
          handleGenerateAIMoves={handleGenerateAIMoves}
          handleAIStepTurn={handleAIStepTurn}
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
          handleSelectPower={seats.handleSelectPower}
          handleOpenSurrenderModal={seats.handleOpenSurrenderModal}
          isGameCreator={isGameCreator}
          directEditActive={directEditActive}
          historyLocked={adminModeActive}
          directEdit={directEdit}
          turnClockSettings={
            isGameCreator && adminModalOpen
              ? {
                  isOpen: true,
                  onClose: () => setAdminModalOpen(false),
                  gameId: activeGameId,
                  gameState,
                  user: authUser,
                  onStateUpdated: handleAdminUpdateState,
                  onToast: triggerToast,
                }
              : undefined
          }
        />
      )}

      <AppModals
        gameState={gameState}
        playerPower={playerPower}
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
        handleSignOut={handleSignOut}
        confirmModal={confirmModal}
        viewMode={viewMode}
        provinces={provinces}
        activeGameSummary={activeGameSummary}
        gameOverModalOpen={gameOverModalOpen}
        onCloseGameOverModal={closeGameOverModal}
        onReturnToLobby={() => {
          closeGameOverModal();
          void handleBackToLobby();
        }}
      />
    </div>
  );
}

export default App;
