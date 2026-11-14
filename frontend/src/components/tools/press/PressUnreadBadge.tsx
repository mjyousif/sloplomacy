import type React from 'react';
import { usePressBadge } from '../../../hooks/usePress';
import styles from '../PressSection.module.css';

/** The class for a button that carries the badge: it places the badge on its corner. */
export const pressBadgeAnchor = styles.badgeAnchor;

/**
 * The count of unread press, drawn on the corner of a button that leads to the Press section
 * (the collapsed rail's button and the phone's ≡ button). Nothing while all is read.
 */
export const PressUnreadBadge: React.FC = () => {
  const { unread } = usePressBadge();
  if (unread === 0) return null;
  return (
    <span
      className={styles.floatingBadge}
      data-testid="press-unread-badge"
      role="status"
      aria-label={`${unread} unread press ${unread === 1 ? 'message' : 'messages'}`}
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
};
