import { type ReactNode, useRef } from 'react';
import { cx } from '../../utils/cx';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
  testId?: string;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  semantics?: 'toggle' | 'tabs';
  tone?: 'gold' | 'sky' | 'neutral';
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
  optionClassName?: string;
  testId?: string;
}

/** Shared segmented pill track supporting both toggle (`role="group"`) and tab (`role="tablist"`) semantics. */
export function SegmentedControl<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  semantics = 'toggle',
  tone = 'gold',
  size = 'md',
  fullWidth = false,
  className,
  optionClassName,
  testId,
}: SegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const isTabs = semantics === 'tabs';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isTabs) return;
    if (
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowRight' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    ) {
      return;
    }
    const buttons = Array.from(
      trackRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ??
        [],
    );
    if (buttons.length === 0) return;

    e.preventDefault();
    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIdx = activeEl ? buttons.indexOf(activeEl) : -1;
    let nextIdx = 0;

    if (e.key === 'ArrowRight') {
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx =
        currentIdx < 0
          ? buttons.length - 1
          : (currentIdx - 1 + buttons.length) % buttons.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = buttons.length - 1;
    }

    buttons[nextIdx]?.focus();
    const nextOption = options[nextIdx];
    if (nextOption) {
      onChange(nextOption.value);
    }
  };

  return (
    <div
      ref={trackRef}
      className={cx(styles.track, className)}
      role={isTabs ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      data-testid={testId}
      data-size={size}
      data-full-width={fullWidth ? 'true' : undefined}
      onKeyDown={handleKeyDown}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? active : undefined}
            aria-pressed={!isTabs ? active : undefined}
            data-active={active ? 'true' : undefined}
            data-tone={tone}
            data-testid={opt.testId}
            title={opt.title}
            className={cx(styles.option, optionClassName)}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            {typeof opt.label === 'string' || typeof opt.label === 'number' ? (
              <span>{opt.label}</span>
            ) : (
              opt.label
            )}
          </button>
        );
      })}
    </div>
  );
}
