import type { AdminTurnClockSettings } from '../components/macro/AdminTurnClockSidebar';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import type { AuthUser, GameState } from '../types/diplomacy';
import type { ViewMode } from '../utils/viewMode';
import type { useAdminMode } from './useAdminMode';
import type { useTurnHistory } from './useTurnHistory';
import type { useWorkspaceLayout } from './useWorkspaceLayout';

type AdminMode = ReturnType<typeof useAdminMode>;

interface UseAdminActionsOptions {
  viewMode: ViewMode;
  isCompact: boolean;
  activeGameId: string;
  authUser: AuthUser | null;
  gameState: GameState | null;
  admin: AdminMode;
  turnHistory: ReturnType<typeof useTurnHistory>;
  layout: ReturnType<typeof useWorkspaceLayout>;
  requireRealBoard: (action: string) => boolean;
  handleAdjudicateTurn: () => Promise<unknown>;
  setSelectedUnitId: (id: string | null) => void;
  setHighlightedProvinces: (ids: string[]) => void;
  triggerToast: (msg: string) => void;
  confirm: (opts: ConfirmOptions, event?: React.MouseEvent) => Promise<boolean>;
}

/**
 * What the top bar's admin and turn-selector controls do: open Turn and Clock Settings, toggle
 * Edit Board, leave either, force-resolve the turn, and step through past turns (both are
 * locked while an admin mode is on, and Edit Board asks first if edits are still staged).
 */
export function useAdminActions({
  viewMode,
  isCompact,
  activeGameId,
  authUser,
  gameState,
  admin,
  turnHistory,
  layout,
  requireRealBoard,
  handleAdjudicateTurn,
  setSelectedUnitId,
  setHighlightedProvinces,
  triggerToast,
  confirm,
}: UseAdminActionsOptions) {
  const {
    adminModalOpen,
    setAdminModalOpen,
    setAdminOverrideActive,
    isGameCreator,
    directEditActive,
    directEdit,
    handleAdminUpdateState,
  } = admin;
  const adminModeActive = directEditActive || (isGameCreator && adminModalOpen);
  const boardState = directEdit.effectiveGameState ?? gameState;

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
  // Leaves either admin mode; Edit Board asks first if edits are still staged.
  const handleExitAdmin = async () => {
    if (directEditActive) await directEdit.handleToggleDirectEdit();
    setAdminModalOpen(false);
  };

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
  const handleAdminResolveTurn = async (event?: React.MouseEvent) => {
    if (!boardState || boardState.winner) return;
    if (!requireRealBoard('resolve the real turn')) return;
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
    await handleAdjudicateTurn();
  };

  const turnClockSettings: AdminTurnClockSettings | undefined =
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
    adminModeActive,
    boardState,
    turnClockSettings,
    openAdminTools,
    handleToggleEditBoard,
    handleExitAdmin,
    showPastTurn,
    stepPastTurn,
    handleAdminResolveTurn,
  };
}
