import type React from 'react';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import { signOutUser } from '../lib/supabase';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
} from '../types/diplomacy';
import { myPowerIn } from '../utils/heroGame';
import type { useAdminDirectEdit } from './useAdminDirectEdit';
import type { useGameSession } from './useGameSession';
import type { useMatchActions } from './useMatchActions';
import type { useSandboxSession } from './useSandboxSession';
import type { useSeatActions } from './useSeatActions';
import type { TurnHistory } from './useTurnHistory';
import type { useWorkspaceLayout } from './useWorkspaceLayout';

export function getInitialViewMode(): 'lobby' | 'sandbox' | 'multiplayer' {
  return typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('view') === 'sandbox' ||
      window.location.hash === '#sandbox')
    ? 'sandbox'
    : 'lobby';
}

export function createAdminStateUpdater(
  applyServerState: (st: GameState) => void,
  fetchGamesList: () => Promise<void> | void,
) {
  return (st: GameState | null) => {
    if (!st) return;
    applyServerState(st);
    fetchGamesList();
  };
}

export interface UseAppNavigationOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  setViewMode: React.Dispatch<
    React.SetStateAction<'lobby' | 'sandbox' | 'multiplayer'>
  >;
  isCompact: boolean;
  isGameCreator: boolean;
  directEditActive: boolean;
  adminModalOpen: boolean;
  setAdminModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAdminOverrideActive: React.Dispatch<React.SetStateAction<boolean>>;
  authUser: AuthUser | null;
  session: Pick<
    ReturnType<typeof useGameSession>,
    'activeGameId' | 'gameState' | 'applyServerState' | 'fetchGamesList'
  >;
  layout: Pick<
    ReturnType<typeof useWorkspaceLayout>,
    'setRightSidebarCollapsed' | 'setSheetSnap'
  >;
  turnHistory: TurnHistory;
  directEdit: ReturnType<typeof useAdminDirectEdit>;
  sandbox: Pick<
    ReturnType<typeof useSandboxSession>,
    'requireRealBoard' | 'handleLoadScenario'
  >;
  match: Pick<ReturnType<typeof useMatchActions>, 'handleAdjudicateTurn'>;
  seats: Pick<
    ReturnType<typeof useSeatActions>,
    | 'previousGame'
    | 'rememberCurrentGame'
    | 'clearPreviousGame'
    | 'handleEnterSoloSandbox'
    | 'handleDeleteSandbox'
    | 'handleSwitchToSoloSandbox'
    | 'handleJoinOrEnterMultiplayerGame'
    | 'handleReturnToPreviousGame'
  >;
  setSelectedUnitId: React.Dispatch<React.SetStateAction<string | null>>;
  setHighlightedProvinces: React.Dispatch<React.SetStateAction<string[]>>;
  confirm: (
    options: ConfirmOptions,
    event?: { shiftKey?: boolean } | null,
  ) => Promise<boolean>;
  triggerToast: (msg: string) => void;
}

/**
 * Navigation, past-turn stepping, confirm-guarded sandbox/game transitions, and admin panel
 * wiring for `App`. Holds no React state or effects so `App`'s hook order stays unchanged.
 */
export function useAppNavigation({
  viewMode,
  setViewMode,
  isCompact,
  isGameCreator,
  directEditActive,
  adminModalOpen,
  setAdminModalOpen,
  setAdminOverrideActive,
  authUser,
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
}: UseAppNavigationOptions) {
  const { activeGameId, gameState, applyServerState, fetchGamesList } = session;
  const handleAdminUpdateState = createAdminStateUpdater(
    applyServerState,
    fetchGamesList,
  );

  const openAdminTools = async () => {
    if (!sandbox.requireRealBoard('use the admin tools')) return;
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
    seats.rememberCurrentGame();
    setViewMode('lobby');
    fetchGamesList();
  };

  const guardedEnterSoloSandbox = async (event?: React.MouseEvent) => {
    if (!(await directEdit.confirmIfDirty('open the Solo Sandbox'))) return;
    setAdminModalOpen(false);
    setAdminOverrideActive(false);
    seats.handleEnterSoloSandbox(event);
  };

  const guardedResetSandbox = async (event?: React.MouseEvent) => {
    if (!(await directEdit.confirmIfDirty('reset the sandbox'))) return;
    const ok = await confirm(
      {
        title: 'Reset Sandbox?',
        message:
          'Reset this sandbox to Standard Spring 1901? All current orders and board changes will be lost.',
        confirmLabel: 'Reset Sandbox',
      },
      event,
    );
    if (!ok) return;
    turnHistory.goLive();
    setAdminModalOpen(false);
    setAdminOverrideActive(false);
    await sandbox.handleLoadScenario('standard_1901');
  };

  const guardedDeleteSandbox = async (event?: React.MouseEvent) => {
    if (!(await directEdit.confirmIfDirty('delete this sandbox'))) return;
    setAdminModalOpen(false);
    setAdminOverrideActive(false);
    await seats.handleDeleteSandbox(event);
  };

  const guardedSwitchToSoloSandbox = async () => {
    if (!(await directEdit.confirmIfDirty('switch to Solo Sandbox'))) return;
    setAdminModalOpen(false);
    setAdminOverrideActive(false);
    await seats.handleSwitchToSoloSandbox();
  };

  const guardedSwitchToGame = async (game: MultiplayerGameSummary) => {
    if (!(await directEdit.confirmIfDirty('switch games'))) return;
    setAdminModalOpen(false);
    setAdminOverrideActive(false);
    const power = myPowerIn(game, authUser) ?? 'FRANCE';
    await seats.handleJoinOrEnterMultiplayerGame(game.game_id, power);
  };

  const guardedReturnToPreviousGame = seats.previousGame
    ? async () => {
        if (!(await directEdit.confirmIfDirty('return to the previous game')))
          return;
        setAdminModalOpen(false);
        setAdminOverrideActive(false);
        await seats.handleReturnToPreviousGame();
      }
    : undefined;

  const handleSignOut = async () => {
    seats.clearPreviousGame();
    await signOutUser();
    if (viewMode === 'multiplayer') setViewMode('lobby');
    triggerToast('Signed out — now in Guest Mode.');
  };

  const boardState = directEdit.effectiveGameState ?? gameState;

  const handleAdminResolveTurn = async (event?: React.MouseEvent) => {
    if (!boardState || boardState.winner) return;
    if (!sandbox.requireRealBoard('resolve the real turn')) return;
    const isMp = viewMode === 'multiplayer';
    const ok = await confirm(
      {
        title: 'Force-Resolve Turn?',
        message: isMp
          ? `Force-resolve ${boardState.season} ${boardState.year} ${boardState.phase} and advance to the next phase? Other players will be notified of this admin action.`
          : `Resolve ${boardState.season} ${boardState.year} ${boardState.phase} and advance to the next phase?`,
        confirmLabel: 'Resolve Turn',
      },
      event,
    );
    if (!ok) return;
    await match.handleAdjudicateTurn();
  };

  const turnClockSettings =
    isGameCreator && adminModalOpen && gameState
      ? {
          isOpen: true,
          onClose: () => setAdminModalOpen(false),
          gameId: activeGameId,
          gameState,
          user: authUser,
          onStateUpdated: handleAdminUpdateState,
          onToast: triggerToast,
        }
      : undefined;

  return {
    openAdminTools,
    handleToggleEditBoard,
    adminModeActive,
    handleExitAdmin,
    historyTurn,
    viewedEntry,
    showPastTurn,
    stepPastTurn,
    handleBackToLobby,
    guardedEnterSoloSandbox,
    guardedResetSandbox,
    guardedDeleteSandbox,
    guardedSwitchToSoloSandbox,
    guardedSwitchToGame,
    guardedReturnToPreviousGame,
    handleSignOut,
    handleAdminResolveTurn,
    turnClockSettings,
  };
}
