import { Clock, LogOut, Pencil, Play, Wrench } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../../utils/cx';
import displayStyles from '../header/DisplaySettings.module.css';
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
 * The Administrator mode choices themselves. Reused by both the standalone `AdminSettingsMenu`
 * and the unified top-bar `AccountDropdownMenu`.
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
        <button
          type="button"
          data-testid="btn-exit-admin-mode"
          className={styles.adminModeExitBtn}
          onClick={() => {
            onActionSelected?.();
            onExitAdmin();
          }}
        >
          <LogOut size={14} />
          <span>Exit Admin Mode</span>
        </button>
      )}
    </>
  );
}

/**
 * The top bar dropdown for the match creator/administrator, placed right beside DisplaySettingsMenu
 * and sharing its button, popover and option-card styling.
 */
export function AdminSettingsMenu({
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  turnClockOpen = false,
  onResolveTurn,
  gameOver = false,
  onExitAdmin,
}: AdminSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const anyModeActive = adminOverrideActive || turnClockOpen;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={displayStyles.displaySettings} ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        data-testid="btn-admin-menu"
        className={displayStyles.displaySettingsToggle}
        data-open={open}
        data-admin-active={anyModeActive}
        aria-label="Administrator tools"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Administrator tools"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <Wrench size={15} />
      </button>

      {open && (
        <div
          id={panelId}
          className={displayStyles.displaySettingsPanel}
          data-testid="admin-settings-panel"
          role="dialog"
          aria-label="Administrator tools"
        >
          <AdminSettingsOptions
            onOpenAdminTools={onOpenAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={onToggleAdminOverride}
            turnClockOpen={turnClockOpen}
            onResolveTurn={onResolveTurn}
            gameOver={gameOver}
            onExitAdmin={onExitAdmin}
            onActionSelected={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
