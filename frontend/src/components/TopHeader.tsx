import {
  AlertOctagon,
  AlertTriangle,
  Crown,
  FlaskConical,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import type { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
  type TurnHistoryEntry,
} from '../types/diplomacy';
import { cx } from '../utils/cx';
import type { DisplayPrefs } from '../utils/displayPrefs';
import { AdminSettingsMenu } from './AdminSettingsMenu';
import { BrandEmblem } from './BrandEmblem';
import { DisplaySettingsMenu } from './DisplaySettingsMenu';
import styles from './TopHeader.module.css';
import { TurnChronicle } from './TurnChronicle';

export interface TopHeaderProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  /** The turn on the board. Shown only away from the lobby. */
  turn: { season: string; year: number; phase: string };
  winner: Power | null;
  errorCount: number;
  warningCount: number;
  /** Opens the order check from the error or warning pill. */
  onOpenOrderCheck: () => void;
  onBackToLobby: () => void;
  onEnterSoloSandbox: (event?: React.MouseEvent) => void;
  /** The match being played, named with the player's power in multiplayer. */
  matchSummary: MultiplayerGameSummary | null;
  playerPower: Power;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  onChangeDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  isGameCreator?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
  turnClockOpen?: boolean;
  onExitAdmin?: () => void;
  authUser: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;
  /** Turn history controls unified with the top-bar turn chronicle. */
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
 * The desktop top bar: brand and navigation on the left, the turn and order check in the
 * middle while a board is open, and display settings and account on the right. Phones
 * get `CompactTopBar` instead.
 */
export function TopHeader({
  viewMode,
  turn,
  winner,
  errorCount,
  warningCount,
  onOpenOrderCheck,
  onBackToLobby,
  onEnterSoloSandbox,
  matchSummary,
  playerPower,
  displayPrefs,
  displayPrefsSaveState,
  onChangeDisplayPrefs,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  turnClockOpen = false,
  onExitAdmin,
  authUser,
  onSignIn,
  onSignOut,
  onOpenAccount,
  historyEntries,
  historyViewIndex,
  historyPower,
  historyLocked = false,
  onSelectHistoryTurn,
  onStepHistoryTurn,
  onSelectHistoryPower,
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
          <div>
            <h1 className={styles.brandTitle}>SLOPLOMACY 1901</h1>
            <span className={styles.brandSubtitle}>
              TACTICAL ENGINE &amp; MULTIPLAYER CHANCELLERY
            </span>
          </div>
        </div>

        {/* Primary Navigation Switcher */}
        <nav className={styles.topViewNav}>
          <button
            type="button"
            data-testid="nav-tab-sandbox"
            data-active={viewMode === 'sandbox'}
            className={styles.navTabBtn}
            onClick={onEnterSoloSandbox}
            title="Open standalone 7-power practice laboratory"
          >
            <FlaskConical size={14} />
            <span>Solo Sandbox</span>
          </button>
          {viewMode === 'multiplayer' && matchSummary && (
            <span
              className={styles.navActiveMatchPill}
              data-testid="nav-match-pill"
            >
              <Crown size={13} />
              <span>
                {matchSummary.name} ({POWER_METADATA[playerPower].shortName})
              </span>
            </span>
          )}
        </nav>
      </div>

      {/* Center Board Readout (Only when viewing Map Board) */}
      {viewMode !== 'lobby' && (
        <div className={styles.headerCenterTelemetry}>
          <TurnChronicle
            turn={turn}
            entries={historyEntries}
            viewIndex={historyViewIndex}
            power={historyPower}
            locked={historyLocked}
            onSelect={onSelectHistoryTurn}
            onStep={onStepHistoryTurn}
            onSelectPower={onSelectHistoryPower}
          />

          {(winner || errorCount > 0 || warningCount > 0) && (
            <div className={styles.headerCenterBadges}>
              {winner && (
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
              )}

              {(errorCount > 0 || warningCount > 0) && (
                <div className={styles.headerSanityReadout}>
                  {errorCount > 0 ? (
                    <div
                      className={styles.headerErrorPill}
                      data-testid="header-error-pill"
                      onClick={onOpenOrderCheck}
                      title="Click to open Sanity Check Diagnostics"
                    >
                      <AlertOctagon size={15} />
                      <span>
                        Error: {errorCount}
                        {warningCount > 0 ? ` • Warning: ${warningCount}` : ''}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={styles.headerWarningPill}
                      data-testid="header-warning-pill"
                      onClick={onOpenOrderCheck}
                      title="Click to open Sanity Check Diagnostics"
                    >
                      <AlertTriangle size={15} />
                      <span>Warning: {warningCount}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right Header Controls: Board Actions + User Account */}
      <div className={styles.headerRightActions}>
        {viewMode !== 'lobby' && (
          <DisplaySettingsMenu
            prefs={displayPrefs}
            saveState={displayPrefsSaveState}
            onChange={onChangeDisplayPrefs}
          />
        )}

        {viewMode !== 'lobby' && isGameCreator && (
          <AdminSettingsMenu
            onOpenAdminTools={onOpenAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={onToggleAdminOverride}
            turnClockOpen={turnClockOpen}
            onExitAdmin={onExitAdmin}
          />
        )}

        {/* User Authentication Controls */}
        {authUser ? (
          <div className={styles.headerUserMenu}>
            <button
              type="button"
              className={cx(styles.headerUserBadge, styles.headerUserBadgeBtn)}
              onClick={onOpenAccount}
              title={`Account Settings (${authUser.email})`}
            >
              <UserIcon size={13} />
              <span>{authUser.displayName}</span>
            </button>
            <button
              type="button"
              className={styles.headerAuthBtn}
              data-variant="signout"
              onClick={onSignOut}
              title="Sign Out"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className={styles.headerUserMenu}>
            <span className={styles.headerGuestTag}>Guest Mode</span>
            <button
              type="button"
              className={styles.headerAuthBtn}
              data-variant="signin"
              onClick={onSignIn}
            >
              <LogIn size={14} />
              <span>Sign In / Register</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
