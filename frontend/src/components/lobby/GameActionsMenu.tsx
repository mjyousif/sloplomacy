import { Flag, MoreHorizontal } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
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
