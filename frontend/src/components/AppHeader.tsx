import { CheckCircle2 } from 'lucide-react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AuthModalTab } from '../hooks/useAuthSession';
import type { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import {
  type AuthUser,
  type GameState,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../types/diplomacy';
import type { DisplayPrefs } from '../utils/displayPrefs';
import styles from './AppHeader.module.css';
import { CompactTopBar } from './CompactTopBar';
import { TopHeader } from './TopHeader';

export interface AppHeaderProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  isCompact: boolean;
  gameState: GameState;
  activeGameId: string;
  activeGameSummary: MultiplayerGameSummary | null;
  playerPower: Power;
  wsConnected: boolean;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  updateDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  authUser: AuthUser | null;
  openAuthPrompt: (reason?: string, tab?: AuthModalTab) => void;
  openAccountModal?: (onboarding?: boolean) => void;
  handleSignOut: () => void;
  handleBackToLobby: () => void;
  handleEnterSoloSandbox: (event?: React.MouseEvent) => void;
  /** The order check behind the error and warning pills. */
  handleFinalizeClick: (force?: boolean) => void;
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
  onExitAdmin?: () => void;
  toastBanner: string | null;
  historyEntries?: TurnHistoryEntry[];
  historyViewIndex?: number | null;
  historyPower?: Power | null;
  historyLocked?: boolean;
  onSelectHistoryTurn?: (index: number | null) => void;
  onStepHistoryTurn?: (delta: -1 | 1) => void;
  onSelectHistoryPower?: (power: Power | null) => void;
  onOpenGameOverModal?: () => void;
}

/**
 * Everything above the board: the top bar (a one-row bar with a ⋯ menu on a phone), the
 * Direct-Edit banner while the host has it on, and the toast.
 */
export function AppHeader({
  viewMode,
  isCompact,
  gameState,
  activeGameId,
  activeGameSummary,
  playerPower,
  wsConnected,
  displayPrefs,
  displayPrefsSaveState,
  updateDisplayPrefs,
  authUser,
  openAuthPrompt,
  openAccountModal,
  handleSignOut,
  handleBackToLobby,
  handleEnterSoloSandbox,
  handleFinalizeClick,
  toolsDrawerOpen,
  setToolsDrawerOpen,
  toolsToggleRef,
  isGameCreator = false,
  directEditActive,
  openAdminTools,
  onToggleDirectEdit,
  turnClockOpen = false,
  onExitAdmin,
  toastBanner,
  historyEntries,
  historyViewIndex,
  historyPower,
  historyLocked = false,
  onSelectHistoryTurn,
  onStepHistoryTurn,
  onSelectHistoryPower,
  onOpenGameOverModal,
}: AppHeaderProps) {
  const activePowerIssues = gameState.issues.filter(
    (i) => i.power === playerPower,
  );
  const activeErrors = activePowerIssues.filter((i) => i.severity === 'error');
  const activeWarnings = activePowerIssues.filter(
    (i) => i.severity === 'warning',
  );

  return (
    <>
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
          isGameCreator={isGameCreator}
          onOpenAdminTools={openAdminTools}
          adminOverrideActive={directEditActive}
          onToggleAdminOverride={onToggleDirectEdit}
          turnClockOpen={turnClockOpen}
          onExitAdmin={onExitAdmin}
          authUser={authUser}
          onSignIn={() => openAuthPrompt(undefined, 'signin')}
          onSignOut={handleSignOut}
          onOpenAccount={
            openAccountModal ? () => openAccountModal(false) : undefined
          }
          toolsOpen={toolsDrawerOpen}
          onToggleTools={() => setToolsDrawerOpen((open) => !open)}
          toolsToggleRef={toolsToggleRef}
          onOpenGameOverModal={onOpenGameOverModal}
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
          displayPrefs={displayPrefs}
          displayPrefsSaveState={displayPrefsSaveState}
          onChangeDisplayPrefs={updateDisplayPrefs}
          isGameCreator={isGameCreator}
          onOpenAdminTools={openAdminTools}
          adminOverrideActive={directEditActive}
          onToggleAdminOverride={onToggleDirectEdit}
          turnClockOpen={turnClockOpen}
          onExitAdmin={onExitAdmin}
          authUser={authUser}
          onSignIn={() => openAuthPrompt(undefined, 'signin')}
          onSignOut={handleSignOut}
          onOpenAccount={
            openAccountModal ? () => openAccountModal(false) : undefined
          }
          historyEntries={historyEntries}
          historyViewIndex={historyViewIndex}
          historyPower={historyPower}
          historyLocked={historyLocked}
          onSelectHistoryTurn={onSelectHistoryTurn}
          onStepHistoryTurn={onStepHistoryTurn}
          onSelectHistoryPower={onSelectHistoryPower}
          onOpenGameOverModal={onOpenGameOverModal}
        />
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
