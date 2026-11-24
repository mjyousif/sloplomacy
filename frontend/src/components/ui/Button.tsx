import type React from 'react';
import { cx } from '../../utils/cx';
import styles from './Button.module.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'danger-soft'
  | 'ghost';

export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends React.ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * Shared action button primitive covering the app's primary (brass CTA), secondary (slate),
 * danger (solid crimson), danger-soft (translucent crimson), and ghost (sky-hover outline)
 * archetypes, with consistent desktop and 44px compact touch sizing.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  className,
  ...props
}) => (
  <button
    type={type}
    className={cx(styles.button, className)}
    data-variant={variant}
    data-size={size}
    data-full-width={fullWidth ? 'true' : undefined}
    {...props}
  />
);
