import { Clock, LogOut, Pencil, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { cx } from '../utils/cx';
import styles from './AdminSettingsMenu.module.css';
import displayStyles from './DisplaySettings.module.css';

export interface AdminSettingsMenuProps {
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onToggleAdminOverride?: () => void;
  /** Whether the Turn and Clock Settings panel holds the right sidebar. */
  turnClockOpen?: boolean;
  /** Leaves whichever admin mode is on (Edit Board asks first if edits are staged). */
  onExitAdmin?: () => void;
}

interface AdminModeOption {
  id: 'edit-board' | 'turn-clock';
  testId: string;
  name: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  onSelect?: () => void;
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
  onExitAdmin,
}: AdminSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const anyModeActive = adminOverrideActive || turnClockOpen;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
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
      description: 'Revert a turn, set the season or unlock orders.',
      icon: <Clock size={18} />,
      active: turnClockOpen,
      onSelect: onOpenAdminTools,
    },
  ];

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
                    onClick={() => {
                      setOpen(false);
                      if (!opt.active) opt.onSelect?.();
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
                setOpen(false);
                onExitAdmin();
              }}
            >
              <LogOut size={14} />
              <span>Exit Admin Mode</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
