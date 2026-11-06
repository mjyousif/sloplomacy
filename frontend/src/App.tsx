import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { AuthModal } from './components/AuthModal';
import { EuropeMap, EuropeMapHandle } from './components/EuropeMap';
import { LobbyView } from './components/LobbyView';
import { MacroSidebar } from './components/MacroSidebar';
import { ToolsSidebar } from './components/ToolsSidebar';
import { AdminToolsModal } from './components/AdminToolsModal';
import { SanityCheckModal } from './components/SanityCheckModal';
import { SurrenderModal } from './components/SurrenderModal';
import { checkIsGameCreator, resolvePlayerPower } from './utils/adminHelpers';
import { useDiplomacyWebSocket } from './hooks/useDiplomacyWebSocket';
import {
  getAuthHeaders,
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
  WebSocketGameUpdate,
  WebSocketLobbyUpdate,
} from './types/diplomacy';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Compass,
  Crown,
  Flag,
  FlaskConical,
  Home,
  LogIn,
  LogOut,
  Save,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';

const API_BASE = '/api';

export function App() {
  // Navigation & Mode State
  const [viewMode, setViewMode] = useState<'lobby' | 'sandbox' | 'multiplayer'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'sandbox' || window.location.hash === '#sandbox') {
        return 'sandbox';
      }
    }
    return 'lobby';
  });
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
  // A multiplayer sandbox runs on a private server-side copy of the match under its own game id.
  const [sandboxGameId, setSandboxGameId] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showSimulationOverlay, setShowSimulationOverlay] = useState<boolean>(false);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] = useState<boolean>(false);
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(105);
  const mapRef = useRef<EuropeMapHandle | null>(null);

  // Sanity Check Modal State
  const [sanityModalOpen, setSanityModalOpen] = useState<boolean>(false);
  const [sanityModalIssues, setSanityModalIssues] = useState<ValidationIssue[]>([]);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Surrender & Leave Modal State
  const [surrenderModalOpen, setSurrenderModalOpen] = useState<boolean>(false);
  const [surrenderModalGame, setSurrenderModalGame] =
    useState<MultiplayerGameSummary | null>(null);
  const [surrenderModalPower, setSurrenderModalPower] = useState<Power | null>(null);

  const playerPower = resolvePlayerPower(viewMode, lockedPower, gameState?.active_power);
  // Drafts, AI plans and previews go to the private copy while there is one.
  const draftGameId = sandboxGameId ?? activeGameId;

  const triggerToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // The board in a private sandbox is hypothetical, so nothing real can be done from it.
  const requireRealBoard = (action: string): boolean => {
    if (!sandboxGameId) return true;
    triggerToast(`Exit Sandbox Mode to ${action}.`);
    return false;
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

  const handleWsGameUpdate = useCallback(
    (update: WebSocketGameUpdate) => {
      if (update.game_id !== activeGameId) return;

      if (update.summary) {
        setActiveGameSummary(update.summary);
      }
      // The real match keeps moving behind a private sandbox; exiting catches the board up.
      if (sandboxGameId) return;

      setGameState((prev) => {
        if (
          prev &&
          (prev.season !== update.state.season ||
            prev.year !== update.state.year ||
            prev.phase !== update.state.phase)
        ) {
          triggerToast(
            `Phase advanced: ${update.state.season} ${update.state.year} (${update.state.phase})`
          );
        }
        return update.state;
      });

      if (update.state.last_resolution) {
        setSimulationResult(update.state.last_resolution);
      }
    },
    [activeGameId, sandboxGameId]
  );

  const handleWsLobbyUpdate = useCallback(
    (update: WebSocketLobbyUpdate) => {
      setGamesList(update.games);
      const current = update.games.find((g) => g.game_id === activeGameId);
      if (current) {
        setActiveGameSummary(current);
      }
    },
    [activeGameId]
  );

  const { isConnected: wsConnected } = useDiplomacyWebSocket({
    activeGameId,
    viewMode,
    onGameUpdate: handleWsGameUpdate,
    onLobbyUpdate: handleWsLobbyUpdate,
  });

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

  // Auto-poll game state in multiplayer mode so turn advancements are received automatically
  useEffect(() => {
    if (viewMode !== 'multiplayer' || !activeGameId || sandboxGameId) return;
    let abandoned = false;
    const interval = setInterval(() => {
      fetch(`${API_BASE}/game?game_id=${encodeURIComponent(activeGameId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          // A reply still in flight must not repaint a board the player has since left.
          if (!abandoned && data?.state) {
            applyServerState(data.state);
            if (data.summary) setActiveGameSummary(data.summary);
          }
        })
        .catch(() => {});
    }, 3000);
    return () => {
      abandoned = true;
      clearInterval(interval);
    };
  }, [viewMode, activeGameId, sandboxGameId]);

  // Leaving the match board by any route closes its private sandbox.
  useEffect(() => {
    if (!sandboxGameId || viewMode === 'multiplayer') return;
    fetch(`${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(sandboxGameId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ power: playerPower }),
    }).catch(() => {});
    setSandboxGameId(null);
    setSandboxMode(false);
    setShowSimulationOverlay(false);
  }, [viewMode, sandboxGameId]);


  const handleEnterSoloSandbox = async () => {
    if (viewMode === 'multiplayer' && activeGameSummary) {
      const confirmLeave = window.confirm(
        `Switch from match "${activeGameSummary.name}" to the Solo Sandbox board? Your submitted orders remain safe on the server.`
      );
      if (!confirmLeave) return;
    }
    setActiveGameId('proto_1901');
    setActiveGameSummary(null);
    setLockedPower(null);
    setViewMode('sandbox');
    await fetchGame('proto_1901');
  };

  const handleCreateMultiplayerGame = async (
    name: string,
    power: Power,
    isPrivate?: boolean,
    passcode?: string
  ): Promise<MultiplayerGameSummary | void> => {
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
          `Created "${summary.name}" — You are commanding ${POWER_METADATA[power].shortName}!`
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
    passcode?: string
  ) => {
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
            passcode: passcode?.trim() || null,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || 'Unable to join power in this match.';
        triggerToast(msg);
        throw new Error(msg);
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
      throw e;
    }
  };

  const handleGenerateAIMoves = async (powers?: Power[], includeActive: boolean = false) => {
    const foreignPowers = (Object.keys(POWER_METADATA) as Power[]).filter((p) => p !== playerPower);
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/sandbox/ai-orders?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            powers: powers || (includeActive ? null : foreignPowers),
            include_active: includeActive,
          }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Failed to generate AI orders.');
        return;
      }
      const updatedState = await res.json();
      applyServerState(updatedState);
      triggerToast(
        includeActive
          ? 'Tactical AI planned orders for all 7 Great Powers!'
          : powers && powers.length === 1
          ? `Tactical AI planned orders for ${POWER_METADATA[powers[0]].shortName}!`
          : 'Tactical AI planned orders for foreign powers!'
      );
    } catch (e: any) {
      console.error(e);
      triggerToast('Error generating AI orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleAIStepTurn = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/sandbox/ai-step?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Failed to step turn with AI.');
        return;
      }
      const updatedState = await res.json();
      applyServerState(updatedState);
      setSelectedUnitId(null);
      setShowSimulationOverlay(false);
      triggerToast(
        `AI advanced game clock to ${updatedState.season} ${updatedState.year} ${updatedState.phase}!`
      );
    } catch (e: any) {
      console.error(e);
      triggerToast('Error stepping turn with AI.');
    } finally {
      setLoading(false);
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
              POWER_METADATA[playerPower].shortName
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

  const handleOpenSurrenderModal = (game: MultiplayerGameSummary, power: Power) => {
    if (!requireRealBoard('surrender')) return;
    setSurrenderModalGame(game);
    setSurrenderModalPower(power);
    setSurrenderModalOpen(true);
  };

  const handleSurrenderPower = async (gameId: string, power: Power, leave: boolean) => {
    if (!authUser) {
      openAuthPrompt('Please sign in to manage your sovereign position.', 'signin');
      return;
    }
    try {
      const res = await fetch(
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
        }
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
          `Surrendered command of ${POWER_METADATA[power].shortName} and left match.`
        );
      } else {
        applyServerState(data.state);
        if (data.summary) setActiveGameSummary(data.summary);
        triggerToast(
          `Command of ${POWER_METADATA[power].shortName} surrendered. Units stand in Civil Disorder.`
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
      const res = await fetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}/leave`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power,
            user_id: authUser.id,
            email: authUser.email,
          }),
        }
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
          `Country locked: You are playing as ${POWER_METADATA[lockedPower].shortName} in this multiplayer campaign.`
        );
      }
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
      !adminOverrideActive &&
      order.power !== lockedPower
    ) {
      triggerToast(
        `Enable "Sandbox Pre-Moves" to plot hypothetical orders for foreign powers.`
      );
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/order?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'That order was not accepted.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmAllHolds = async () => {
    if (!gameState) return;
    try {
      const res = await fetch(
        `${API_BASE}/orders/confirm-all?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast(
          `Confirmed all current orders for ${POWER_METADATA[playerPower].shortName}.`
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
        `${API_BASE}/sandbox/clear-foreign?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
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
            body: JSON.stringify({ power: playerPower }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          triggerToast(err.detail || 'Could not open the sandbox.');
          return;
        }
        const st: GameState = await res.json();
        applyServerState(st);
        setSandboxGameId(st.game_id === activeGameId ? null : st.game_id);
        setSandboxMode(true);
        setShowSimulationOverlay(true);
        triggerToast(
          'Entered Hypothetical Mode: Plot hypothetical foreign moves to test outcomes. Exiting will discard foreign guesses!'
        );
      } else {
        const res = await fetch(
          `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(draftGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: playerPower }),
          }
        );
        let turnMovedOn = false;
        if (res.ok) {
          const st: GameState = await res.json();
          turnMovedOn =
            st.season !== gameState.season ||
            st.year !== gameState.year ||
            st.phase !== gameState.phase;
          applyServerState(st);
        } else if (sandboxGameId) {
          // The private copy is gone, for example after a server restart: show the real match.
          await fetchGame(activeGameId);
        }
        setSandboxGameId(null);
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast(
          sandboxGameId && turnMovedOn
            ? 'The match moved on while in Hypothetical Mode, so hypothetical orders were not kept.'
            : `Exited Hypothetical Mode — foreign guesses discarded. Showing only ${
                POWER_METADATA[playerPower].shortName
              }'s real orders.`
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalizeClick = async (force = false) => {
    if (!gameState || !requireRealBoard('finalize your real orders')) return;
    try {
      const res = await fetch(
        `${API_BASE}/finalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower, force }),
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
            `${POWER_METADATA[playerPower].name} orders locked & finalized!`
          );
          fetchGamesList();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfinalizeClick = async () => {
    if (!gameState || !requireRealBoard('unlock your real orders')) return;
    try {
      const res = await fetch(
        `${API_BASE}/unfinalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
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
        `${API_BASE}/simulate?game_id=${encodeURIComponent(draftGameId)}`,
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
    if (!requireRealBoard('resolve the real turn')) return;
    try {
      const authHeaders = await getAuthHeaders();
      const headers: Record<string, string> = {
        ...authHeaders,
        ...(authUser?.id ? { 'X-User-Id': authUser.id } : {}),
        ...(authUser?.email ? { 'X-User-Email': authUser.email } : {}),
      };
      const res = await fetch(
        `${API_BASE}/adjudicate?game_id=${encodeURIComponent(activeGameId)}`,
        { method: 'POST', headers }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          st.winner
            ? `${POWER_METADATA[st.winner].name} has won the game!`
            : `Turn resolved! Now in ${st.season} ${st.year} (${st.phase} Phase).`
        );
        fetchGamesList();
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not resolve the turn.');
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
            active_power: playerPower,
          }),
        }
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSandboxGameId(null);
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

  const isGameCreator = checkIsGameCreator(activeGameSummary, authUser, viewMode);

  const openAdminTools = () => {
    if (requireRealBoard('use the admin tools')) setAdminModalOpen(true);
  };

  const activePowerIssues = gameState.issues.filter(
    (i) => i.power === playerPower
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
              title="Open standalone 7-power practice laboratory"
            >
              <FlaskConical size={14} />
              <span>Solo Sandbox</span>
            </button>
            {viewMode === 'multiplayer' && activeGameSummary && (
              <span className="nav-active-match-pill">
                <Crown size={13} />
                <span>
                  {activeGameSummary.name} (
                  {POWER_METADATA[playerPower].shortName})
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

            {gameState.winner && (
              <span className="game-over-pill">
                <Crown size={14} />
                <span>{POWER_METADATA[gameState.winner].shortName.toUpperCase()} WINS</span>
              </span>
            )}

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
          <div
            className={`header-ws-badge ${wsConnected ? 'ws-connected' : 'ws-disconnected'}`}
            title={
              wsConnected
                ? `Real-time synchronization connected (${viewMode === 'lobby' ? 'Lobby Feed' : activeGameId})`
                : 'Connecting to real-time synchronization...'
            }
          >
            <span className={`ws-status-dot ${wsConnected ? 'dot-online' : 'dot-offline'}`} />
            <span>{wsConnected ? 'Live Sync' : 'Connecting...'}</span>
          </div>

          {/* Sidebars toggle helper pills when viewing map */}
          {viewMode !== 'lobby' && (
            <div className="header-sidebar-toggles">
              <button
                type="button"
                className={`header-sidebar-pill-btn ${!leftSidebarCollapsed ? 'active' : ''}`}
                onClick={() => setLeftSidebarCollapsed((prev) => !prev)}
                title="Toggle Left Tools Sidebar (Legend, Zoom, Sandbox, Admin)"
              >
                <span>Tools Sidebar</span>
              </button>
              <button
                type="button"
                className={`header-sidebar-pill-btn ${!rightSidebarCollapsed ? 'active' : ''}`}
                onClick={() => setRightSidebarCollapsed((prev) => !prev)}
                title="Toggle Right Tactical Sidebar (Orders & Unit Command)"
              >
                <span>Tactical Sidebar</span>
              </button>
            </div>
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

      {/* ADMIN DIRECT-EDIT OVERRIDE BANNER */}
      {isGameCreator && adminOverrideActive && (
        <div className="admin-override-banner">
          <span>
            <ShieldAlert size={16} />
            <strong>ADMIN DIRECT-EDIT ACTIVE:</strong> You have Game Creator authority to edit any power's moves or state directly on the board.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={openAdminTools}>Admin Console</button>
            <button type="button" onClick={() => setAdminOverrideActive(false)}>Disable Direct-Edit</button>
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
            onSaveSandboxClick={handleSaveSandboxToAccount}
            isGameCreator={isGameCreator}
            onOpenAdminTools={openAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={() => setAdminOverrideActive((prev) => !prev)}
          />

          {/* CENTER: Europe Map */}
          <EuropeMap
            ref={mapRef}
            onZoomChange={setZoomPercent}
            provinces={provinces}
            units={gameState.units}
            orders={gameState.orders}
            ownership={gameState.ownership}
            activePower={playerPower}
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

          {/* RIGHT SIDEBAR: Core Gameplay Orders & Unit Command */}
          <MacroSidebar
            collapsed={rightSidebarCollapsed}
            onToggleCollapse={() => setRightSidebarCollapsed((prev) => !prev)}
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
            isMultiplayer={viewMode === 'multiplayer'}
            isGameCreator={isGameCreator}
            gameOver={Boolean(gameState.winner)}
            participants={activeGameSummary?.participants}
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
    </div>
  );
}

export default App;
