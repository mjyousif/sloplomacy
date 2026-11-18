import { CheckCircle2 } from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AuthModalTab } from '../hooks/useAuthSession';
import type { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  Power,
  TurnHistoryEntry,
} from '../types/diplomacy';
import type { DisplayPrefs } from '../utils/displayPrefs';
import { filterAndSortMyGames } from '../utils/heroGame';
import styles from './AppHeader.module.css';
import { CompactTopBar } from './header/CompactTopBar';
import { TopHeader, type TopHeaderProps } from './header/TopHeader';

export interface AppHeaderProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  isCompact: boolean;
  gameState: GameState;
  activeGameId: string;
  activeGameSummary: MultiplayerGameSummary | null;
  games?: MultiplayerGameSummary[];
  playerPower: Power;
  lockedPower?: Power | null;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  updateDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  authUser: AuthUser | null;
  openAuthPrompt: (reason?: string, tab?: AuthModalTab) => void;
  openAccountModal?: (onboarding?: boolean) => void;
  handleSignOut: () => void;
  handleBackToLobby: () => void;
  handleEnterSoloSandbox: (event?: React.MouseEvent) => void;
  onSaveSandbox?: () => void;
  onResetSandbox?: (event?: React.MouseEvent) => void;
  onDeleteSandbox?: (event?: React.MouseEvent) => void;
  onSwitchToSoloSandbox?: () => void;
  onReturnToPreviousGame?: () => void;
  onSelectGame?: (game: MultiplayerGameSummary) => void;
  onOpenSurrenderModal?: (game: MultiplayerGameSummary, power: Power) => void;
  /** The phone's tools drawer, opened from ≡. */
  toolsDrawerOpen: boolean;
  setToolsDrawerOpen: Dispatch<SetStateAction<boolean>>;
  toolsToggleRef: RefObject<HTMLButtonElement | null>;
  /** The host's Direct-Edit, on and in this game, which shows a banner. */
  isGameCreator?: boolean;
  directEditActive: boolean;
  openAdminTools: () => void;
  onToggleDirectEdit: () => void;
  turnClockOpen?: boolean;
  onResolveTurn?: (event?: React.MouseEvent) => void;
  onExitAdmin?: () => void;
  toastBanner: string | null;
  historyEntries?: TurnHistoryEntry[];
  historyViewIndex?: number | null;
  historyLocked?: boolean;
  onSelectHistoryTurn?: (index: number | null) => void;
  onStepHistoryTurn?: (delta: -1 | 1) => void;
  onOpenGameOverModal?: () => void;
}

/**
 * Everything above the board: the top bar (a unified bar sharing `TurnChronicle`,
 * `GameSettingsMenu`, and `AccountDropdownMenu` across desktop and phone), and the toast.
 */
export function AppHeader({
  viewMode,
  isCompact,
  gameState,
  activeGameId,
  activeGameSummary,
  games = [],
  playerPower,
  lockedPower = null,
  displayPrefs,
  displayPrefsSaveState,
  updateDisplayPrefs,
  authUser,
  openAuthPrompt,
  openAccountModal,
  handleSignOut,
  handleBackToLobby,
  handleEnterSoloSandbox,
  onSaveSandbox,
  onResetSandbox,
  onDeleteSandbox,
  onSwitchToSoloSandbox,
  onReturnToPreviousGame,
  onSelectGame,
  onOpenSurrenderModal,
  toolsDrawerOpen,
  setToolsDrawerOpen,
  toolsToggleRef,
  isGameCreator = false,
  directEditActive,
  openAdminTools,
  onToggleDirectEdit,
  turnClockOpen = false,
  onResolveTurn,
  onExitAdmin,
  toastBanner,
  historyEntries,
  historyViewIndex,
  historyLocked = false,
  onSelectHistoryTurn,
  onStepHistoryTurn,
  onOpenGameOverModal,
}: AppHeaderProps) {
  const myGames = filterAndSortMyGames(games, authUser);
  const isLockedPowerSurrendered = Boolean(
    lockedPower && gameState.surrendered_powers?.includes(lockedPower),
  );
  const handleSurrenderClick =
    viewMode === 'multiplayer' &&
    activeGameSummary &&
    lockedPower &&
    onOpenSurrenderModal &&
    !isLockedPowerSurrendered
      ? () => onOpenSurrenderModal(activeGameSummary, lockedPower)
      : undefined;

  const headerProps: TopHeaderProps = {
    viewMode,
    turn: gameState,
    winner: gameState.winner ?? null,
    onBackToLobby: handleBackToLobby,
    onEnterSoloSandbox: handleEnterSoloSandbox,
    onSaveSandbox,
    onResetSandbox,
    onDeleteSandbox,
    onReturnToPreviousGame,
    onSurrenderClick: handleSurrenderClick,
    isSurrendered: isLockedPowerSurrendered,
    matchSummary: activeGameSummary,
    activeGameId,
    myGames,
    onSwitchToSoloSandbox,
    onSelectGame,
    playerPower: lockedPower ?? playerPower,
    displayPrefs,
    displayPrefsSaveState,
    onChangeDisplayPrefs: updateDisplayPrefs,
    isGameCreator,
    onOpenAdminTools: openAdminTools,
    adminOverrideActive: directEditActive,
    onToggleAdminOverride: onToggleDirectEdit,
    turnClockOpen,
    onResolveTurn,
    onExitAdmin,
    authUser,
    onSignIn: () => openAuthPrompt(undefined, 'signin'),
    onSignOut: handleSignOut,
    onOpenAccount: openAccountModal ? () => openAccountModal(false) : undefined,
    historyEntries,
    historyViewIndex,
    historyLocked,
    onSelectHistoryTurn,
    onStepHistoryTurn,
    onOpenGameOverModal,
  };

  return (
    <>
      {isCompact ? (
        <CompactTopBar
          {...headerProps}
          toolsOpen={toolsDrawerOpen}
          onToggleTools={() => setToolsDrawerOpen((open) => !open)}
          toolsToggleRef={toolsToggleRef}
        />
      ) : (
        <TopHeader {...headerProps} />
      )}

      {/* TOAST NOTIFICATION */}
      {toastBanner && (
        <div className={styles.imperialToastBanner} data-testid="toast-banner">
          <CheckCircle2 size={16} />
          <span>{toastBanner}</span>
        </div>
      )}
    </>
  );
}
