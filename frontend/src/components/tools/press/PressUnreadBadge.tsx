import type React from 'react';
import { usePressBadge } from '../../../hooks/usePress';
import { CountBadge, countBadgeAnchor } from '../../ui/CountBadge';

/** The class for a button that carries the badge: it places the badge on its corner. */
export const pressBadgeAnchor = countBadgeAnchor;

/**
 * The count of unread press, drawn on the corner of a button that leads to the Press section
 * (the collapsed rail's button and the phone's ≡ button). Nothing while all is read.
 */
export const PressUnreadBadge: React.FC = () => {
  const { unread } = usePressBadge();
  return (
    <CountBadge
      count={unread}
      max={99}
      placement="floating"
      size="sm"
      testId="press-unread-badge"
      role="status"
      ariaLabel={`${unread} unread press ${unread === 1 ? 'message' : 'messages'}`}
    />
  );
};
