import { ArrowLeft, Crown, Menu } from 'lucide-react';
import type React from 'react';
import { POWER_METADATA } from '../../types/diplomacy';
import { BrandEmblem } from '../ui/BrandEmblem';
import { AccountDropdownMenu } from './AccountDropdownMenu';
import styles from './CompactTopBar.module.css';
import { GameSettingsMenu } from './GameSettingsMenu';
import type { TopHeaderProps } from './TopHeader';
import { TurnChronicle } from './TurnChronicle';

export interface CompactTopBarProps extends TopHeaderProps {
  /** In a game, ≡ opens the tools drawer. */
  toolsOpen?: boolean;
  onToggleTools?: () => void;
  /** So the drawer can hand focus back to ≡ when it closes. */
  toolsToggleRef?: React.Ref<HTMLButtonElement>;
}

/**
 * The phone top bar: shares `TurnChronicle`, `GameSettingsMenu`, and `AccountDropdownMenu`
 * with the desktop `TopHeader`, plus the lobby back button and `≡` tools-drawer toggle.
 */
export function CompactTopBar({
  viewMode,
  turn,
  winner,
  onBackToLobby,
  onEnterSoloSandbox,
  onSaveSandbox,
  onResetSandbox,
  onDeleteSandbox,
  onReturnToPreviousGame,
  onSurrenderClick,
  isSurrendered = false,
  matchSummary,
  activeGameId,
  myGames,
  onSwitchToSoloSandbox,
  onSelectGame,
  playerPower,
  displayPrefs,
  displayPrefsSaveState,
  onChangeDisplayPrefs,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  turnClockOpen = false,
  onResolveTurn,
  onExitAdmin,
  authUser,
  onSignIn,
  onSignOut,
  onOpenAccount,
  historyEntries,
  historyViewIndex,
  historyLocked = false,
  onSelectHistoryTurn,
  onStepHistoryTurn,
  onOpenGameOverModal,
  toolsOpen = false,
  onToggleTools,
  toolsToggleRef,
}: CompactTopBarProps) {
  const inGame = viewMode !== 'lobby';

  return (
    <header className={styles.compactTopBar} data-testid="compact-top-bar">
      {inGame ? (
        <>
          <button
            type="button"
            data-testid="compact-back-lobby-btn"
            className={styles.compactBarIconBtn}
            onClick={onBackToLobby}
            aria-label="Back to lobby"
          >
            <ArrowLeft size={20} />
          </button>

          {onToggleTools && (
            <button
              ref={toolsToggleRef}
              type="button"
              data-testid="compact-tools-toggle"
              className={styles.compactBarIconBtn}
              data-open={toolsOpen}
              onClick={onToggleTools}
              aria-label={toolsOpen ? 'Close tools' : 'Tools'}
              aria-expanded={toolsOpen}
            >
              <Menu size={20} />
            </button>
          )}

          <TurnChronicle
            turn={turn}
            entries={historyEntries}
            viewIndex={historyViewIndex}
            locked={historyLocked}
            onSelect={onSelectHistoryTurn}
            onStep={onStepHistoryTurn}
          />

          {winner && (
            <button
              type="button"
              data-testid="game-over-pill"
              className={styles.compactWinnerBadge}
              onClick={onOpenGameOverModal}
              aria-label={`${POWER_METADATA[winner].shortName} wins. View campaign summary.`}
              title={`${POWER_METADATA[winner].shortName} wins — View Campaign Summary`}
            >
              <Crown size={15} />
            </button>
          )}
        </>
      ) : (
        <div className={styles.compactBrand} data-testid="compact-brand">
          <BrandEmblem
            as="span"
            iconSize={18}
            className={styles.compactBrandEmblem}
          />
          <span className={styles.compactBrandTitle}>Traitorous</span>
        </div>
      )}

      <div className={styles.compactRightActions}>
        {inGame && (
          <GameSettingsMenu
            viewMode={viewMode}
            matchSummary={matchSummary}
            playerPower={playerPower}
            onEnterSoloSandbox={onEnterSoloSandbox}
            onSaveSandbox={onSaveSandbox}
            onResetSandbox={onResetSandbox}
            onDeleteSandbox={onDeleteSandbox}
            onReturnToPreviousGame={onReturnToPreviousGame}
            onSurrenderClick={onSurrenderClick}
            isSurrendered={isSurrendered}
            isGameCreator={isGameCreator}
            onOpenAdminTools={onOpenAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={onToggleAdminOverride}
            turnClockOpen={turnClockOpen}
            onResolveTurn={onResolveTurn}
            gameOver={Boolean(winner)}
            onExitAdmin={onExitAdmin}
          />
        )}
        <AccountDropdownMenu
          viewMode={viewMode}
          activeGameId={activeGameId}
          activeGameSummary={matchSummary}
          myGames={myGames}
          authUser={authUser}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenAccount={onOpenAccount}
          displayPrefs={displayPrefs}
          displayPrefsSaveState={displayPrefsSaveState}
          onChangeDisplayPrefs={onChangeDisplayPrefs}
          onSwitchToSoloSandbox={onSwitchToSoloSandbox}
          onSelectGame={onSelectGame}
        />
      </div>
    </header>
  );
}
