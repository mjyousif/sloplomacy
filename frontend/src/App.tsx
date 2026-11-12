import { useRef, useState } from 'react';
import './styles';
import { AlertTriangle, Compass } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { AppModals } from './components/AppModals';
import { useConfirm } from './components/ConfirmModal';
import type { EuropeMapHandle } from './components/EuropeMap';
import { GameWorkspace } from './components/GameWorkspace';
import { LobbyView } from './components/LobbyView';
import { useAuthSession } from './hooks/useAuthSession';
import { useCompactLayout } from './hooks/useCompactLayout';
import { useDisplayPrefs } from './hooks/useDisplayPrefs';
import { useGameSession } from './hooks/useGameSession';
import { useGameSync } from './hooks/useGameSync';
import { useMatchActions } from './hooks/useMatchActions';
import { useSandboxExit } from './hooks/useSandboxExit';
import { useSandboxSession } from './hooks/useSandboxSession';
import { useSeatActions } from './hooks/useSeatActions';
import { useToast } from './hooks/useToast';
import { useTurnHistory } from './hooks/useTurnHistory';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import { signOutUser } from './lib/supabase';
import type { SimulationResult } from './types/diplomacy';
import { checkIsGameCreator } from './utils/adminHelpers';
import { turnLabel } from './utils/timerHelpers';

export function App() {
  // Navigation & Mode State
  const [viewMode, setViewMode] = useState<'lobby' | 'sandbox' | 'multiplayer'>(
    () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (
          params.get('view') === 'sandbox' ||
          window.location.hash === '#sandbox'
        ) {
          return 'sandbox';
        }
      }
      return 'lobby';
    },
  );
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  // The open game, its summary and the player's seat, the board, and the lobby's games.
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

  // Auth State
  const {
    authUser,
    setAuthUser,
    authModalOpen,
    setAuthModalOpen,
    authModalReason,
    authModalTab,
    openAuthPrompt,
  } = useAuthSession();
  const {
    prefs: displayPrefs,
    saveState: displayPrefsSaveState,
    updatePrefs: updateDisplayPrefs,
  } = useDisplayPrefs(authUser);

  // UI Interaction State
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [highlightedProvinces, setHighlightedProvinces] = useState<string[]>(
    [],
  );
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] =
    useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(105);
  // Phone-sized screens get the compact layout, styled from styles/compact/.
  const isCompact = useCompactLayout();
  // The sidebar rails on desktop; the order sheet and tools drawer on a phone.
  const {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    sheetSnap,
    setSheetSnap,
    toolsDrawerOpen,
    setToolsDrawerOpen,
    toolsToggleRef,
    handleDockedBarChange,
    closeToolsDrawer,
  } = useWorkspaceLayout({ viewMode, activeGameId, isCompact });
  const mapRef = useRef<EuropeMapHandle | null>(null);

  const { toastBanner, triggerToast } = useToast();
  const { confirm, confirmModal } = useConfirm();
  // Passcodes this player typed for private matches during this visit, so the live
  // socket can present them. Never saved: a reload falls back to polling.
  const [matchPasscodes, setMatchPasscodes] = useState<Record<string, string>>(
    {},
  );

  // The turn selector. It always reads the real game, even from a private sandbox copy.
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
  // Direct-Edit stays on when the host moves to another game, where it must not apply.
  const directEditActive = isGameCreator && adminOverrideActive;
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

  // Leaving the match board by any route closes its private sandbox.
  useSandboxExit({
    viewMode,
    sandboxGameId,
    playerPower,
    setSandboxGameId,
    setSandboxMode,
    setShowSimulationOverlay,
  });

  // Orders, finalizing, resolving the turn and the turn clock.
  const {
    sanityModalOpen,
    setSanityModalOpen,
    sanityModalIssues,
    handleUpdateOrder,
    handleConfirmAllHolds,
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

  // Taking and giving up a seat, and the Surrender & Leave modal.
  const {
    surrenderModalOpen,
    setSurrenderModalOpen,
    surrenderModalGame,
    surrenderModalPower,
    handleEnterSoloSandbox,
    handleCreateMultiplayerGame,
    handleJoinOrEnterMultiplayerGame,
    handleOpenSurrenderModal,
    handleSurrenderPower,
    handleLeaveGame,
    handleSelectPower,
  } = useSeatActions({
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
      <div className="loading-screen">
        <Compass className="spin-icon" size={38} />
        <h2>Unrolling 1901 Imperial War Atlas...</h2>
      </div>
    );
  }

  if (errorMsg || !gameState) {
    return (
      <div className="error-screen">
        <AlertTriangle size={36} />
        <h2>Backend Connection Required</h2>
        <p>{errorMsg}</p>
        <button onClick={() => fetchGame()}>Retry Connection</button>
      </div>
    );
  }

  const openAdminTools = () => {
    if (!requireRealBoard('use the admin tools')) return;
    turnHistory.goLive();
    setAdminModalOpen(true);
  };

  // A past turn on the map. Nothing on it can be selected, so any selection is dropped.
  const historyTurn = turnHistory.turn;
  const viewedEntry =
    turnHistory.viewIndex === null
      ? null
      : (turnHistory.entries[turnHistory.viewIndex] ?? null);
  const showPastTurn = (index: number | null) => {
    if (index !== null) {
      setSelectedUnitId(null);
      setHighlightedProvinces([]);
    }
    turnHistory.select(index);
  };
  const stepPastTurn = (delta: -1 | 1) => {
    setSelectedUnitId(null);
    setHighlightedProvinces([]);
    turnHistory.step(delta);
  };

  const handleBackToLobby = () => {
    setViewMode('lobby');
    fetchGamesList();
  };

  const handleSignOut = async () => {
    await signOutUser();
    if (viewMode === 'multiplayer') {
      setViewMode('lobby');
    }
    triggerToast('Signed out — now in Guest Mode.');
  };

  return (
    <div
      className="diplomacy-app-shell"
      data-layout={isCompact ? 'compact' : 'wide'}
    >
      <AppHeader
        viewMode={viewMode}
        isCompact={isCompact}
        gameState={gameState}
        activeGameId={activeGameId}
        activeGameSummary={activeGameSummary}
        playerPower={playerPower}
        wsConnected={wsConnected}
        displayPrefs={displayPrefs}
        displayPrefsSaveState={displayPrefsSaveState}
        updateDisplayPrefs={updateDisplayPrefs}
        authUser={authUser}
        openAuthPrompt={openAuthPrompt}
        handleSignOut={handleSignOut}
        handleBackToLobby={handleBackToLobby}
        handleEnterSoloSandbox={handleEnterSoloSandbox}
        handleFinalizeClick={handleFinalizeClick}
        toolsDrawerOpen={toolsDrawerOpen}
        setToolsDrawerOpen={setToolsDrawerOpen}
        toolsToggleRef={toolsToggleRef}
        directEditActive={directEditActive}
        openAdminTools={openAdminTools}
        setAdminOverrideActive={setAdminOverrideActive}
        toastBanner={toastBanner}
      />

      {/* VIEW 1: MAIN PAGE / LOBBY */}
      {viewMode === 'lobby' ? (
        <LobbyView
          user={authUser}
          games={gamesList}
          loadingGames={loadingGames}
          onRefreshGames={fetchGamesList}
          onEnterSandbox={handleEnterSoloSandbox}
          onOpenAuth={openAuthPrompt}
          onCreateGame={handleCreateMultiplayerGame}
          onJoinOrEnterGame={handleJoinOrEnterMultiplayerGame}
          onOpenSurrenderModal={handleOpenSurrenderModal}
        />
      ) : (
        /* VIEW 2: INTERACTIVE EUROPE MAP + MACRO SIDEBAR (SANDBOX OR MULTIPLAYER) */
        <GameWorkspace
          viewMode={viewMode}
          isCompact={isCompact}
          gameState={gameState}
          provinces={provinces}
          activeGameSummary={activeGameSummary}
          playerPower={playerPower}
          lockedPower={lockedPower}
          leftSidebarCollapsed={leftSidebarCollapsed}
          setLeftSidebarCollapsed={setLeftSidebarCollapsed}
          rightSidebarCollapsed={rightSidebarCollapsed}
          setRightSidebarCollapsed={setRightSidebarCollapsed}
          sheetSnap={sheetSnap}
          setSheetSnap={setSheetSnap}
          toolsDrawerOpen={toolsDrawerOpen}
          closeToolsDrawer={closeToolsDrawer}
          handleDockedBarChange={handleDockedBarChange}
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
          handleUpdateOrder={handleUpdateOrder}
          handleConfirmAllHolds={handleConfirmAllHolds}
          handleFinalizeClick={handleFinalizeClick}
          handleUnfinalizeClick={handleUnfinalizeClick}
          handleAdjudicateTurn={handleAdjudicateTurn}
          postTimerAction={postTimerAction}
          handleTimerExpired={handleTimerExpired}
          handleSelectPower={handleSelectPower}
          handleOpenSurrenderModal={handleOpenSurrenderModal}
          isGameCreator={isGameCreator}
          directEditActive={directEditActive}
          openAdminTools={openAdminTools}
          adminOverrideActive={adminOverrideActive}
          setAdminOverrideActive={setAdminOverrideActive}
        />
      )}

      <AppModals
        gameState={gameState}
        provinces={provinces}
        activeGameId={activeGameId}
        playerPower={playerPower}
        sanityModalOpen={sanityModalOpen}
        setSanityModalOpen={setSanityModalOpen}
        sanityModalIssues={sanityModalIssues}
        handleFinalizeClick={handleFinalizeClick}
        setSelectedUnitId={setSelectedUnitId}
        setHighlightedProvinces={setHighlightedProvinces}
        surrenderModalOpen={surrenderModalOpen}
        setSurrenderModalOpen={setSurrenderModalOpen}
        surrenderModalGame={surrenderModalGame}
        surrenderModalPower={surrenderModalPower}
        handleSurrenderPower={handleSurrenderPower}
        handleLeaveGame={handleLeaveGame}
        saveSandboxModalOpen={saveSandboxModalOpen}
        setSaveSandboxModalOpen={setSaveSandboxModalOpen}
        savingSandbox={savingSandbox}
        handleSaveSandboxToAccount={handleSaveSandboxToAccount}
        isGameCreator={isGameCreator}
        adminModalOpen={adminModalOpen}
        setAdminModalOpen={setAdminModalOpen}
        adminOverrideActive={adminOverrideActive}
        setAdminOverrideActive={setAdminOverrideActive}
        applyServerState={applyServerState}
        fetchGamesList={fetchGamesList}
        handleLoadScenario={handleLoadScenario}
        triggerToast={triggerToast}
        authUser={authUser}
        setAuthUser={setAuthUser}
        authModalOpen={authModalOpen}
        setAuthModalOpen={setAuthModalOpen}
        authModalTab={authModalTab}
        authModalReason={authModalReason}
        confirmModal={confirmModal}
      />
    </div>
  );
}

export default App;
