import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Crown,
  Flag,
  FlaskConical,
  LogIn,
  LogOut,
  Pencil,
  Play,
  SlidersHorizontal,
  User as UserIcon,
} from 'lucide-react';
import type { DisplayPrefsSaveState } from '../../hooks/useDisplayPrefs';
import type { AuthUser, Power } from '../../types/diplomacy';
import type { DisplayPrefs } from '../../utils/displayPrefs';
import styles from './CompactTopBar.module.css';
import { DisplaySettingsOptions } from './DisplaySettingsMenu';

export interface CompactTopBarMenuProps {
  menuId: string;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  inGame: boolean;
  winner: Power | null;
  wsConnected: boolean;
  syncDetail: string;
  matchLabel: string | null;
  menuView: 'main' | 'display';
  setMenuView: (view: 'main' | 'display') => void;
  closeMenu: () => void;
  onEnterSoloSandbox: (event?: React.MouseEvent) => void;
  onSurrenderClick?: () => void;
  isSurrendered: boolean;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  onChangeDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  isGameCreator: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive: boolean;
  onToggleAdminOverride?: () => void;
  turnClockOpen: boolean;
  onResolveTurn?: (event?: React.MouseEvent) => void;
  onExitAdmin?: () => void;
  authUser: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;
}

/**
 * The phone top-bar ⋯ overflow popover holding sync status, Solo Sandbox,
 * Display Settings, admin controls, Surrender, and account actions.
 */
export function CompactTopBarMenu({
  menuId,
  viewMode,
  inGame,
  winner,
  wsConnected,
  syncDetail,
  matchLabel,
  menuView,
  setMenuView,
  closeMenu,
  onEnterSoloSandbox,
  onSurrenderClick,
  isSurrendered,
  displayPrefs,
  displayPrefsSaveState,
  onChangeDisplayPrefs,
  isGameCreator,
  onOpenAdminTools,
  adminOverrideActive,
  onToggleAdminOverride,
  turnClockOpen,
  onResolveTurn,
  onExitAdmin,
  authUser,
  onSignIn,
  onSignOut,
  onOpenAccount,
}: CompactTopBarMenuProps) {
  return (
    <div
      id={menuId}
      className={styles.compactMenuPanel}
      data-testid="compact-menu-panel"
      role="dialog"
      aria-label="Menu"
    >
      {inGame && menuView === 'display' ? (
        <div
          key="display"
          className={styles.compactMenuView}
          data-view="display"
        >
          <button
            type="button"
            data-testid="compact-menu-display-back"
            className={styles.compactMenuBack}
            onClick={() => setMenuView('main')}
          >
            <ChevronLeft size={18} />
            <span>Menu</span>
          </button>
          <div className={styles.compactDisplaySettings}>
            <DisplaySettingsOptions
              prefs={displayPrefs}
              saveState={displayPrefsSaveState}
              onChange={onChangeDisplayPrefs}
            />
          </div>
        </div>
      ) : (
        <div key="main" className={styles.compactMenuView} data-view="main">
          <div className={styles.compactMenuStatus}>
            <span
              className={styles.wsStatusDot}
              data-online={wsConnected}
              aria-hidden="true"
            />
            <div className={styles.compactMenuStatusText}>
              <strong>{wsConnected ? 'Live Sync' : 'Connecting…'}</strong>
              <span>{syncDetail}</span>
            </div>
          </div>

          {matchLabel && (
            <div className={styles.compactMenuMatch}>
              <Crown size={15} />
              <span>{matchLabel}</span>
            </div>
          )}

          {viewMode !== 'sandbox' && (
            <button
              type="button"
              data-testid="compact-menu-solo-sandbox"
              className={styles.compactMenuItem}
              onClick={(event) => {
                closeMenu();
                onEnterSoloSandbox(event);
              }}
            >
              <FlaskConical size={18} />
              <span>Solo Sandbox</span>
            </button>
          )}

          {inGame && (
            <button
              type="button"
              data-testid="compact-menu-display-settings"
              className={styles.compactMenuItem}
              onClick={() => setMenuView('display')}
            >
              <SlidersHorizontal size={18} />
              <span>Display settings</span>
              <ChevronRight
                size={18}
                className={styles.compactMenuItemChevron}
              />
            </button>
          )}

          {inGame && isGameCreator && (
            <>
              {onToggleAdminOverride && (
                <button
                  type="button"
                  data-testid="btn-toggle-direct-edit"
                  className={styles.compactMenuItem}
                  onClick={() => {
                    closeMenu();
                    onToggleAdminOverride();
                  }}
                >
                  <Pencil size={18} />
                  <span>
                    {adminOverrideActive ? 'Edit Board: ON' : 'Edit Board'}
                  </span>
                </button>
              )}
              {onOpenAdminTools && (
                <button
                  type="button"
                  data-testid="btn-open-admin-console"
                  className={styles.compactMenuItem}
                  onClick={() => {
                    closeMenu();
                    onOpenAdminTools();
                  }}
                >
                  <Clock size={18} />
                  <span>
                    Turn and Clock Settings{turnClockOpen ? ': ON' : ''}
                  </span>
                </button>
              )}
              {onResolveTurn && (
                <button
                  type="button"
                  data-testid="btn-admin-resolve-turn"
                  className={styles.compactMenuItem}
                  disabled={Boolean(winner)}
                  onClick={(event) => {
                    closeMenu();
                    onResolveTurn(event);
                  }}
                >
                  <Play size={18} />
                  <span>Resolve Turn</span>
                </button>
              )}
              {(adminOverrideActive || turnClockOpen) && onExitAdmin && (
                <button
                  type="button"
                  data-testid="btn-exit-admin-mode"
                  className={styles.compactMenuItem}
                  onClick={() => {
                    closeMenu();
                    onExitAdmin();
                  }}
                >
                  <LogOut size={18} />
                  <span>Exit Admin Mode</span>
                </button>
              )}
            </>
          )}

          {viewMode === 'multiplayer' && onSurrenderClick && !isSurrendered && (
            <button
              type="button"
              data-testid="compact-menu-surrender"
              data-variant="danger"
              className={styles.compactMenuItem}
              onClick={() => {
                closeMenu();
                onSurrenderClick();
              }}
            >
              <Flag size={18} />
              <span>Surrender</span>
            </button>
          )}

          <div className={styles.compactMenuAccount}>
            {authUser ? (
              <>
                <div className={styles.compactMenuUser}>
                  <UserIcon size={16} />
                  <div>
                    <strong>{authUser.displayName}</strong>
                    <span>{authUser.email}</span>
                  </div>
                </div>
                {onOpenAccount && (
                  <button
                    type="button"
                    className={styles.compactMenuItem}
                    onClick={() => {
                      closeMenu();
                      onOpenAccount();
                    }}
                  >
                    <UserIcon size={18} />
                    <span>Account &amp; Username</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.compactMenuItem}
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
                <div className={styles.compactMenuUser}>
                  <UserIcon size={16} />
                  <div>
                    <strong>Guest Mode</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.compactMenuItem}
                  data-variant="primary"
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
        </div>
      )}
    </div>
  );
}
