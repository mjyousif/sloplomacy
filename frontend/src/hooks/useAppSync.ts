import type { Dispatch, SetStateAction } from 'react';
import type { AuthUser, Power, SimulationResult } from '../types/diplomacy';
import type { ViewMode } from '../utils/viewMode';
import { useGameOverModal } from './useGameOverModal';
import type { useGameSession } from './useGameSession';
import { useGameSync } from './useGameSync';
import { useSandboxExit } from './useSandboxExit';
import type { useSandboxSession } from './useSandboxSession';
import { useTurnNotifications } from './useTurnNotifications';

interface UseAppSyncOptions {
  viewMode: ViewMode;
  session: ReturnType<typeof useGameSession>;
  sandbox: ReturnType<typeof useSandboxSession>;
  authUser: AuthUser | null;
  soundEnabled: boolean;
  triggerToast: (msg: string) => void;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
  setSimulationResult: Dispatch<SetStateAction<SimulationResult | null>>;
}

/**
 * What keeps the open board current and tells the player about it: the live socket, first load
 * and fallback poll (`useGameSync`), the turn alerts, the game-over modal, and the effect that closes a match's
 * private sandbox whenever the board is left (`useSandboxExit`).
 */
export function useAppSync({
  viewMode,
  session,
  sandbox,
  authUser,
  soundEnabled,
  triggerToast,
  setSelectedUnitId,
  setSimulationResult,
}: UseAppSyncOptions) {
  const playerPower: Power | null = session.playerPower;
  const sync = useGameSync({
    viewMode,
    activeGameId: session.activeGameId,
    playerPower: session.isSpectator ? null : playerPower,
    sandboxGameId: sandbox.sandboxGameId,
    sandboxOriginTurn: sandbox.sandboxOriginTurn,
    setSandboxOriginTurn: sandbox.setSandboxOriginTurn,
    setSandboxGameId: sandbox.setSandboxGameId,
    setSandboxMode: sandbox.setSandboxMode,
    setShowSimulationOverlay: sandbox.setShowSimulationOverlay,
    setSelectedUnitId,
    matchPasscodes: session.matchPasscodes,
    authKey: authUser?.id ?? null,
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
    soundEnabled,
  });

  // Leaving the match board by any route closes its private sandbox.
  useSandboxExit({
    viewMode,
    sandboxGameId: sandbox.sandboxGameId,
    playerPower,
    setSandboxGameId: sandbox.setSandboxGameId,
    setSandboxMode: sandbox.setSandboxMode,
    setShowSimulationOverlay: sandbox.setShowSimulationOverlay,
  });

  // The Campaign Statistics & War Ledger modal that opens when the match is won.
  const gameOver = useGameOverModal({
    viewMode,
    activeGameId: session.activeGameId,
    gameState: session.gameState,
    activeGameSummary: session.activeGameSummary,
    authUser,
    onSummaryUpdated: (updatedSummary) => {
      session.setActiveGameSummary(updatedSummary);
      void session.fetchMyGames();
    },
  });

  return { ...sync, gameOver };
}
