import type { ReactNode } from 'react';
import { cx } from '../../utils/cx';
import styles from './StatusBadge.module.css';

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  testId?: string;
  className?: string;
  children: ReactNode;
}

/** Pill badge conveying campaign/turn urgency (`your-move`, `waiting`, `finished`). */
export function StatusBadge({
  status,
  size = 'md',
  testId,
  className,
  children,
}: StatusBadgeProps) {
  return (
    <span
      className={cx(styles.badge, className)}
      data-status={status}
      data-size={size}
      data-testid={testId}
    >
      {children}
    </span>
  );
}
