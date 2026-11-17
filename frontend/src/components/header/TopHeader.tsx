import { Crown } from 'lucide-react';
import type { DisplayPrefsSaveState } from '../../hooks/useDisplayPrefs';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../../types/diplomacy';
import type { DisplayPrefs } from '../../utils/displayPrefs';
import { BrandEmblem } from '../ui/BrandEmblem';
import { AccountDropdownMenu } from './AccountDropdownMenu';
import { GameSettingsMenu } from './GameSettingsMenu';
import styles from './TopHeader.module.css';
import { TurnChronicle } from './TurnChronicle';

export interface TopHeaderProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  /** The turn on the board. Shown only away from the lobby. */
  turn: { season: string; year: number; phase: string };
  winner: Power | null;
  onBackToLobby: () => void;
  onEnterSoloSandbox: (event?: React.MouseEvent) => void;
  onSaveSandbox?: () => void;
  onResetSandbox?: () => void;
  onReturnToPreviousGame?: () => void;
  onSurrenderClick?: () => void;
  isSurrendered?: boolean;
  /** The match being played, named with the player's power in multiplayer. */
  matchSummary: MultiplayerGameSummary | null;
  activeGameId?: string;
  myGames?: MultiplayerGameSummary[];
  onSwitchToSoloSandbox?: () => void;
  onSelectGame?: (game: MultiplayerGameSummary) => void;
  playerPower: Power;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  onChangeDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  isGameCreator?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
  turnClockOpen?: boolean;
  onResolveTurn?: (event?: React.MouseEvent) => void;
  onExitAdmin?: () => void;
  authUser: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;
  /** Turn history controls unified with the top-bar turn chronicle. */
  historyEntries?: TurnHistoryEntry[];
  historyViewIndex?: number | null;
  historyLocked?: boolean;
  onSelectHistoryTurn?: (index: number | null) => void;
  onStepHistoryTurn?: (delta: -1 | 1) => void;
  onOpenGameOverModal?: () => void;
}

/**
 * The desktop top bar: brand and navigation on the left, the turn (and the winner, once
 * there is one) in the middle while a board is open, and the unified account/settings
 * dropdown on the right. Phones get `CompactTopBar` instead.
 */
export function TopHeader({
  viewMode,
  turn,
  winner,
  onBackToLobby,
  onEnterSoloSandbox,
  onSaveSandbox,
  onResetSandbox,
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
}: TopHeaderProps) {
  return (
    <header className={styles.imperialTopHeader}>
      <div className={styles.brandAndNav}>
        <div
          className={styles.brandBlock}
          data-clickable="true"
          data-testid="brand-block"
          onClick={onBackToLobby}
          title="Return to Main Lobby"
        >
          <BrandEmblem />
          <h1 className={styles.brandTitle}>SLOPLOMACY 1901</h1>
        </div>
      </div>

      {/* Center Board Readout (Only when viewing Map Board) */}
      {viewMode !== 'lobby' && (
        <div className={styles.headerCenterTelemetry}>
          <TurnChronicle
            turn={turn}
            entries={historyEntries}
            viewIndex={historyViewIndex}
            locked={historyLocked}
            onSelect={onSelectHistoryTurn}
            onStep={onStepHistoryTurn}
          />

          {winner && (
            <div className={styles.headerCenterBadges}>
              <button
                type="button"
                className={styles.gameOverPill}
                data-testid="game-over-pill"
                onClick={onOpenGameOverModal}
                title="View Campaign Conclusion Summary"
              >
                <Crown size={14} />
                <span>
                  {POWER_METADATA[winner].shortName.toUpperCase()} WINS
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Right Header Controls: Game Settings & Account Menu */}
      <div className={styles.headerRightActions}>
        {viewMode !== 'lobby' && (
          <GameSettingsMenu
            viewMode={viewMode}
            matchSummary={matchSummary}
            playerPower={playerPower}
            onEnterSoloSandbox={onEnterSoloSandbox}
            onSaveSandbox={onSaveSandbox}
            onResetSandbox={onResetSandbox}
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
