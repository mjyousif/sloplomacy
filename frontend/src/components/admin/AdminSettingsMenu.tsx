import { Clock, LogOut, Pencil, Play } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
import displayStyles from '../header/DisplaySettings.module.css';
import { Button } from '../ui/Button';
import styles from './AdminSettingsMenu.module.css';

export interface AdminSettingsMenuProps {
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
  /** Whether the Turn and Clock Settings panel holds the right sidebar. */
  turnClockOpen?: boolean;
  /** Force-resolve the current phase and advance to the next turn. */
  onResolveTurn?: (event?: React.MouseEvent) => void;
  gameOver?: boolean;
  /** Leaves whichever admin mode is on (Edit Board asks first if edits are staged). */
  onExitAdmin?: () => void;
}

interface AdminModeOption {
  id: 'edit-board' | 'turn-clock' | 'resolve-turn';
  testId: string;
  name: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  onSelect?: (event?: React.MouseEvent) => void;
}

export interface AdminSettingsOptionsProps extends AdminSettingsMenuProps {
  /** Called before triggering an admin action so a parent popover can close. */
  onActionSelected?: () => void;
}

/**
 * The Administrator mode choices rendered inside the top bar `GameSettingsMenu`
 * "Administrator" subview.
 */
export function AdminSettingsOptions({
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  turnClockOpen = false,
  onResolveTurn,
  gameOver = false,
  onExitAdmin,
  onActionSelected,
}: AdminSettingsOptionsProps) {
  const anyModeActive = adminOverrideActive || turnClockOpen;

  const options: AdminModeOption[] = [
    {
      id: 'edit-board',
      testId: 'btn-toggle-direct-edit',
      name: 'Edit Board',
      description: 'Move, spawn or destroy units and reassign territories.',
      icon: <Pencil size={18} />,
      active: adminOverrideActive,
      onSelect: onToggleAdminOverride,
    },
    {
      id: 'turn-clock',
      testId: 'btn-open-admin-console',
      name: 'Turn and Clock Settings',
      description: 'Revert a turn or set the season.',
      icon: <Clock size={18} />,
      active: turnClockOpen,
      onSelect: onOpenAdminTools,
    },
    {
      id: 'resolve-turn',
      testId: 'btn-admin-resolve-turn',
      name: 'Resolve Turn',
      description:
        'Force-resolve the current phase and advance to the next turn.',
      icon: <Play size={18} />,
      active: false,
      disabled: gameOver,
      onSelect: onResolveTurn,
    },
  ];

  return (
    <>
      <h2 className={displayStyles.displaySettingsTitle}>Administrator</h2>
      <p className={displayStyles.displaySettingsNote}>
        Board override and turn management tools.
      </p>

      <div
        className={cx(
          displayStyles.displaySettingsGroup,
          styles.displayAdminActions,
        )}
        data-testid="display-settings-admin-group"
      >
        {options.map(
          (opt) =>
            opt.onSelect && (
              <button
                key={opt.id}
                type="button"
                data-testid={opt.testId}
                aria-pressed={opt.active}
                className={cx(
                  displayStyles.displayOptionCard,
                  styles.adminModeCard,
                )}
                data-active={opt.active}
                disabled={opt.disabled}
                onClick={(event) => {
                  onActionSelected?.();
                  if (!opt.active) opt.onSelect?.(event);
                }}
              >
                <span className={styles.adminModeIcon}>{opt.icon}</span>
                <span className={displayStyles.displayOptionText}>
                  <span className={displayStyles.displayOptionName}>
                    {opt.name}
                  </span>
                  <span className={displayStyles.displayOptionDescription}>
                    {opt.description}
                  </span>
                </span>
              </button>
            ),
        )}
      </div>

      {anyModeActive && onExitAdmin && (
        <Button
          variant="secondary"
          fullWidth
          data-testid="btn-exit-admin-mode"
          className={styles.adminModeExitBtn}
          onClick={() => {
            onActionSelected?.();
            onExitAdmin();
          }}
        >
          <LogOut size={14} />
          <span>Exit Admin Mode</span>
        </Button>
      )}
    </>
  );
}
