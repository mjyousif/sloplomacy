import { useEffect, useState } from 'react';
import './App.css';
import { AuthModal } from './components/AuthModal';
import { EuropeMap } from './components/EuropeMap';
import { LobbyView } from './components/LobbyView';
import { MacroSidebar } from './components/MacroSidebar';
import { SanityCheckModal } from './components/SanityCheckModal';
import {
  getInitialAuthUser,
  signOutUser,
  subscribeToAuthChanges,
} from './lib/supabase';
import {
  AuthUser,
  FinalizeResponse,
  GameState,
  MultiplayerGameSummary,
  Order,
  POWER_METADATA,
  Power,
  ProvinceInfo,
  SimulationResult,
  ValidationIssue,
} from './types/diplomacy';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Compass,
  Crown,
  FlaskConical,
  Home,
  LogIn,
  LogOut,
  Save,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';

const API_BASE = '/api';

export function App() {
  // Navigation & Mode State
  const [viewMode, setViewMode] = useState<'lobby' | 'sandbox' | 'multiplayer'>('lobby');
  const [activeGameId, setActiveGameId] = useState<string>('proto_1901');
  const [activeGameSummary, setActiveGameSummary] =
    useState<MultiplayerGameSummary | null>(null);
  const [lockedPower, setLockedPower] = useState<Power | null>(null);

  // Auth State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');

  // Lobby Games State
  const [gamesList, setGamesList] = useState<MultiplayerGameSummary[]>([]);
  const [loadingGames, setLoadingGames] = useState<boolean>(false);

  // Board & Tactical Engine State
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [provinces, setProvinces] = useState<Record<string, ProvinceInfo>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI Interaction State
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [highlightedProvinces, setHighlightedProvinces] = useState<string[]>([]);
  const [sandboxMode, setSandboxMode] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showSimulationOverlay, setShowSimulationOverlay] = useState<boolean>(false);

  // Sanity Check Modal State
  const [sanityModalOpen, setSanityModalOpen] = useState<boolean>(false);
  const [sanityModalIssues, setSanityModalIssues] = useState<ValidationIssue[]>([]);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const openAuthPrompt = (reason?: string, tab: 'signin' | 'signup' = 'signin') => {
    setAuthModalReason(reason || null);
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const applyServerState = (st: GameState) => {
    setGameState(st);
    if (st.last_resolution) {
      setSimulationResult(st.last_resolution);
    }
  };

  const fetchGamesList = async () => {
    try {
      setLoadingGames(true);
      const res = await fetch(`${API_BASE}/games`);
      if (res.ok) {
        const list: MultiplayerGameSummary[] = await res.json();
        setGamesList(list);
      }
    } catch (e) {
      console.error('Failed to fetch games list:', e);
    } finally {
      setLoadingGames(false);
    }
  };

  const fetchGame = async (gid: string = activeGameId) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/game?game_id=${encodeURIComponent(gid)}`);
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json();
      applyServerState(data.state);
      setProvinces(data.provinces);
      if (data.summary) {
        setActiveGameSummary(data.summary);
      }
      setErrorMsg(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect to Diplomacy backend server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getInitialAuthUser().then((u) => setAuthUser(u));
    const unsub = subscribeToAuthChanges((u) => setAuthUser(u));
    fetchGame('proto_1901');
    fetchGamesList();
    return () => unsub();
  }, []);

  const handleEnterSoloSandbox = async () => {
    setActiveGameId('proto_1901');
    setActiveGameSummary(null);
    setLockedPower(null);
    setViewMode('sandbox');
    await fetchGame('proto_1901');
  };

  const handleCreateMultiplayerGame = async (name: string, power: Power) => {
    if (!authUser) {
      openAuthPrompt('Please sign in to create a multiplayer game.', 'signup');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          creator_power: power,
          user_id: authUser.id,
          email: authUser.email,
          display_name: authUser.displayName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not create multiplayer campaign.');
        return;
      }
      const summary: MultiplayerGameSummary = await res.json();
      await fetchGamesList();
      await handleJoinOrEnterMultiplayerGame(summary.game_id, power);
      triggerToast(
        `Created "${summary.name}" — You are commanding ${POWER_METADATA[power].shortName}!`
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleJoinOrEnterMultiplayerGame = async (gameId: string, power: Power) => {
    if (!authUser) {
      openAuthPrompt(
        `Sign in to claim ${POWER_METADATA[power].shortName} and play multiplayer.`,
        'signin'
      );
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
            display_name: authUser.displayName,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Unable to join power in this match.');
        return;
      }
      const data = await res.json();
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
    }
  };

  const handleSaveSandboxToAccount = async () => {
    if (!authUser) {
      openAuthPrompt(
        'Sign in or create a free account to save this tactical sandbox scenario to your profile.',
        'signup'
      );
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/games/save-sandbox?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${authUser.displayName}'s ${
              gameState?.season || 'Spring'
            } ${gameState?.year || 1901} Study (${
              POWER_METADATA[gameState?.active_power || 'FRANCE'].shortName
            })`,
            user_id: authUser.id,
            email: authUser.email,
            display_name: authUser.displayName,
          }),
        }
      );
      if (res.ok) {
        const saved: MultiplayerGameSummary = await res.json();
        await fetchGamesList();
        triggerToast(`Saved "${saved.name}" to your account!`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPower = async (power: Power) => {
    // In multiplayer mode, country is locked to the player's claimed power
    if (viewMode === 'multiplayer' && lockedPower && power !== lockedPower) {
      triggerToast(
        `Country locked: You are playing as ${POWER_METADATA[lockedPower].shortName} in this multiplayer campaign.`
      );
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/power?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power }),
        }
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

  const handleUpdateOrder = async (order: Order) => {
    // In multiplayer mode without Sandbox Pre-Move active, only allow ordering own power's units
    if (
      viewMode === 'multiplayer' &&
      lockedPower &&
      !sandboxMode &&
      order.power !== lockedPower
    ) {
      triggerToast(
        `Enable "Sandbox Pre-Moves" to plot hypothetical orders for foreign powers.`
      );
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/order?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmAllHolds = async () => {
    if (!gameState) return;
    try {
      const res = await fetch(
        `${API_BASE}/orders/confirm-all?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: gameState.active_power }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast(
          `Confirmed all current orders for ${POWER_METADATA[gameState.active_power].shortName}.`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearForeignPreMoves = async () => {
    if (!gameState) return;
    try {
      const res = await fetch(
        `${API_BASE}/sandbox/clear-foreign?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: gameState.active_power }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast('Cleared all hypothetical foreign pre-moves.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleSandboxMode = async () => {
    if (!gameState) return;
    const entering = !sandboxMode;
    try {
      if (entering) {
        const res = await fetch(
          `${API_BASE}/sandbox/enter?game_id=${encodeURIComponent(activeGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: gameState.active_power }),
          }
        );
        if (res.ok) {
          const st: GameState = await res.json();
          applyServerState(st);
        }
        setSandboxMode(true);
        setShowSimulationOverlay(true);
        triggerToast(
          'Entered Sandbox Mode: Plot hypothetical foreign moves to test outcomes. Exiting Sandbox will clear foreign guesses!'
        );
      } else {
        const res = await fetch(
          `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(activeGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: gameState.active_power }),
          }
        );
        if (res.ok) {
          const st: GameState = await res.json();
          applyServerState(st);
        }
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast(
          `Exited Sandbox Mode — hypothetical foreign moves discarded. Showing only ${
            POWER_METADATA[gameState.active_power].shortName
          }'s real orders.`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalizeClick = async (force = false) => {
    if (!gameState) return;
    try {
      const res = await fetch(
        `${API_BASE}/finalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: gameState.active_power, force }),
        }
      );
      if (res.ok) {
        const data: FinalizeResponse = await res.json();
        applyServerState(data.state);
        if (data.requires_confirmation) {
          setSanityModalIssues(data.issues);
          setSanityModalOpen(true);
        } else {
          setSanityModalOpen(false);
          triggerToast(
            `${POWER_METADATA[gameState.active_power].name} orders locked & finalized!`
          );
          fetchGamesList();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfinalizeClick = async () => {
    if (!gameState) return;
    try {
      const res = await fetch(
        `${API_BASE}/unfinalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: gameState.active_power }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast('Orders unlocked for editing.');
        fetchGamesList();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulatePreMoves = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/simulate?game_id=${encodeURIComponent(activeGameId)}`,
        { method: 'POST' }
      );
      if (res.ok) {
        const sim: SimulationResult = await res.json();
        setSimulationResult(sim);
        setShowSimulationOverlay((prev) => !prev);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAdjudicateTurn = async () => {
    try {
      const res = await fetch(
        `${API_BASE}/adjudicate?game_id=${encodeURIComponent(activeGameId)}`,
        { method: 'POST' }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(`Turn resolved! Now in ${st.season} ${st.year} (${st.phase} Phase).`);
        fetchGamesList();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadScenario = async (scenarioId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/scenario?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario_id: scenarioId,
            active_power: gameState?.active_power,
          }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast('Reset to Standard Spring 1901.');
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

  const activePowerIssues = gameState.issues.filter(
    (i) => i.power === gameState.active_power
  );
  const activeErrors = activePowerIssues.filter((i) => i.severity === 'error');
  const activeWarnings = activePowerIssues.filter((i) => i.severity === 'warning');

  return (
    <div className="diplomacy-app-shell">
      {/* TOP COMMAND HEADER BAR */}
      <header className="imperial-top-header">
        <div className="brand-and-nav">
          <div
            className="brand-block clickable"
            onClick={() => {
              setViewMode('lobby');
              fetchGamesList();
            }}
            title="Return to Main Lobby"
          >
            <div className="brand-emblem">
              <Compass size={22} />
            </div>
            <div>
              <h1 className="brand-title">SLOPLOMACY 1901</h1>
              <span className="brand-subtitle">
                TACTICAL ENGINE &amp; MULTIPLAYER CHANCELLERY
              </span>
            </div>
          </div>

          {/* Primary Navigation Switcher */}
          <nav className="top-view-nav">
            <button
              type="button"
              className={`nav-tab-btn ${viewMode === 'lobby' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('lobby');
                fetchGamesList();
              }}
            >
              <Home size={14} />
              <span>Main Page</span>
            </button>
            <button
              type="button"
              className={`nav-tab-btn ${viewMode === 'sandbox' ? 'active' : ''}`}
              onClick={handleEnterSoloSandbox}
            >
              <FlaskConical size={14} />
              <span>Tactical Sandbox</span>
            </button>
            {viewMode === 'multiplayer' && activeGameSummary && (
              <span className="nav-active-match-pill">
                <Crown size={13} />
                <span>
                  {activeGameSummary.name} (
                  {POWER_METADATA[gameState.active_power].shortName})
                </span>
              </span>
            )}
          </nav>
        </div>

        {/* Center Board Readout (Only when viewing Map Board) */}
        {viewMode !== 'lobby' && (
          <div className="header-center-telemetry">
            <div className="turn-chronicle-pill">
              <Calendar size={15} className="turn-cal-icon" />
              <span className="turn-season-text">
                {gameState.season.toUpperCase()} {gameState.year}
              </span>
              <span className="turn-phase-divider">•</span>
              <span className="turn-phase-text">
                {gameState.phase.toUpperCase()} PHASE
              </span>
            </div>

            <div className="header-sanity-readout">
              {activeErrors.length > 0 ? (
                <div
                  className="header-error-pill"
                  onClick={() => handleFinalizeClick(false)}
                  title="Click to open Sanity Check Diagnostics"
                >
                  <AlertOctagon size={15} />
                  <span>
                    Error: {activeErrors.length}
                    {activeWarnings.length > 0
                      ? ` • Warning: ${activeWarnings.length}`
                      : ''}
                  </span>
                </div>
              ) : activeWarnings.length > 0 ? (
                <div
                  className="header-warning-pill"
                  onClick={() => handleFinalizeClick(false)}
                  title="Click to open Sanity Check Diagnostics"
                >
                  <AlertTriangle size={15} />
                  <span>Warning: {activeWarnings.length}</span>
                </div>
              ) : (
                <div className="header-clean-pill">
                  <ShieldCheck size={15} />
                  <span>Valid Moves</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Header Controls: Board Actions + User Account */}
        <div className="header-right-actions">
          {viewMode !== 'lobby' && (
            <>
              {viewMode === 'sandbox' && (
                <button
                  type="button"
                  className="header-btn"
                  onClick={handleSaveSandboxToAccount}
                  title="Save current sandbox scenario to your account"
                >
                  <Save size={14} />
                  <span>Save Sandbox</span>
                </button>
              )}
              <button
                type="button"
                className={`header-btn ${sandboxMode ? 'sandbox-active' : ''}`}
                onClick={handleToggleSandboxMode}
                title="Enter Sandbox Mode to guess & test foreign moves. Exiting Sandbox discards foreign guesses."
              >
                <FlaskConical size={15} />
                <span>
                  Sandbox Pre-Moves: {sandboxMode ? 'ON (Exit to Clear)' : 'OFF'}
                </span>
              </button>
            </>
          )}

          {/* User Authentication Controls */}
          {authUser ? (
            <div className="header-user-Menu">
              <span className="header-user-badge" title={authUser.email}>
                <UserIcon size={13} />
                <span>{authUser.displayName}</span>
              </span>
              <button
                type="button"
                className="header-auth-btn signout"
                onClick={async () => {
                  await signOutUser();
                  if (viewMode === 'multiplayer') {
                    setViewMode('lobby');
                  }
                  triggerToast('Signed out — now in Guest Mode.');
                }}
                title="Sign Out"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="header-user-Menu">
              <span className="header-guest-tag">Guest Mode</span>
              <button
                type="button"
                className="header-auth-btn signin"
                onClick={() => openAuthPrompt(undefined, 'signin')}
              >
                <LogIn size={14} />
                <span>Sign In / Register</span>
              </button>
            </div>
          )}
        </div>
      </header>

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
        />
      ) : (
        /* VIEW 2: INTERACTIVE EUROPE MAP + MACRO SIDEBAR (SANDBOX OR MULTIPLAYER) */
        <main className="war-room-workspace">
          <EuropeMap
            provinces={provinces}
            units={gameState.units}
            orders={gameState.orders}
            ownership={gameState.ownership}
            activePower={gameState.active_power}
            sandboxMode={sandboxMode}
            selectedUnitId={selectedUnitId}
            hoveredUnitId={hoveredUnitId}
            highlightedProvinces={highlightedProvinces}
            issues={gameState.issues}
            simulationResult={simulationResult}
            showSimulationOverlay={showSimulationOverlay}
            onSelectUnit={setSelectedUnitId}
            onHoverUnit={setHoveredUnitId}
            onUpdateOrder={handleUpdateOrder}
            phase={gameState.phase}
            season={gameState.season}
            builds={gameState.builds}
            retreats={gameState.retreats}
            onClearSimulationOverlay={() => setShowSimulationOverlay(false)}
            onAdjudicateTurn={handleAdjudicateTurn}
          />

          <MacroSidebar
            provinces={provinces}
            units={gameState.units}
            orders={gameState.orders}
            ownership={gameState.ownership}
            activePower={gameState.active_power}
            finalizedPowers={gameState.finalized_powers}
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
            isMultiplayer={viewMode === 'multiplayer'}
            onSelectPower={handleSelectPower}
            onToggleSandboxMode={handleToggleSandboxMode}
            onSelectUnit={setSelectedUnitId}
            onHoverUnit={setHoveredUnitId}
            onHighlightProvinces={setHighlightedProvinces}
            onUpdateOrder={handleUpdateOrder}
            onConfirmAllHolds={handleConfirmAllHolds}
            onClearForeignPreMoves={handleClearForeignPreMoves}
            onFinalizeClick={() => handleFinalizeClick(false)}
            onUnfinalizeClick={handleUnfinalizeClick}
            onSimulatePreMoves={handleSimulatePreMoves}
            onAdjudicateTurn={handleAdjudicateTurn}
            onLoadScenario={handleLoadScenario}
            onSaveSandboxClick={handleSaveSandboxToAccount}
          />
        </main>
      )}

      {/* "ARE YOU SURE?" FINALIZE SANITY CHECK MODAL */}
      <SanityCheckModal
        isOpen={sanityModalOpen}
        power={gameState.active_power}
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
    </div>
  );
}

export default App;
