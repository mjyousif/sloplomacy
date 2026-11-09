import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import './compact.css';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Compass,
  Crown,
  FlaskConical,
  LogIn,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { AdminToolsModal } from './components/AdminToolsModal';
import { AuthModal } from './components/AuthModal';
import { CompactTopBar } from './components/CompactTopBar';
import { useConfirm } from './components/ConfirmModal';
import { DisplaySettingsMenu } from './components/DisplaySettingsMenu';
import { EuropeMap, type EuropeMapHandle } from './components/EuropeMap';
import { LobbyView } from './components/LobbyView';
import { MacroSidebar } from './components/MacroSidebar';
import { PhaseTimerWidget } from './components/PhaseTimerWidget';
import { SanityCheckModal } from './components/SanityCheckModal';
import { SurrenderModal } from './components/SurrenderModal';
import { ToolsSidebar } from './components/ToolsSidebar';
import {
  TurnHistoryPill,
  TurnHistorySelector,
} from './components/TurnHistorySelector';
import { useCompactLayout } from './hooks/useCompactLayout';
import { useDiplomacyWebSocket } from './hooks/useDiplomacyWebSocket';
import { useDisplayPrefs } from './hooks/useDisplayPrefs';
import { useTurnHistory } from './hooks/useTurnHistory';
import {
  authedFetch,
  getAuthHeaders,
  getInitialAuthUser,
  signOutUser,
  subscribeToAuthChanges,
} from './lib/supabase';
import {
  type AuthUser,
  type FinalizeResponse,
  type GameState,
  type MultiplayerGameSummary,
  type Order,
  type PhaseTimer,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type SimulationResult,
  type ValidationIssue,
  type WebSocketGameUpdate,
  type WebSocketLobbyUpdate,
} from './types/diplomacy';
import { checkIsGameCreator, resolvePlayerPower } from './utils/adminHelpers';
import type { SheetSnap } from './utils/sheetHelpers';
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
  const [activeGameId, setActiveGameId] = useState<string>('proto_1901');
  const [activeGameSummary, setActiveGameSummary] =
    useState<MultiplayerGameSummary | null>(null);
  const [lockedPower, setLockedPower] = useState<Power | null>(null);

  // Auth State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const {
    prefs: displayPrefs,
    saveState: displayPrefsSaveState,
    updatePrefs: updateDisplayPrefs,
  } = useDisplayPrefs(authUser);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authModalReason, setAuthModalReason] = useState<string | null>(null);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>(
    'signin',
  );

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
  const [highlightedProvinces, setHighlightedProvinces] = useState<string[]>(
    [],
  );
  const [sandboxMode, setSandboxMode] = useState<boolean>(false);
  // A multiplayer sandbox runs on a private server-side copy of the match under its own game id.
  const [sandboxGameId, setSandboxGameId] = useState<string | null>(null);
  // The private copy has no clock, so this follows the real match while the player is in it.
  const [hypotheticalMatchTimer, setHypotheticalMatchTimer] =
    useState<PhaseTimer | null>(null);
  const [simulationResult, setSimulationResult] =
    useState<SimulationResult | null>(null);
  const [showSimulationOverlay, setShowSimulationOverlay] =
    useState<boolean>(false);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [adminOverrideActive, setAdminOverrideActive] =
    useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(105);
  // Phone-sized screens get the compact layout, styled from compact.css.
  const isCompact = useCompactLayout();
  // The desktop sidebars' rails. Phones have no rails: orders live in a sheet and tools in a drawer.
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] =
    useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] =
    useState<boolean>(false);
  // The phone order sheet starts lowered, so the map gets as much room as it can.
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState<boolean>(false);
  const toolsToggleRef = useRef<HTMLButtonElement | null>(null);
  // While the map's docked unit bar is up, the sheet drops to its peek so the bar and the
  // provinces to tap stay in view.
  const handleDockedBarChange = useCallback((visible: boolean) => {
    if (visible) setSheetSnap('peek');
  }, []);
  const closeToolsDrawer = useCallback(() => {
    setToolsDrawerOpen(false);
    toolsToggleRef.current?.focus();
  }, []);

  // Every visit to a game starts with the sheet lowered and the drawer shut, and leaving the
  // phone layout (rotating a tablet, widening a window) shuts the drawer too.
  useEffect(() => {
    setSheetSnap('peek');
    setToolsDrawerOpen(false);
  }, [viewMode, activeGameId, isCompact]);
  const mapRef = useRef<EuropeMapHandle | null>(null);

  // Sanity Check Modal State
  const [sanityModalOpen, setSanityModalOpen] = useState<boolean>(false);
  const [sanityModalIssues, setSanityModalIssues] = useState<ValidationIssue[]>(
    [],
  );
  const [toastBanner, setToastBanner] = useState<string | null>(null);
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

  const playerPower = resolvePlayerPower(
    viewMode,
    lockedPower,
    gameState?.active_power,
  );
  const isGameCreator = checkIsGameCreator(
    activeGameSummary,
    authUser,
    viewMode,
  );
  // Direct-Edit stays on when the host moves to another game, where it must not apply.
  const directEditActive = isGameCreator && adminOverrideActive;
  // Drafts, AI plans and previews go to the private copy while there is one.
  const draftGameId = sandboxGameId ?? activeGameId;
  const matchTimer = sandboxGameId
    ? hypotheticalMatchTimer
    : (gameState?.timer ?? null);

  const triggerToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => {
      setToastBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // The board in a private sandbox is hypothetical, so nothing real can be done from it.
  const requireRealBoard = (action: string): boolean => {
    if (!sandboxGameId) return true;
    triggerToast(`Exit Hypothetical Mode to ${action}.`);
    return false;
  };

  const openAuthPrompt = (
    reason?: string,
    tab: 'signin' | 'signup' = 'signin',
  ) => {
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
      if (sandboxGameId) {
        setHypotheticalMatchTimer(update.state.timer ?? null);
        return;
      }

      setGameState((prev) => {
        if (
          prev &&
          (prev.season !== update.state.season ||
            prev.year !== update.state.year ||
            prev.phase !== update.state.phase)
        ) {
          triggerToast(
            `Phase advanced: ${update.state.season} ${update.state.year} (${update.state.phase})`,
          );
        }
        return update.state;
      });

      if (update.state.last_resolution) {
        setSimulationResult(update.state.last_resolution);
      }
    },
    [activeGameId, sandboxGameId, triggerToast],
  );

  const handleWsLobbyUpdate = useCallback(
    (update: WebSocketLobbyUpdate) => {
      setGamesList(update.games);
      const current = update.games.find((g) => g.game_id === activeGameId);
      if (current) {
        setActiveGameSummary(current);
      }
    },
    [activeGameId],
  );

  const { isConnected: wsConnected, sendRefresh: sendWsRefresh } =
    useDiplomacyWebSocket({
      activeGameId,
      viewMode,
      power: playerPower,
      passcode: activeGameId ? (matchPasscodes[activeGameId] ?? null) : null,
      authKey: authUser?.id ?? null,
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

  // Bumped by every fetchGame and every join, so an older reply still in flight
  // (such as the startup load of proto_1901) cannot replace a board opened since.
  const boardRequestSeq = useRef(0);

  const fetchGame = async (
    gid: string = activeGameId,
    targetPower?: Power | null,
  ) => {
    const seq = ++boardRequestSeq.current;
    try {
      setLoading(true);
      const effectivePower =
        targetPower !== undefined ? targetPower : playerPower;
      const params = new URLSearchParams({ game_id: gid });
      if (effectivePower) {
        params.set('power', effectivePower);
      }
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`${API_BASE}/game?${params.toString()}`, {
        headers: { ...authHeaders },
      });
      if (!res.ok) throw new Error(`Backend returned ${res.status}`);
      const data = await res.json();
      if (seq !== boardRequestSeq.current) return;
      applyServerState(data.state);
      setProvinces(data.provinces);
      if (data.summary) {
        setActiveGameSummary(data.summary);
      }
      setErrorMsg(null);
    } catch (err: any) {
      if (seq === boardRequestSeq.current) {
        setErrorMsg(
          err.message || 'Failed to connect to Diplomacy backend server.',
        );
      }
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

  // Only a `refresh` makes the server run the clock; a `ping` is just a heartbeat.
  // Without a socket the fallback poll below runs the clock every few seconds, and
  // it also knows to leave the board alone while a private sandbox is open.
  const handleTimerExpired = useCallback(() => {
    sendWsRefresh();
  }, [sendWsRefresh]);

  // Fallback poll game state in multiplayer mode ONLY when WebSocket is disconnected,
  // so turn advancements and timers continue to work if a network drops WS connections.
  useEffect(() => {
    if (viewMode !== 'multiplayer' || !activeGameId) return;
    if (wsConnected) return; // Real-time WebSocket is active; avoid redundant HTTP polling and state races

    let abandoned = false;

    const pollState = async () => {
      // Pause polling when browser tab is in background to allow Cloud Run to scale to zero
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const effectivePower = playerPower;
        const params = new URLSearchParams({ game_id: activeGameId });
        if (effectivePower) {
          params.set('power', effectivePower);
        }
        const authHeaders = await getAuthHeaders();
        const res = await fetch(`${API_BASE}/game?${params.toString()}`, {
          headers: { ...authHeaders },
        });
        if (!res.ok) return;
        const data = await res.json();
        // A reply still in flight must not repaint a board the player has since left.
        if (abandoned || !data?.state) return;
        if (sandboxGameId) {
          // The poll also runs the clock, so it continues behind a private sandbox.
          setHypotheticalMatchTimer(data.state.timer ?? null);
        } else {
          applyServerState(data.state);
        }
        if (data.summary) setActiveGameSummary(data.summary);
      } catch {
        // Fallback polling network errors are silently ignored
      }
    };

    const interval = setInterval(pollState, 4000);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && !abandoned) {
        pollState();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      abandoned = true;
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange,
        );
      }
    };
  }, [viewMode, activeGameId, sandboxGameId, wsConnected, playerPower]);

  // Leaving the match board by any route closes its private sandbox.
  useEffect(() => {
    if (!sandboxGameId || viewMode === 'multiplayer') return;
    authedFetch(
      `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(sandboxGameId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ power: playerPower }),
      },
    ).catch(() => {});
    setSandboxGameId(null);
    setSandboxMode(false);
    setShowSimulationOverlay(false);
  }, [viewMode, sandboxGameId]);

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

  const handleGenerateAIMoves = async (
    powers?: Power[],
    includeActive: boolean = false,
  ) => {
    const foreignPowers = (Object.keys(POWER_METADATA) as Power[]).filter(
      (p) => p !== playerPower,
    );
    try {
      setLoading(true);
      const res = await authedFetch(
        `${API_BASE}/sandbox/ai-orders?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            powers: powers || (includeActive ? null : foreignPowers),
            include_active: includeActive,
          }),
        },
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
            : 'Tactical AI planned orders for foreign powers!',
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
      const res = await authedFetch(
        `${API_BASE}/sandbox/ai-step?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
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
        `AI advanced game clock to ${updatedState.season} ${updatedState.year} ${updatedState.phase}!`,
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
        'signup',
      );
      return;
    }
    try {
      const res = await authedFetch(
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
        },
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

  const handleUpdateOrder = async (order: Order) => {
    // In multiplayer mode without Sandbox Pre-Move active, only allow ordering own power's units
    if (
      viewMode === 'multiplayer' &&
      lockedPower &&
      !sandboxMode &&
      !directEditActive &&
      order.power !== lockedPower
    ) {
      triggerToast(
        `Enable "Sandbox Pre-Moves" to plot hypothetical orders for foreign powers.`,
      );
      return;
    }
    try {
      const res = await authedFetch(
        `${API_BASE}/order?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order,
            turn: gameState ? turnLabel(gameState) : undefined,
          }),
        },
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
      const res = await authedFetch(
        `${API_BASE}/orders/confirm-all?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast(
          `Confirmed all current orders for ${POWER_METADATA[playerPower].shortName}.`,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearForeignPreMoves = async () => {
    if (!gameState) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/sandbox/clear-foreign?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        },
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
    if (entering) turnHistory.goLive();
    try {
      if (entering) {
        const res = await authedFetch(
          `${API_BASE}/sandbox/enter?game_id=${encodeURIComponent(activeGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: playerPower }),
          },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          triggerToast(err.detail || 'Could not open the sandbox.');
          return;
        }
        const st: GameState = await res.json();
        setHypotheticalMatchTimer(gameState.timer ?? null);
        applyServerState(st);
        setSandboxGameId(st.game_id === activeGameId ? null : st.game_id);
        setSandboxMode(true);
        setShowSimulationOverlay(true);
        triggerToast(
          'Entered Hypothetical Mode: Plot hypothetical foreign moves to test outcomes. Exiting will discard foreign guesses!',
        );
      } else {
        const res = await authedFetch(
          `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(draftGameId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ power: playerPower }),
          },
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
              }'s real orders.`,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalizeClick = async (force = false) => {
    if (!gameState || !requireRealBoard('finalize your real orders')) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/finalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power: playerPower,
            force,
            turn: turnLabel(gameState),
          }),
        },
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
            `${POWER_METADATA[playerPower].name} orders locked & finalized!`,
          );
          fetchGamesList();
        }
      } else {
        // The clock can resolve the phase while the request is on its way.
        const err = await res.json().catch(() => ({}));
        setSanityModalOpen(false);
        triggerToast(err.detail || 'Could not finalize your orders.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfinalizeClick = async () => {
    if (!gameState || !requireRealBoard('unlock your real orders')) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/unfinalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        },
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

  const _handleSimulatePreMoves = async () => {
    try {
      const res = await authedFetch(
        `${API_BASE}/simulate?game_id=${encodeURIComponent(draftGameId)}`,
        { method: 'POST' },
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

  const postTimerAction = async (
    action: 'start' | 'vote' | 'extend' | 'ready',
    body: Record<string, unknown> = {},
  ) => {
    try {
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(activeGameId)}/timer/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'The clock did not accept that.');
        return;
      }
      const st: GameState = await res.json();
      if (sandboxGameId) {
        setHypotheticalMatchTimer(st.timer ?? null);
      } else {
        applyServerState(st);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // A double-click must not resolve two phases: the second click waits for the first, and the
  // server refuses a turn that has already resolved.
  const adjudicatingRef = useRef(false);
  const handleAdjudicateTurn = async () => {
    if (!gameState || adjudicatingRef.current) return;
    if (!requireRealBoard('resolve the real turn')) return;
    adjudicatingRef.current = true;
    try {
      const turn = encodeURIComponent(turnLabel(gameState));
      const res = await authedFetch(
        `${API_BASE}/adjudicate?game_id=${encodeURIComponent(activeGameId)}&turn=${turn}`,
        { method: 'POST' },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          st.winner
            ? `${POWER_METADATA[st.winner].name} has won the game!`
            : `Turn resolved! Now in ${st.season} ${st.year} (${st.phase} Phase).`,
        );
        fetchGamesList();
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not resolve the turn.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      adjudicatingRef.current = false;
    }
  };

  const handleLoadScenario = async (scenarioId: string) => {
    try {
      const res = await authedFetch(
        `${API_BASE}/scenario?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenario_id: scenarioId,
            active_power: playerPower,
          }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSandboxGameId(null);
        setSandboxMode(false);
        setShowSimulationOverlay(false);
        setSelectedUnitId(null);
        triggerToast('Reset to Standard Spring 1901.');
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not reset the scenario.');
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
        <header className="imperial-top-header">
          <div className="brand-and-nav">
            <div
              className="brand-block clickable"
              onClick={handleBackToLobby}
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
                data-testid="nav-tab-sandbox"
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
              <div
                className="turn-chronicle-pill"
                data-testid="turn-chronicle-pill"
              >
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
                  <span>
                    {POWER_METADATA[gameState.winner].shortName.toUpperCase()}{' '}
                    WINS
                  </span>
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
              <span
                className={`ws-status-dot ${wsConnected ? 'dot-online' : 'dot-offline'}`}
              />
              <span>{wsConnected ? 'Live Sync' : 'Connecting...'}</span>
            </div>

            <DisplaySettingsMenu
              prefs={displayPrefs}
              saveState={displayPrefsSaveState}
              onChange={updateDisplayPrefs}
            />

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
                  onClick={handleSignOut}
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
