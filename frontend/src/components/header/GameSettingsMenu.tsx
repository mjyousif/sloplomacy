import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Flag,
  FlaskConical,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Wrench,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { MultiplayerGameSummary, Power } from '../../types/diplomacy';
import { AdminSettingsOptions } from '../admin/AdminSettingsMenu';
import { PowerFlag } from '../ui/PowerFlag';
import displayStyles from './DisplaySettings.module.css';
import styles from './GameSettingsMenu.module.css';

export interface GameSettingsMenuProps {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  matchSummary?: MultiplayerGameSummary | null;
  playerPower?: Power | null;
  onEnterSoloSandbox: (event?: React.MouseEvent) => void;
  onSaveSandbox?: () => void;
  onResetSandbox?: (event?: React.MouseEvent) => void;
  onDeleteSandbox?: (event?: React.MouseEvent) => void;
  onReturnToPreviousGame?: () => void;
  onSurrenderClick?: () => void;
  isSurrendered?: boolean;
  isGameCreator?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
  turnClockOpen?: boolean;
  onResolveTurn?: (event?: React.MouseEvent) => void;
  gameOver?: boolean;
  onExitAdmin?: () => void;
}

type GameMenuView = 'main' | 'admin';

/**
 * Top-bar "Game Settings" dropdown holding Export to Solo Sandbox (when not already in
 * Solo Sandbox), Administrator (for the game creator while on a board), and Surrender
 * (in a live multiplayer seat). Trigger displays a flask in Solo Sandbox and a crown in games.
 */
export function GameSettingsMenu({
  viewMode,
  matchSummary = null,
  playerPower = null,
  onEnterSoloSandbox,
  onSaveSandbox,
  onResetSandbox,
  onDeleteSandbox,
  onReturnToPreviousGame,
  onSurrenderClick,
  isSurrendered = false,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  turnClockOpen = false,
  onResolveTurn,
  gameOver = false,
  onExitAdmin,
}: GameSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuView, setMenuView] = useState<GameMenuView>('main');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  const isSandbox = viewMode === 'sandbox';
  const isDraftSandbox =
    isSandbox && (!matchSummary || Boolean(matchSummary.is_draft));
  const subtitle = isDraftSandbox
    ? null
    : (matchSummary?.name ?? 'Current Game');
  const gameTypeLabel = isDraftSandbox
    ? 'Local sandbox'
    : isSandbox
      ? 'Saved sandbox'
      : 'Live game';
  const saveSandboxLabel = isDraftSandbox
    ? 'Save Sandbox'
    : 'Save as New Sandbox';
  const showPowerFlag =
    !isSandbox && viewMode === 'multiplayer' && Boolean(playerPower);
  const showExportToSandbox = viewMode !== 'lobby' && !isSandbox;
  const showAdmin = viewMode !== 'lobby' && isGameCreator;
  const showSaveSandbox = isSandbox && Boolean(onSaveSandbox);
  const showResetSandbox = isSandbox && Boolean(onResetSandbox);
  const showDeleteSandbox =
    isSandbox && !isDraftSandbox && Boolean(onDeleteSandbox);
  const showReturnPrevious = isSandbox && Boolean(onReturnToPreviousGame);
  const showSurrender =
    viewMode === 'multiplayer' && Boolean(onSurrenderClick) && !isSurrendered;
  const anyAdminModeActive =
    showAdmin && (adminOverrideActive || turnClockOpen);

  // Reset subview during render if Administrator is no longer available.
  const activeView: GameMenuView =
    menuView === 'admin' && !showAdmin ? 'main' : menuView;

  const closeMenu = () => {
    setOpen(false);
    setMenuView('main');
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.gameSettingsMenu} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        data-testid="game-settings-trigger"
        className={styles.gameSettingsTrigger}
        data-open={open}
        data-solo-sandbox={isSandbox}
        data-icon={isSandbox ? 'flask' : 'crown'}
        data-admin-active={anyAdminModeActive}
        aria-label="Game Settings"
        title="Game Settings"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? closeMenu() : setOpen(true))}
      >
        {isSandbox ? <FlaskConical size={15} /> : <Crown size={15} />}
      </button>

      {open && (
        <div
          id={panelId}
          className={styles.gameSettingsPanel}
          data-testid="game-settings-panel"
          role="dialog"
          aria-label="Game Settings"
        >
          {activeView === 'admin' ? (
            <div key="admin" className={styles.gameMenuView} data-view="admin">
              <button
                type="button"
                data-testid="game-settings-back"
                className={styles.gameSubviewBack}
                onClick={() => setMenuView('main')}
              >
                <ChevronLeft size={15} />
                <span>Back</span>
              </button>
              <div data-testid="admin-settings-panel">
                <AdminSettingsOptions
                  onOpenAdminTools={onOpenAdminTools}
                  adminOverrideActive={adminOverrideActive}
                  onToggleAdminOverride={onToggleAdminOverride}
                  turnClockOpen={turnClockOpen}
                  onResolveTurn={onResolveTurn}
                  gameOver={gameOver}
                  onExitAdmin={onExitAdmin}
                  onActionSelected={closeMenu}
                />
              </div>
            </div>
          ) : (
            <div key="main" className={styles.gameMenuView} data-view="main">
              <h2
                className={`${displayStyles.displaySettingsTitle} ${styles.gameSettingsTitle}`}
              >
                Game Settings
              </h2>
              {subtitle && (
                <p
                  className={styles.gameSettingsSubtitle}
                  data-testid="game-settings-subtitle"
                >
                  {showPowerFlag && playerPower && (
                    <PowerFlag
                      power={playerPower}
                      width={15}
                      height={11}
                      className={styles.gameSettingsSubtitleFlag}
                    />
                  )}
                  <span>{subtitle}</span>
                </p>
              )}
              <p
                className={styles.gameSettingsType}
                data-testid="game-settings-type"
              >
                {isSandbox ? (
                  <FlaskConical
                    size={13}
                    className={styles.gameSettingsTypeFlask}
                    data-testid="game-settings-type-flask"
                    aria-hidden="true"
                  />
                ) : (
                  <Crown
                    size={13}
                    className={styles.gameSettingsTypeCrown}
                    data-testid="game-settings-type-crown"
                    aria-hidden="true"
                  />
                )}
                <span>{gameTypeLabel}</span>
              </p>

              <div className={styles.gameMenuList}>
                {showExportToSandbox && (
                  <button
                    type="button"
                    data-testid="game-settings-solo-sandbox"
                    className={styles.gameMenuItem}
                    onClick={(event) => {
                      closeMenu();
                      onEnterSoloSandbox(event);
                    }}
                  >
                    <FlaskConical
                      size={15}
                      className={styles.gameMenuItemIcon}
                    />
                    <span>Export to Solo Sandbox</span>
                  </button>
                )}

                {showAdmin && (
                  <button
                    type="button"
                    data-testid="game-settings-admin-settings"
                    className={styles.gameMenuItem}
                    data-admin-active={anyAdminModeActive}
                    onClick={() => setMenuView('admin')}
                  >
                    <Wrench size={15} className={styles.gameMenuItemIcon} />
                    <span>Administrator</span>
                    {anyAdminModeActive && (
                      <span
                        className={styles.gameMenuBadge}
                        data-variant="danger"
                      >
                        Active
                      </span>
                    )}
                    <ChevronRight
                      size={15}
                      className={styles.gameMenuChevron}
                    />
                  </button>
                )}

                {showSaveSandbox && (
                  <button
                    type="button"
                    data-testid="game-settings-save-sandbox"
                    className={styles.gameMenuItem}
                    onClick={() => {
                      closeMenu();
                      onSaveSandbox?.();
                    }}
                  >
                    <Save size={15} className={styles.gameMenuItemIcon} />
                    <span>{saveSandboxLabel}</span>
                  </button>
                )}

                {showResetSandbox && (
                  <button
                    type="button"
                    data-testid="game-settings-reset-sandbox"
                    className={styles.gameMenuItem}
                    onClick={(event) => {
                      closeMenu();
                      onResetSandbox?.(event);
                    }}
                  >
                    <RotateCcw size={15} className={styles.gameMenuItemIcon} />
                    <span>Reset Sandbox</span>
                  </button>
                )}

                {showDeleteSandbox && (
                  <button
                    type="button"
                    data-testid="game-settings-delete-sandbox"
                    data-variant="danger"
                    className={styles.gameMenuItem}
                    onClick={(event) => {
                      closeMenu();
                      onDeleteSandbox?.(event);
                    }}
                  >
                    <Trash2 size={15} className={styles.gameMenuItemIcon} />
                    <span>Delete Sandbox</span>
                  </button>
                )}

                {showReturnPrevious && (
                  <button
                    type="button"
                    data-testid="game-settings-return-previous"
                    className={styles.gameMenuItem}
                    onClick={() => {
                      closeMenu();
                      onReturnToPreviousGame?.();
                    }}
                  >
                    <Undo2 size={15} className={styles.gameMenuItemIcon} />
                    <span>Return to Previous Game</span>
                  </button>
                )}

                {showSurrender && (
                  <>
                    {(showExportToSandbox || showAdmin) && (
                      <div className={styles.gameMenuDivider} />
                    )}
                    <button
                      type="button"
                      data-testid="game-settings-surrender"
                      data-variant="danger"
                      className={styles.gameMenuItem}
                      onClick={() => {
                        closeMenu();
                        onSurrenderClick?.();
                      }}
                    >
                      <Flag size={15} className={styles.gameMenuItemIcon} />
                      <span>Surrender</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
