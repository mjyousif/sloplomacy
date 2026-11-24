import type React from 'react';
import { cx } from '../../utils/cx';
import styles from './CountBadge.module.css';

/** Anchor class for buttons carrying a corner-positioned `CountBadge`. */
export const countBadgeAnchor = styles.anchor;

export interface CountBadgeProps {
  count: number;
  max?: number;
  placement?: 'inline' | 'floating';
  size?: 'xs' | 'sm' | 'md';
  testId?: string;
  role?: React.AriaRole;
  ariaLabel?: string;
  className?: string;
}

/** Compact amber numeric pill for unread counts (renders nothing when `count <= 0`). */
export function CountBadge({
  count,
  max = 99,
  placement = 'inline',
  size = 'sm',
  testId,
  role,
  ariaLabel,
  className,
}: CountBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={cx(styles.badge, className)}
      data-placement={placement}
      data-size={size}
      data-testid={testId}
      role={role}
      aria-label={ariaLabel}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}
