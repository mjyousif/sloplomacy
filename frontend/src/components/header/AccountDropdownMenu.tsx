import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  LogIn,
  LogOut,
  SlidersHorizontal,
  UserCog,
  User as UserIcon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useDismissableLayer } from '../../hooks/useDismissableLayer';
import type { DisplayPrefsSaveState } from '../../hooks/useDisplayPrefs';
import type { AuthUser, MultiplayerGameSummary } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { DisplayPrefs } from '../../utils/displayPrefs';
import { describeMyGame, myPowerIn } from '../../utils/heroGame';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './AccountDropdownMenu.module.css';
import { DisplaySettingsOptions } from './DisplaySettingsMenu';
import popoverStyles from './HeaderPopover.module.css';

export interface AccountDropdownMenuProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId?: string;
  activeGameSummary: MultiplayerGameSummary | null;
  myGames?: MultiplayerGameSummary[];
  authUser: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenAccount?: () => void;
  displayPrefs: DisplayPrefs;
  displayPrefsSaveState: DisplayPrefsSaveState;
  onChangeDisplayPrefs: (change: Partial<DisplayPrefs>) => void;
  onSwitchToSoloSandbox?: () => void;
  onSelectGame?: (game: MultiplayerGameSummary) => void;
}

type MenuView = 'main' | 'display';

/**
 * Top-bar account dropdown consolidating player identity, Display Settings,
 * Switch Game switcher (including Solo Sandbox), and Sign Out.
 */
export function AccountDropdownMenu({
  viewMode,
  activeGameId,
  activeGameSummary,
  myGames = [],
  authUser,
  onSignIn,
  onSignOut,
  onOpenAccount,
  displayPrefs,
  displayPrefsSaveState,
  onChangeDisplayPrefs,
  onSwitchToSoloSandbox,
  onSelectGame,
}: AccountDropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<MenuView>('main');
  const [changeGameOpen, setChangeGameOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const inGame = viewMode !== 'lobby';

  // Reset subview during render if the board context no longer allows it.
  const activeView: MenuView =
    menuView === 'display' && !inGame ? 'main' : menuView;

  const closeMenu = () => {
    setOpen(false);
    setMenuView('main');
    setChangeGameOpen(false);
  };

  useDismissableLayer({
    open,
    rootRef,
    onDismiss: closeMenu,
    restoreFocusRef: toggleRef,
  });

  const isInSoloDraft =
    viewMode === 'sandbox' &&
    (!activeGameSummary || Boolean(activeGameSummary.is_draft));

  const currentGameLabel =
    viewMode === 'lobby'
      ? 'Lobby'
      : isInSoloDraft
        ? 'Solo Sandbox'
        : (activeGameSummary?.name ?? 'Current Match');

  const triggerTitle = authUser ? authUser.displayName : 'Guest Mode';
  const trimmedFullName = authUser?.fullName?.trim() || '';
  const distinctPersonName =
    trimmedFullName && trimmedFullName !== authUser?.displayName
      ? trimmedFullName
      : null;

  return (
    <div className={popoverStyles.root} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        data-testid="account-menu-trigger"
        className={cx(popoverStyles.trigger, styles.accountMenuTrigger)}
        data-open={open}
        data-signed-in={Boolean(authUser)}
        aria-label={
          authUser
            ? `Account and settings menu (${authUser.displayName})`
            : 'Guest menu'
        }
        title={triggerTitle}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        <UserIcon size={15} />
      </button>

      {open && (
        <div
          id={panelId}
          className={popoverStyles.panel}
          data-testid="account-menu-panel"
          role="dialog"
          aria-label={authUser ? 'Account and settings' : 'Guest menu'}
        >
          {activeView === 'display' ? (
            <div
              key="display"
              className={popoverStyles.view}
              data-view="display"
            >
              <button
                type="button"
                data-testid="account-menu-back"
                className={popoverStyles.subviewBackBtn}
                onClick={() => setMenuView('main')}
              >
                <ChevronLeft size={15} />
                <span>Back</span>
              </button>
              <DisplaySettingsOptions
                prefs={displayPrefs}
                saveState={displayPrefsSaveState}
                onChange={onChangeDisplayPrefs}
              />
            </div>
          ) : (
            <div key="main" className={popoverStyles.view} data-view="main">
              <div
                className={styles.accountProfileHeader}
                data-testid="account-menu-profile"
              >
                {authUser ? (
                  <>
                    {distinctPersonName && (
                      <div
                        className={styles.accountProfileName}
                        data-testid="account-menu-name"
                      >
                        {distinctPersonName}
                      </div>
                    )}
                    <div
                      className={styles.accountProfileUsername}
                      data-primary={!distinctPersonName}
                      data-testid="account-menu-username"
                    >
                      @{authUser.displayName}
                    </div>
                    {authUser.email && (
                      <div
                        className={styles.accountProfileEmail}
                        data-testid="account-menu-email"
                      >
                        {authUser.email}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className={styles.accountProfileName}
                      data-testid="account-menu-name"
                    >
                      Guest Mode
                    </div>
                    <div className={styles.accountProfileEmail}>
                      Sign in to save settings and join matches.
                    </div>
                  </>
                )}
              </div>

              <div className={popoverStyles.divider} />

              <div className={popoverStyles.menuList}>
                {inGame && (
                  <button
                    type="button"
                    data-testid="account-menu-display-settings"
                    className={popoverStyles.menuItem}
                    onClick={() => setMenuView('display')}
                  >
                    <SlidersHorizontal
                      size={15}
                      className={popoverStyles.menuItemIcon}
                    />
                    <span>Display Settings</span>
                    <ChevronRight
                      size={15}
                      className={cx(
                        popoverStyles.menuItemChevron,
                        styles.accountMenuChevron,
                      )}
                    />
                  </button>
                )}

                {authUser && onOpenAccount && (
                  <button
                    type="button"
                    data-testid="account-menu-account-settings"
                    className={popoverStyles.menuItem}
                    onClick={() => {
                      closeMenu();
                      onOpenAccount();
                    }}
                  >
                    <UserCog size={15} className={popoverStyles.menuItemIcon} />
                    <span>Account Settings</span>
                  </button>
                )}

                <button
                  type="button"
                  data-testid="account-menu-change-game"
                  className={cx(popoverStyles.menuItem, styles.accountMenuItem)}
                  data-expanded={changeGameOpen}
                  aria-expanded={changeGameOpen}
                  onClick={() => setChangeGameOpen((isOpen) => !isOpen)}
                >
                  <ArrowLeftRight
                    size={15}
                    className={popoverStyles.menuItemIcon}
                  />
                  <span className={styles.menuItemTitle}>Switch Game</span>
                  <span
                    className={styles.menuItemSubtext}
                    data-testid="switch-game-current"
                  >
                    {currentGameLabel}
                  </span>
                  <ChevronDown
                    size={15}
                    className={cx(
                      popoverStyles.menuItemChevron,
                      styles.accountMenuChevron,
                    )}
                  />
                </button>

                {changeGameOpen && (
                  <div
                    className={styles.changeGameList}
                    data-testid="change-game-list"
                  >
                    <button
                      type="button"
                      data-testid="change-game-item-solo"
                      className={styles.changeGameItem}
                      data-current={isInSoloDraft}
                      onClick={() => {
                        closeMenu();
                        if (!isInSoloDraft) onSwitchToSoloSandbox?.();
                      }}
                    >
                      <span className={styles.changeGameIcon}>
                        <FlaskConical size={14} />
                      </span>
                      <span className={styles.changeGameText}>
                        <span className={styles.changeGameName}>
                          Solo Sandbox
                        </span>
                        <span className={styles.changeGameMeta}>
                          7-power practice board
                        </span>
                      </span>
                      {isInSoloDraft && (
                        <span className={styles.changeGameCurrentBadge}>
                          <Check size={11} />
                          Current
                        </span>
                      )}
                    </button>

                    {myGames.map((game) => {
                      const copy = describeMyGame(game, authUser);
                      const power = myPowerIn(game, authUser);
                      const isCurrent = inGame && activeGameId === game.game_id;
                      return (
                        <button
                          key={game.game_id}
                          type="button"
                          data-testid={`change-game-item-${game.game_id}`}
                          className={styles.changeGameItem}
                          data-current={isCurrent}
                          onClick={() => {
                            closeMenu();
                            if (!isCurrent) onSelectGame?.(game);
                          }}
                        >
                          <span className={styles.changeGameIcon}>
                            {game.is_sandbox || !power ? (
                              <FlaskConical size={14} />
                            ) : (
                              <PowerFlag power={power} width={18} height={12} />
                            )}
                          </span>
                          <span className={styles.changeGameText}>
                            <span className={styles.changeGameName}>
                              {game.name}
                            </span>
                            <span className={styles.changeGameMeta}>
                              {copy.turn} · {copy.status}
                            </span>
                          </span>
                          {isCurrent && (
                            <span className={styles.changeGameCurrentBadge}>
                              <Check size={11} />
                              Current
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={popoverStyles.divider} />

              {authUser ? (
                <button
                  type="button"
                  data-testid="account-menu-signout"
                  className={styles.signoutBtn}
                  onClick={() => {
                    closeMenu();
                    onSignOut();
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="account-menu-signin"
                  className={styles.signinBtn}
                  onClick={() => {
                    closeMenu();
                    onSignIn();
                  }}
                >
                  <LogIn size={15} />
                  <span>Sign In / Register</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
