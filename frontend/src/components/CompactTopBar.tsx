import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Compass,
  Crown,
  FlaskConical,
  LogIn,
  LogOut,
  MoreHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  User as UserIcon,
} from 'lucide-react';
import { DisplayPrefsSaveState } from '../hooks/useDisplayPrefs';
import { AuthUser, POWER_METADATA, Power } from '../types/diplomacy';
import { DisplayPrefs } from '../utils/displayPrefs';
import { DisplaySettingsOptions } from './DisplaySettingsMenu';

export interface CompactTopBarProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  /** The turn on the board, or null in the lobby. */
  turn: { season: string; year: number; phase: string } | null;
  winner: Power | null;
  errorCount: number;
  warningCount: number;
  /** Opens the order check. Only offered while there are problems, as on desktop. */
  onOpenOrderCheck: () => void;
  onBackToLobby: () => void;
  wsConnected: boolean;
  /** What the live connection is following, which desktop shows in a tooltip. */
  syncDetail: string;
  /** "Match name (FRA)" while in a multiplayer match. */
  matchLabel: string | null;
  onEnterSoloSandbox: (event?: React.MouseEvent) => void;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  onChangeDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  authUser: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** "2 errors, 1 warning", for the problem badge's label. */
export function describeIssueCount(
  errorCount: number,
  warningCount: number,
): string {
  const parts: string[] = [];
  if (errorCount > 0)
    parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
  if (warningCount > 0)
    parts.push(`${warningCount} warning${warningCount === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(', ') : 'No problems with your orders';
}

/**
 * The phone top bar: one row with the way back to the lobby, the turn, the order-problem
 * count and a ⋯ menu that holds everything the desktop bar shows on its right side.
 */
export function CompactTopBar({
  viewMode,
  turn,
  winner,
  errorCount,
  warningCount,
  onOpenOrderCheck,
  onBackToLobby,
  wsConnected,
  syncDetail,
  matchLabel,
  onEnterSoloSandbox,
  displayPrefs,
  displayPrefsSaveState,
  onChangeDisplayPrefs,
  authUser,
  onSignIn,
  onSignOut,
}: CompactTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'display'>('main');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const inGame = viewMode !== 'lobby';
  const issueTotal = errorCount + warningCount;

  const closeMenu = () => {
    setMenuOpen(false);
    setMenuView('main');
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      className="compact-top-bar"
      ref={rootRef}
      data-testid="compact-top-bar"
    >
      {inGame ? (
        <button
          type="button"
          data-testid="compact-back-lobby-btn"
          className="compact-bar-icon-btn"
          onClick={onBackToLobby}
          aria-label="Back to lobby"
        >
          <ArrowLeft size={20} />
        </button>
      ) : (
        <div className="compact-brand" data-testid="compact-brand">
          <span className="brand-emblem compact-brand-emblem">
            <Compass size={18} />
          </span>
          <span className="compact-brand-title">Sloplomacy</span>
        </div>
      )}

      {turn && (
        <span className="compact-turn-text" data-testid="compact-turn-text">
          {turn.season} {turn.year} · {turn.phase}
        </span>
      )}

      {inGame &&
        (winner ? (
          <span className="compact-winner-badge">
            <Crown size={14} />
            <span>{POWER_METADATA[winner].shortName} wins</span>
          </span>
        ) : issueTotal > 0 ? (
          <button
            type="button"
            data-testid="compact-issue-badge"
            className={`compact-issue-badge ${errorCount > 0 ? 'has-errors' : 'has-warnings'}`}
            onClick={onOpenOrderCheck}
            aria-label={`${describeIssueCount(errorCount, warningCount)}. Open the order check.`}
          >
            {errorCount > 0 ? (
              <AlertOctagon size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            <span>{issueTotal}</span>
          </button>
        ) : (
          <span
            className="compact-issue-badge is-clean"
            role="img"
            aria-label={describeIssueCount(0, 0)}
          >
            <ShieldCheck size={15} />
          </span>
        ))}

      <button
        ref={toggleRef}
        type="button"
        data-testid="compact-menu-toggle"
        className={`compact-bar-icon-btn compact-menu-toggle ${menuOpen ? 'open' : ''}`}
        aria-label={wsConnected ? 'Menu' : 'Menu (live sync is reconnecting)'}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
      >
        <MoreHorizontal size={22} />
        {!wsConnected && (
          <span className="compact-menu-alert-dot" aria-hidden="true" />
        )}
      </button>

      {menuOpen && (
        <div
          id={menuId}
          className="compact-menu-panel"
          data-testid="compact-menu-panel"
          role="dialog"
          aria-label="Menu"
        >
          {menuView === 'display' ? (
            <>
              <button
                type="button"
                data-testid="compact-menu-display-back"
                className="compact-menu-back"
                onClick={() => setMenuView('main')}
              >
                <ChevronLeft size={18} />
                <span>Menu</span>
              </button>
              <div className="compact-display-settings">
                <DisplaySettingsOptions
                  prefs={displayPrefs}
                  saveState={displayPrefsSaveState}
                  onChange={onChangeDisplayPrefs}
                />
              </div>
            </>
          ) : (
            <>
              <div className="compact-menu-status">
                <span
                  className={`ws-status-dot ${wsConnected ? 'dot-online' : 'dot-offline'}`}
                  aria-hidden="true"
                />
                <div className="compact-menu-status-text">
                  <strong>{wsConnected ? 'Live Sync' : 'Connecting…'}</strong>
                  <span>{syncDetail}</span>
                </div>
              </div>

              {matchLabel && (
                <div className="compact-menu-match">
                  <Crown size={15} />
                  <span>{matchLabel}</span>
                </div>
              )}

              {viewMode !== 'sandbox' && (
                <button
                  type="button"
                  data-testid="compact-menu-solo-sandbox"
                  className="compact-menu-item"
                  onClick={(event) => {
                    closeMenu();
                    onEnterSoloSandbox(event);
                  }}
                >
                  <FlaskConical size={18} />
                  <span>Solo Sandbox</span>
                </button>
              )}

              <button
                type="button"
                data-testid="compact-menu-display-settings"
                className="compact-menu-item"
                onClick={() => setMenuView('display')}
              >
                <SlidersHorizontal size={18} />
                <span>Display settings</span>
                <ChevronRight size={18} className="compact-menu-item-chevron" />
              </button>

              <div className="compact-menu-account">
                {authUser ? (
                  <>
                    <div className="compact-menu-user">
                      <UserIcon size={16} />
                      <div>
                        <strong>{authUser.displayName}</strong>
                        <span>{authUser.email}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="compact-menu-item"
                      onClick={() => {
                        closeMenu();
                        onSignOut();
                      }}
                    >
                      <LogOut size={18} />
                      <span>Sign Out</span>
                    </button>
                  </>
                ) : (
                  <>
                    <div className="compact-menu-user">
                      <UserIcon size={16} />
                      <div>
                        <strong>Guest Mode</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="compact-menu-item primary"
                      onClick={() => {
                        closeMenu();
                        onSignIn();
                      }}
                    >
                      <LogIn size={18} />
                      <span>Sign In / Register</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );
}
