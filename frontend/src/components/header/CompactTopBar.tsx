import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Crown,
  Menu,
  MoreHorizontal,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DisplayPrefsSaveState } from '../../hooks/useDisplayPrefs';
import {
  type AuthUser,
  POWER_METADATA,
  type Power,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { DisplayPrefs } from '../../utils/displayPrefs';
import {
  PressUnreadBadge,
  pressBadgeAnchor,
} from '../tools/press/PressUnreadBadge';
import { BrandEmblem } from '../ui/BrandEmblem';
import styles from './CompactTopBar.module.css';
import { CompactTopBarMenu } from './CompactTopBarMenu';

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
  onSurrenderClick?: () => void;
  isSurrendered?: boolean;
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
  /** In a game, ≡ opens the tools drawer. */
  toolsOpen?: boolean;
  onToggleTools?: () => void;
  /** So the drawer can hand focus back to ≡ when it closes. */
  toolsToggleRef?: React.Ref<HTMLButtonElement>;
  onOpenGameOverModal?: () => void;
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
  onSurrenderClick,
  isSurrendered = false,
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
  toolsOpen = false,
  onToggleTools,
  toolsToggleRef,
  onOpenGameOverModal,
}: CompactTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'display'>('main');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  const inGame = viewMode !== 'lobby';
  const issueTotal = errorCount + warningCount;

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuView('main');
  }, []);

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
  }, [menuOpen, closeMenu]);

  return (
    <header
      className={styles.compactTopBar}
      ref={rootRef}
      data-testid="compact-top-bar"
    >
      {inGame ? (
        <button
          type="button"
          data-testid="compact-back-lobby-btn"
          className={styles.compactBarIconBtn}
          onClick={onBackToLobby}
          aria-label="Back to lobby"
        >
          <ArrowLeft size={20} />
        </button>
      ) : (
        <div className={styles.compactBrand} data-testid="compact-brand">
          <BrandEmblem
            as="span"
            iconSize={18}
            className={styles.compactBrandEmblem}
          />
          <span className={styles.compactBrandTitle}>Sloplomacy</span>
        </div>
      )}

      {inGame && onToggleTools && (
        <button
          ref={toolsToggleRef}
          type="button"
          data-testid="compact-tools-toggle"
          className={cx(styles.compactBarIconBtn, pressBadgeAnchor)}
          data-open={toolsOpen}
          onClick={onToggleTools}
          aria-label={toolsOpen ? 'Close tools' : 'Tools'}
          aria-expanded={toolsOpen}
        >
          <Menu size={20} />
          {!toolsOpen && <PressUnreadBadge />}
        </button>
      )}

      {turn && (
        // Two lines, so the full phase name still fits beside ←, ≡, the problem badge and ⋯ at 360px.
        // The separator is only hidden from sight, so the text still reads "Spring 1901 · Movement".
        <span
          className={styles.compactTurnText}
          data-testid="compact-turn-text"
        >
          <span
            className={styles.compactTurnSeason}
            data-testid="compact-turn-season"
          >
            {turn.season} {turn.year}
          </span>
          <span
            className={styles.compactTurnSep}
            data-testid="compact-turn-sep"
          >
            {' · '}
          </span>
          <span
            className={styles.compactTurnPhase}
            data-testid="compact-turn-phase"
          >
            {turn.phase}
          </span>
        </span>
      )}

      {inGame &&
        (winner ? (
          <button
            type="button"
            className={styles.compactWinnerBadge}
            onClick={onOpenGameOverModal}
            aria-label={`${POWER_METADATA[winner].shortName} wins. View campaign summary.`}
          >
            <Crown size={14} />
            <span>{POWER_METADATA[winner].shortName} wins</span>
          </button>
        ) : issueTotal > 0 ? (
          <button
            type="button"
            data-testid="compact-issue-badge"
            className={styles.compactIssueBadge}
            data-status={errorCount > 0 ? 'errors' : 'warnings'}
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
            className={styles.compactIssueBadge}
            data-status="clean"
            data-testid="compact-issue-clean"
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
        className={styles.compactBarIconBtn}
        data-open={menuOpen}
        data-admin-active={
          adminOverrideActive || turnClockOpen ? 'true' : undefined
        }
        aria-label={wsConnected ? 'Menu' : 'Menu (live sync is reconnecting)'}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
      >
        <MoreHorizontal size={22} />
        {!wsConnected && (
          <span
            className={styles.compactMenuAlertDot}
            data-testid="compact-menu-alert-dot"
            aria-hidden="true"
          />
        )}
      </button>

      {menuOpen && (
        <CompactTopBarMenu
          menuId={menuId}
          viewMode={viewMode}
          inGame={inGame}
          winner={winner}
          wsConnected={wsConnected}
          syncDetail={syncDetail}
          matchLabel={matchLabel}
          menuView={menuView}
          setMenuView={setMenuView}
          closeMenu={closeMenu}
          onEnterSoloSandbox={onEnterSoloSandbox}
          onSurrenderClick={onSurrenderClick}
          isSurrendered={isSurrendered}
          displayPrefs={displayPrefs}
          displayPrefsSaveState={displayPrefsSaveState}
          onChangeDisplayPrefs={onChangeDisplayPrefs}
          isGameCreator={isGameCreator}
          onOpenAdminTools={onOpenAdminTools}
          adminOverrideActive={adminOverrideActive}
          onToggleAdminOverride={onToggleAdminOverride}
          turnClockOpen={turnClockOpen}
          onResolveTurn={onResolveTurn}
          onExitAdmin={onExitAdmin}
          authUser={authUser}
          onSignIn={onSignIn}
          onSignOut={onSignOut}
          onOpenAccount={onOpenAccount}
        />
      )}
    </header>
  );
}
