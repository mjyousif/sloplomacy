import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  Compass,
  Crown,
  FlaskConical,
  LogIn,
  LogOut,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import type { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import {
  type AuthUser,
  type MultiplayerGameSummary,
  POWER_METADATA,
  type Power,
} from '../types/diplomacy';
import type { DisplayPrefs } from '../utils/displayPrefs';
import { AdminSettingsMenu } from './AdminSettingsMenu';
import { DisplaySettingsMenu } from './DisplaySettingsMenu';

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
  wsConnected: boolean;
  /** The game the live connection follows, for its tooltip. */
  gameId: string;
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
}

/**
 * The desktop top bar: brand and navigation on the left, the turn and order check in the
 * middle while a board is open, and the live-sync badge, display settings and account on
 * the right. Phones get `CompactTopBar` instead.
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
  wsConnected,
  gameId,
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
}: TopHeaderProps) {
  return (
    <header className="imperial-top-header">
      <div className="brand-and-nav">
        <div
          className="brand-block clickable"
          onClick={onBackToLobby}
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
            onClick={onEnterSoloSandbox}
            title="Open standalone 7-power practice laboratory"
          >
            <FlaskConical size={14} />
            <span>Solo Sandbox</span>
          </button>
          {viewMode === 'multiplayer' && matchSummary && (
            <span className="nav-active-match-pill">
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
        <div className="header-center-telemetry">
          <div
            className="turn-chronicle-pill"
            data-testid="turn-chronicle-pill"
          >
            <Calendar size={15} className="turn-cal-icon" />
            <span className="turn-season-text">
              {turn.season.toUpperCase()} {turn.year}
            </span>
            <span className="turn-phase-divider">•</span>
            <span className="turn-phase-text">
              {turn.phase.toUpperCase()} PHASE
            </span>
          </div>

          {winner && (
            <span className="game-over-pill">
              <Crown size={14} />
              <span>{POWER_METADATA[winner].shortName.toUpperCase()} WINS</span>
            </span>
          )}

          <div className="header-sanity-readout">
            {errorCount > 0 ? (
              <div
                className="header-error-pill"
                onClick={onOpenOrderCheck}
                title="Click to open Sanity Check Diagnostics"
              >
                <AlertOctagon size={15} />
                <span>
                  Error: {errorCount}
                  {warningCount > 0 ? ` • Warning: ${warningCount}` : ''}
                </span>
              </div>
            ) : warningCount > 0 ? (
              <div
                className="header-warning-pill"
                onClick={onOpenOrderCheck}
                title="Click to open Sanity Check Diagnostics"
              >
                <AlertTriangle size={15} />
                <span>Warning: {warningCount}</span>
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
              ? `Real-time synchronization connected (${viewMode === 'lobby' ? 'Lobby Feed' : gameId})`
              : 'Connecting to real-time synchronization...'
          }
        >
          <span
            className={`ws-status-dot ${wsConnected ? 'dot-online' : 'dot-offline'}`}
          />
          <span>{wsConnected ? 'Live Sync' : 'Connecting...'}</span>
        </div>

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
          <div className="header-user-Menu">
            <span className="header-user-badge" title={authUser.email}>
              <UserIcon size={13} />
              <span>{authUser.displayName}</span>
            </span>
            <button
              type="button"
              className="header-auth-btn signout"
              onClick={onSignOut}
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
