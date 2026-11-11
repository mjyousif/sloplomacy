import { useRef, useState } from 'react';
import './App.css';
import './compact.css';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  ShieldAlert,
} from 'lucide-react';
import { AdminToolsModal } from './components/AdminToolsModal';
import { AuthModal } from './components/AuthModal';
import { CompactTopBar } from './components/CompactTopBar';
import { useConfirm } from './components/ConfirmModal';
import { EuropeMap, type EuropeMapHandle } from './components/EuropeMap';
import { LobbyView } from './components/LobbyView';
import { MacroSidebar } from './components/MacroSidebar';
import { PhaseTimerWidget } from './components/PhaseTimerWidget';
import { SanityCheckModal } from './components/SanityCheckModal';
import { SaveSandboxModal } from './components/SaveSandboxModal';
import { SurrenderModal } from './components/SurrenderModal';
import { ToolsSidebar } from './components/ToolsSidebar';
import { TopHeader } from './components/TopHeader';
import {
  TurnHistoryPill,
  TurnHistorySelector,
} from './components/TurnHistorySelector';
import { useAuthSession } from './hooks/useAuthSession';
import { useCompactLayout } from './hooks/useCompactLayout';
import { useDisplayPrefs } from './hooks/useDisplayPrefs';
import { useGameSession } from './hooks/useGameSession';
import { useGameSync } from './hooks/useGameSync';
import { useMatchActions } from './hooks/useMatchActions';
import { useSandboxExit } from './hooks/useSandboxExit';
import { useSandboxSession } from './hooks/useSandboxSession';
import { useToast } from './hooks/useToast';
import { useTurnHistory } from './hooks/useTurnHistory';
import { useWorkspaceLayout } from './hooks/useWorkspaceLayout';
import { authedFetch, getAuthHeaders, signOutUser } from './lib/supabase';
import {
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type SimulationResult,
  type ValidationIssue,
} from './types/diplomacy';
import { checkIsGameCreator } from './utils/adminHelpers';
import {
  readStoredSoloSandboxId,
  writeStoredSoloSandboxId,
} from './utils/soloSandboxStorage';
import { turnLabel } from './utils/timerHelpers';

const API_BASE = '/api';
// Stable empties for a past turn, so the map's memoized layers are not rebuilt every render.
const NO_ISSUES: ValidationIssue[] = [];
const NO_PROVINCES: string[] = [];

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
  // Phone-sized screens get the compact layout, styled from compact.css.
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

  // Surrender & Leave Modal State
  const [surrenderModalOpen, setSurrenderModalOpen] = useState<boolean>(false);
  const [surrenderModalGame, setSurrenderModalGame] =
    useState<MultiplayerGameSummary | null>(null);
  const [surrenderModalPower, setSurrenderModalPower] = useState<Power | null>(
    null,
  );

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

  const handleEnterSoloSandbox = async (event?: React.MouseEvent) => {
    if (viewMode === 'multiplayer' && activeGameSummary) {
      const confirmLeave = await confirm(
        {
          title: 'Switch to the Solo Sandbox?',
          message: `You leave match "${activeGameSummary.name}" for the Solo Sandbox board. Your submitted orders remain safe on the server.`,
          confirmLabel: 'Switch',
        },
        event,
      );
      if (!confirmLeave) return;
    }
    try {
      setLoading(true);
      const storedDraftId = readStoredSoloSandboxId();
      const query = storedDraftId
        ? `?resume_game_id=${encodeURIComponent(storedDraftId)}`
        : '';
      const res = await authedFetch(`${API_BASE}/games/solo-sandbox${query}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(`Failed to create solo sandbox (${res.status})`);
      }
      const data = await res.json();
      boardRequestSeq.current++;
      if (data.summary?.is_draft) {
        writeStoredSoloSandboxId(data.state.game_id);
      }
      setActiveGameId(data.state.game_id);
      setActiveGameSummary(data.summary);
      applyServerState(data.state);
      setProvinces(data.provinces);
      setSelectedUnitId(null);
      setLockedPower(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);
      setViewMode('sandbox');
    } catch (err: any) {
      console.error(err);
      triggerToast('Could not launch personal solo sandbox.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMultiplayerGame = async (
    name: string,
    power: Power,
    isPrivate?: boolean,
    passcode?: string,
  ): Promise<MultiplayerGameSummary | void> => {
    if (!authUser) {
      openAuthPrompt('Please sign in to create a multiplayer game.', 'signup');
      return;
    }
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name,
          creator_power: power,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
          is_private: Boolean(isPrivate),
          passcode: passcode?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not create multiplayer campaign.');
        return;
      }
      const summary: MultiplayerGameSummary = await res.json();
      await fetchGamesList();
      if (!isPrivate || !passcode) {
        await handleJoinOrEnterMultiplayerGame(summary.game_id, power);
        triggerToast(
          `Created "${summary.name}" — You are commanding ${POWER_METADATA[power].shortName}!`,
        );
      }
      return summary;
    } catch (e) {
      console.error(e);
    }
  };

  const handleJoinOrEnterMultiplayerGame = async (
    gameId: string,
    power: Power,
    passcode?: string,
  ) => {
    if (!authUser) {
      openAuthPrompt(
        `Sign in to claim ${POWER_METADATA[power].shortName} and play multiplayer.`,
        'signin',
      );
      return;
    }
    try {
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
            display_name: authUser.displayName,
            passcode: passcode?.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || 'Unable to join power in this match.';
        triggerToast(msg);
        throw new Error(msg);
      }
      const data = await res.json();
      boardRequestSeq.current++;
      const typedPasscode = passcode?.trim();
      if (typedPasscode) {
        setMatchPasscodes((prev) => ({ ...prev, [gameId]: typedPasscode }));
      }
      setActiveGameId(gameId);
      setActiveGameSummary(data.summary);
      applyServerState(data.state);
      setProvinces(data.provinces);
      setSelectedUnitId(null);
      setSandboxMode(false);
      setShowSimulationOverlay(false);

      if (data.summary?.is_sandbox) {
        setLockedPower(null);
        setViewMode('sandbox');
      } else {
        setLockedPower(power);
        setViewMode('multiplayer');
      }
      await fetchGamesList();
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleOpenSurrenderModal = (
    game: MultiplayerGameSummary,
    power: Power,
  ) => {
    if (!requireRealBoard('surrender')) return;
    setSurrenderModalGame(game);
    setSurrenderModalPower(power);
    setSurrenderModalOpen(true);
  };

  const handleSurrenderPower = async (
    gameId: string,
    power: Power,
    leave: boolean,
  ) => {
    if (!authUser) {
      openAuthPrompt(
        'Please sign in to manage your sovereign position.',
        'signin',
      );
      return;
    }
    try {
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/surrender`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
            leave,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not process surrender action.');
        return;
      }
      const data = await res.json();
      if (leave) {
        if (activeGameId === gameId) {
          setViewMode('lobby');
          setLockedPower(null);
          setActiveGameSummary(null);
        }
        triggerToast(
          `Surrendered command of ${POWER_METADATA[power].shortName} and left match.`,
        );
      } else {
        applyServerState(data.state);
        if (data.summary) setActiveGameSummary(data.summary);
        triggerToast(
          `Command of ${POWER_METADATA[power].shortName} surrendered. Units stand in Civil Disorder.`,
        );
      }
      await fetchGamesList();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLeaveGame = async (gameId: string, power: Power) => {
    if (!authUser) {
      openAuthPrompt('Please sign in to leave this campaign.', 'signin');
      return;
    }
    try {
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/leave`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not leave match.');
        return;
      }
      if (activeGameId === gameId) {
        setViewMode('lobby');
        setLockedPower(null);
        setActiveGameSummary(null);
      }
      triggerToast('Left campaign.');
      await fetchGamesList();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPower = async (power: Power) => {
    // In multiplayer mode, country is locked to the player's claimed power
    if (viewMode === 'multiplayer' && lockedPower) {
      if (power !== lockedPower) {
        triggerToast(
          `Country locked: You are playing as ${POWER_METADATA[lockedPower].shortName} in this multiplayer campaign.`,
        );
      }
      return;
    }
    try {
      const res = await authedFetch(
        `${API_BASE}/power?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
  const viewingHistory = historyTurn !== null;
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
  const ignore = () => {};

  const activePowerIssues = gameState.issues.filter(
    (i) => i.power === playerPower,
  );
  const activeErrors = activePowerIssues.filter((i) => i.severity === 'error');
  const activeWarnings = activePowerIssues.filter(
    (i) => i.severity === 'warning',
  );

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
      {/* TOP COMMAND HEADER BAR (phones get a one-row bar with a ⋯ menu) */}
      {isCompact ? (
        <CompactTopBar
          viewMode={viewMode}
          turn={viewMode === 'lobby' ? null : gameState}
          winner={gameState.winner ?? null}
          errorCount={activeErrors.length}
          warningCount={activeWarnings.length}
          onOpenOrderCheck={() => handleFinalizeClick(false)}
          onBackToLobby={handleBackToLobby}
          wsConnected={wsConnected}
          syncDetail={
            viewMode === 'lobby' ? 'Lobby feed' : `Game ${activeGameId}`
          }
          matchLabel={
            viewMode === 'multiplayer' && activeGameSummary
              ? `${activeGameSummary.name} (${POWER_METADATA[playerPower].shortName})`
              : null
          }
          onEnterSoloSandbox={handleEnterSoloSandbox}
          displayPrefs={displayPrefs}
          displayPrefsSaveState={displayPrefsSaveState}
          onChangeDisplayPrefs={updateDisplayPrefs}
          authUser={authUser}
          onSignIn={() => openAuthPrompt(undefined, 'signin')}
          onSignOut={handleSignOut}
          toolsOpen={toolsDrawerOpen}
          onToggleTools={() => setToolsDrawerOpen((open) => !open)}
          toolsToggleRef={toolsToggleRef}
        />
      ) : (
        <TopHeader
          viewMode={viewMode}
          turn={gameState}
          winner={gameState.winner ?? null}
          errorCount={activeErrors.length}
          warningCount={activeWarnings.length}
          onOpenOrderCheck={() => handleFinalizeClick(false)}
          onBackToLobby={handleBackToLobby}
          onEnterSoloSandbox={handleEnterSoloSandbox}
          matchSummary={activeGameSummary}
          playerPower={playerPower}
          wsConnected={wsConnected}
          gameId={activeGameId}
          displayPrefs={displayPrefs}
          displayPrefsSaveState={displayPrefsSaveState}
          onChangeDisplayPrefs={updateDisplayPrefs}
          authUser={authUser}
          onSignIn={() => openAuthPrompt(undefined, 'signin')}
          onSignOut={handleSignOut}
        />
      )}

      {/* ADMIN DIRECT-EDIT OVERRIDE BANNER */}
      {directEditActive && (
        <div className="admin-override-banner">
          <span>
            <ShieldAlert size={16} />
            <strong>ADMIN DIRECT-EDIT ACTIVE:</strong> You have Game Creator
            authority to edit any power's moves or state directly on the board.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={openAdminTools}>
              Admin Console
            </button>
            <button type="button" onClick={() => setAdminOverrideActive(false)}>
              Disable Direct-Edit
            </button>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastBanner && (
        <div className="imperial-toast-banner">
          <CheckCircle2 size={16} />
          <span>{toastBanner}</span>
        </div>
      )}

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
        <main className="war-room-workspace">
          {/* LEFT SIDEBAR: Tools, Legend, Zoom, Standing, Sandbox & Admin */}
          <ToolsSidebar
            collapsed={leftSidebarCollapsed}
            onToggleCollapse={() => setLeftSidebarCollapsed((prev) => !prev)}
            variant={isCompact ? 'drawer' : 'panel'}
            open={toolsDrawerOpen}
            onClose={closeToolsDrawer}
            historyFooter={
              <TurnHistorySelector
                entries={turnHistory.entries}
                viewIndex={turnHistory.viewIndex}
                liveLabel={turnLabel(gameState)}
                power={turnHistory.power}
                onSelect={showPastTurn}
                onStep={stepPastTurn}
                onSelectPower={turnHistory.setPower}
                onPickedTurn={isCompact ? closeToolsDrawer : undefined}
              />
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
            isGameCreator={isGameCreator}
            onOpenAdminTools={openAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={() =>
              setAdminOverrideActive((prev) => !prev)
            }
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
            selectedUnitId={viewingHistory ? null : selectedUnitId}
            hoveredUnitId={viewingHistory ? null : hoveredUnitId}
            highlightedProvinces={
              viewingHistory ? NO_PROVINCES : highlightedProvinces
            }
            issues={viewingHistory ? NO_ISSUES : gameState.issues}
            simulationResult={historyTurn?.resolution ?? simulationResult}
            showSimulationOverlay={viewingHistory || showSimulationOverlay}
            onSelectUnit={viewingHistory ? ignore : setSelectedUnitId}
            onHoverUnit={viewingHistory ? ignore : setHoveredUnitId}
            onUpdateOrder={viewingHistory ? ignore : handleUpdateOrder}
            historyView={viewingHistory}
            historyPower={turnHistory.power}
            phase={historyTurn?.phase ?? gameState.phase}
            season={historyTurn?.season ?? gameState.season}
            builds={
              historyTurn ? (historyTurn.builds ?? null) : gameState.builds
            }
            retreats={
              historyTurn ? (historyTurn.retreats ?? null) : gameState.retreats
            }
            unitOptions={
              viewingHistory ? null : (gameState.unit_options ?? null)
            }
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
            participants={activeGameSummary?.participants}
            lobbyStatus={activeGameSummary?.status}
            onSelectUnit={setSelectedUnitId}
            onHoverUnit={setHoveredUnitId}
            onHighlightProvinces={setHighlightedProvinces}
            onUpdateOrder={handleUpdateOrder}
            onConfirmAllHolds={handleConfirmAllHolds}
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
      )}

      {/* "ARE YOU SURE?" FINALIZE SANITY CHECK MODAL */}
      <SanityCheckModal
        isOpen={sanityModalOpen}
        power={playerPower}
        issues={sanityModalIssues}
        onClose={() => setSanityModalOpen(false)}
        onInspectIssue={(issue) => {
          setSanityModalOpen(false);
          if (issue.unit_ids.length > 0) {
            setSelectedUnitId(issue.unit_ids[0]);
          }
          setHighlightedProvinces(issue.provinces);
        }}
        onConfirmFinalizeAnyway={() => handleFinalizeClick(true)}
      />

      {/* SURRENDER & LEAVE MODAL */}
      <SurrenderModal
        isOpen={surrenderModalOpen}
        onClose={() => setSurrenderModalOpen(false)}
        game={surrenderModalGame}
        power={surrenderModalPower}
        onSurrender={handleSurrenderPower}
        onLeave={handleLeaveGame}
      />

      {/* SAVE SANDBOX MODAL */}
      <SaveSandboxModal
        isOpen={saveSandboxModalOpen}
        defaultName={
          authUser
            ? `${authUser.displayName}'s ${
                gameState?.season || 'Spring'
              } ${gameState?.year || 1901} Study (${
                POWER_METADATA[playerPower].shortName
              })`
            : 'Tactical Sandbox Study'
        }
        saving={savingSandbox}
        onSave={handleSaveSandboxToAccount}
        onCancel={() => setSaveSandboxModalOpen(false)}
      />

      {/* GAME CREATOR ADMINISTRATOR MODAL */}
      {isGameCreator && gameState && (
        <AdminToolsModal
          isOpen={adminModalOpen}
          onClose={() => setAdminModalOpen(false)}
          gameId={activeGameId}
          gameState={gameState}
          provinces={provinces}
          user={authUser}
          onStateUpdated={(newState) => {
            applyServerState(newState);
            fetchGamesList();
          }}
          onToast={triggerToast}
          adminOverrideActive={adminOverrideActive}
          onToggleAdminOverride={() => setAdminOverrideActive((prev) => !prev)}
          onResetScenario={() => handleLoadScenario('standard_1901')}
        />
      )}

      {/* SUPABASE AUTHENTICATION MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
        reasonBanner={authModalReason}
        onSuccess={(u, msg) => {
          setAuthUser(u);
          if (msg) triggerToast(msg);
          fetchGamesList();
        }}
      />
      {confirmModal}
    </div>
  );
}

export default App;
