import { Flag, MoreHorizontal } from 'lucide-react';
import type React from 'react';
import { useRef, useState } from 'react';
import { useDismissableLayer } from '../../hooks/useDismissableLayer';
import styles from './GameActionsMenu.module.css';

export interface GameActionsMenuProps {
  /** The game's name, for the button's label: "More actions for Concert of Vienna". */
  gameName: string;
  /** "Surrender & Leave", "Leave" or "Delete". */
  leaveLabel: string;
  onLeave: () => void;
}

/**
 * The ⋯ button on one of a player's own games. It keeps leaving, which cannot be undone, one
 * click away from Resume. The item only opens the surrender dialog, which still asks first.
 */
export const GameActionsMenu: React.FC<GameActionsMenuProps> = ({
  gameName,
  leaveLabel,
  onLeave,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDismissableLayer({
    open,
    rootRef,
    onDismiss: () => setOpen(false),
    restoreFocusRef: triggerRef,
  });

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={`More actions for ${gameName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="game-actions-btn"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((was) => !was);
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            data-testid="leave-campaign-btn"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onLeave();
            }}
          >
            <Flag size={13} />
            <span>{leaveLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
};
