import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type {
  GameState,
  MultiplayerGameSummary,
  PhaseTimer,
  Power,
  SimulationResult,
  WebSocketGameUpdate,
  WebSocketLobbyUpdate,
} from '../types/diplomacy';
import { readStoredSoloSandboxId } from '../utils/soloSandboxStorage';
import { turnLabel } from '../utils/timerHelpers';
import { useDiplomacyWebSocket } from './useDiplomacyWebSocket';
import { gameReadHeaders } from './useGameSession';

const API_BASE = '/api';

export const FALLBACK_POLL_MS = 4000;
export const IDLE_POLL_MS = 60_000;

export interface GameSyncOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId: string;
  /** The seat to read the match from; null for a spectator, who names none. */
  playerPower: Power | null;
  /** The private sandbox copy's id while the player is in one. The real match keeps moving behind it. */
  sandboxGameId: string | null;
  /** Real match turn label captured when Hypothetical Mode opened, so turn advances clear the branch. */
  sandboxOriginTurn?: string | null;
  setSandboxOriginTurn?: Dispatch<SetStateAction<string | null>>;
  setSandboxGameId?: Dispatch<SetStateAction<string | null>>;
  setSandboxMode?: Dispatch<SetStateAction<boolean>>;
  setShowSimulationOverlay?: Dispatch<SetStateAction<boolean>>;
  setSelectedUnitId?: Dispatch<SetStateAction<string | null>>;
  /** Passcodes the player typed for private matches during this visit, by game id. */
  matchPasscodes: Record<string, string>;
  /** The signed-in user's id, so the socket reconnects on sign-in and sign-out. */
  authKey: string | null;
  triggerToast: (msg: string) => void;
  setActiveGameSummary: Dispatch<SetStateAction<MultiplayerGameSummary | null>>;
  setGameState: Dispatch<SetStateAction<GameState | null>>;
  setGamesList: Dispatch<SetStateAction<MultiplayerGameSummary[]>>;
  setSimulationResult: Dispatch<SetStateAction<SimulationResult | null>>;
  setHypotheticalMatchTimer: Dispatch<SetStateAction<PhaseTimer | null>>;
  applyServerState: (st: GameState) => void;
  /** From `useGameSession`. */
  fetchGame: (gid?: string, targetPower?: Power | null) => Promise<void>;
  fetchGamesList: () => Promise<void>;
  /** Re-reads the signed-in player's own games, which the public lobby socket leaves out. */
  fetchMyGames: () => Promise<void>;
}

/**
 * Keeps the open game and the lobby up to date: the live socket and what its messages
 * change, the first load on mount, and a poll that stands in for the socket in a
 * multiplayer match while it is down.
 */
export function useGameSync({
  viewMode,
  activeGameId,
  playerPower,
  sandboxGameId,
  sandboxOriginTurn = null,
  setSandboxOriginTurn,
  setSandboxGameId,
  setSandboxMode,
  setShowSimulationOverlay,
  setSelectedUnitId,
  matchPasscodes,
  authKey,
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
}: GameSyncOptions) {
  const syncBehindPrivateSandbox = useCallback(
    (liveState: GameState) => {
      if (sandboxOriginTurn && turnLabel(liveState) !== sandboxOriginTurn) {
        setSandboxGameId?.(null);
        setSandboxMode?.(false);
        setShowSimulationOverlay?.(false);
        setSandboxOriginTurn?.(null);
        setHypotheticalMatchTimer(null);
        setSelectedUnitId?.(null);
        applyServerState(liveState);
        triggerToast(
          `Turn ended (${turnLabel(liveState)}) — hypothetical branch cleared.`,
        );
        return;
      }
      setHypotheticalMatchTimer(liveState.timer ?? null);
    },
    [
      sandboxOriginTurn,
      setSandboxGameId,
      setSandboxMode,
      setShowSimulationOverlay,
      setSandboxOriginTurn,
      setHypotheticalMatchTimer,
      setSelectedUnitId,
      applyServerState,
      triggerToast,
    ],
  );
  const syncBehindPrivateSandboxRef = useRef(syncBehindPrivateSandbox);
  syncBehindPrivateSandboxRef.current = syncBehindPrivateSandbox;

  const handleWsGameUpdate = useCallback(
    (update: WebSocketGameUpdate) => {
      if (update.game_id !== activeGameId) return;

      if (update.summary) {
        setActiveGameSummary(update.summary);
      }
      // The real match keeps moving behind a private sandbox; same-turn updates only sync the clock,
      // while a turn end exits Hypothetical Mode and paints the new live turn.
      if (sandboxGameId) {
        syncBehindPrivateSandboxRef.current(update.state);
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

      if (update.state.preview) {
        setSimulationResult(update.state.preview);
      }
    },
    [activeGameId, sandboxGameId, triggerToast],
  );

  const handleWsLobbyUpdate = useCallback(
    (update: WebSocketLobbyUpdate) => {
      setGamesList(update.games);
      // The socket lists public matches only, so re-read the player's own (private) games.
      fetchMyGames();
      const current = update.games.find((g) => g.game_id === activeGameId);
      if (current) {
        setActiveGameSummary(current);
      }
    },
    [activeGameId, fetchMyGames],
  );

  const {
    isConnected: wsConnected,
    isIdleDisconnected,
    sendRefresh: sendWsRefresh,
  } = useDiplomacyWebSocket({
    activeGameId,
    viewMode,
    power: playerPower,
    passcode: activeGameId ? (matchPasscodes[activeGameId] ?? null) : null,
    authKey,
    onGameUpdate: handleWsGameUpdate,
    onLobbyUpdate: handleWsLobbyUpdate,
  });

  // The auth user is loaded and followed by useAuthSession.
  useEffect(() => {
    fetchGame(readStoredSoloSandboxId() ?? 'proto_1901');
    fetchGamesList();
  }, []);

  // Signing in or out changes whose games are "mine". The first load above covers mount.
  const seenAuthKey = useRef(authKey);
  useEffect(() => {
    if (seenAuthKey.current === authKey) return;
    seenAuthKey.current = authKey;
    fetchMyGames();
  }, [authKey]);

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
        const res = await fetch(`${API_BASE}/game?${params.toString()}`, {
          headers: await gameReadHeaders(matchPasscodes[activeGameId]),
        });
        if (!res.ok) return;
        const data = await res.json();
        // A reply still in flight must not repaint a board the player has since left.
        if (abandoned || !data?.state) return;
        if (sandboxGameId) {
          // The poll also runs the clock, and clears Hypothetical Mode if the real turn ended.
          syncBehindPrivateSandboxRef.current(data.state);
        } else {
          applyServerState(data.state);
        }
        if (data.summary) setActiveGameSummary(data.summary);
      } catch {
        // Fallback polling network errors are silently ignored
      }
    };

    const interval = setInterval(
      pollState,
      isIdleDisconnected ? IDLE_POLL_MS : FALLBACK_POLL_MS,
    );

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
  }, [
    viewMode,
    activeGameId,
    sandboxGameId,
    wsConnected,
    isIdleDisconnected,
    playerPower,
    matchPasscodes,
  ]);

  return { wsConnected, handleTimerExpired };
}
