import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useDismissableLayer } from '../../hooks/useDismissableLayer';
import { cx } from '../../utils/cx';
import styles from './IconSelectDropdown.module.css';
import scrollbarStyles from './Scrollbars.module.css';

export interface IconSelectDropdownClassNames {
  root?: string;
  trigger?: string;
  leading?: string;
  value?: string;
  valueText?: string;
  menu?: string;
  option?: string;
  native?: string;
}

export interface IconSelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional rich JSX label; falls back to `label` when omitted. */
  content?: ReactNode;
  icon?: ReactNode;
  testId?: string;
  /** Optional optgroup heading used when `useNative` renders a native `<select>`. */
  group?: string;
}

export interface IconSelectDropdownProps<T extends string = string> {
  id?: string;
  testId?: string;
  value: T | null;
  options: IconSelectOption<T>[];
  onChange: (value: T | null) => void;
  emptyOption?: {
    label: string;
    testId?: string;
  };
  placeholder?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  hideChevron?: boolean;
  /** Re-keys the selected text span when the active value/label changes to trigger CSS transitions. */
  animateValueChange?: boolean;
  /** Render a native `<select>` instead of the custom menu (e.g. for touch sheets). */
  useNative?: boolean;
  /** Marks the control with `data-compact="true"` for compact row styling. */
  compact?: boolean;
  classNames?: IconSelectDropdownClassNames;
  onOpenChange?: (open: boolean) => void;
  onHoverOption?: (value: T | null) => void;
}

type PendingFocusTarget = 'selected' | 'first' | 'last' | null;

/** Custom accessible dropdown supporting leading icons/flags, keyboard nav, and native `<select>` fallback. */
export function IconSelectDropdown<T extends string = string>({
  id,
  testId,
  value,
  options,
  onChange,
  emptyOption,
  placeholder = 'Select…',
  title,
  ariaLabel,
  disabled = false,
  leadingIcon,
  hideChevron = false,
  animateValueChange = false,
  useNative = false,
  compact = false,
  classNames,
  onOpenChange,
  onHoverOption,
}: IconSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<PendingFocusTarget>(null);
  const onHoverOptionRef = useRef(onHoverOption);
  onHoverOptionRef.current = onHoverOption;

  const isMenuOpen = !useNative && open && !disabled;

  useEffect(() => {
    onOpenChange?.(isMenuOpen);
  }, [isMenuOpen, onOpenChange]);

  useEffect(() => {
    if ((disabled || useNative) && open) {
      setOpen(false);
    }
  }, [disabled, useNative, open]);

  useDismissableLayer({
    open: isMenuOpen,
    rootRef: containerRef,
    onDismiss: () => setOpen(false),
    restoreFocusRef: triggerRef,
  });

  useEffect(() => {
    if (!isMenuOpen) return;
    return () => {
      onHoverOptionRef.current?.(null);
    };
  }, [isMenuOpen]);

  const optionValues: (T | null)[] = [
    ...(emptyOption ? [null] : []),
    ...options.map((opt) => opt.value),
  ];

  useEffect(() => {
    if (!isMenuOpen || !pendingFocusRef.current || !menuRef.current) return;
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const buttons = Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
    if (buttons.length === 0) return;

    let idx = 0;
    if (target === 'last') {
      idx = buttons.length - 1;
    } else if (target === 'selected') {
      const selectedIdx = buttons.findIndex(
        (btn) => btn.getAttribute('aria-selected') === 'true',
      );
      idx = Math.max(selectedIdx, 0);
    }
    buttons[idx]?.focus();
    if (idx < optionValues.length) {
      onHoverOptionRef.current?.(optionValues[idx]);
    }
  });

  if (useNative) {
    const hasGroups = options.some((opt) => opt.group !== undefined);

    const renderNativeOptions = () => {
      if (!hasGroups) {
        return options.map((opt) => (
          <option key={opt.value} value={opt.value} data-testid={opt.testId}>
            {opt.label}
          </option>
        ));
      }

      const nodes: ReactNode[] = [];
      const groups = new Map<string, IconSelectOption<T>[]>();
      for (const opt of options) {
        if (!opt.group) {
          nodes.push(
            <option key={opt.value} value={opt.value} data-testid={opt.testId}>
              {opt.label}
            </option>,
          );
        } else {
          const list = groups.get(opt.group) ?? [];
          list.push(opt);
          groups.set(opt.group, list);
        }
      }
      for (const [groupLabel, groupOpts] of groups) {
        nodes.push(
          <optgroup key={groupLabel} label={groupLabel}>
            {groupOpts.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                data-testid={opt.testId}
              >
                {opt.label}
              </option>
            ))}
          </optgroup>,
        );
      }
      return nodes;
    };

    return (
      <select
        id={id}
        data-testid={testId}
        data-compact={compact ? 'true' : undefined}
        className={cx(styles.iconSelectNative, classNames?.native)}
        value={value ?? ''}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
      >
        {emptyOption ? (
          <option value="" data-testid={emptyOption.testId}>
            {emptyOption.label}
          </option>
        ) : (
          !value && <option value="">{placeholder}</option>
        )}
        {renderNativeOptions()}
      </select>
    );
  }

  const selectedOption =
    value !== null
      ? (options.find((opt) => opt.value === value) ?? null)
      : null;

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || isMenuOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pendingFocusRef.current = 'selected';
      setOpen(true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      pendingFocusRef.current = 'first';
      setOpen(true);
    } else if (e.key === 'End') {
      e.preventDefault();
      pendingFocusRef.current = 'last';
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'Home' &&
      e.key !== 'End'
    ) {
      return;
    }
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        [],
    );
    if (buttons.length === 0) return;

    e.preventDefault();
    const activeEl = document.activeElement as HTMLButtonElement | null;
    const currentIdx = activeEl ? buttons.indexOf(activeEl) : -1;
    let nextIdx = 0;

    if (e.key === 'ArrowDown') {
      nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % buttons.length;
    } else if (e.key === 'ArrowUp') {
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
    if (nextIdx < optionValues.length) {
      onHoverOption?.(optionValues[nextIdx]);
    }
  };

  return (
    <div
      className={cx(styles.iconSelectDropdown, classNames?.root)}
      data-disabled={disabled ? 'true' : undefined}
      data-open={isMenuOpen ? 'true' : undefined}
      ref={containerRef}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        data-testid={testId}
        data-compact={compact ? 'true' : undefined}
        className={cx(styles.iconSelectDropdownTrigger, classNames?.trigger)}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
      >
        {leadingIcon && (
          <span className={classNames?.leading} aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        <span className={cx(styles.iconSelectDropdownValue, classNames?.value)}>
          {selectedOption ? (
            <>
              {selectedOption.icon}
              <span
                key={
                  animateValueChange
                    ? `${String(selectedOption.value)}:${selectedOption.label}`
                    : undefined
                }
                className={classNames?.valueText}
              >
                {selectedOption.content ?? selectedOption.label}
              </span>
            </>
          ) : emptyOption ? (
            <span>{emptyOption.label}</span>
          ) : (
            <span className={styles.iconSelectDropdownPlaceholder}>
              {placeholder}
            </span>
          )}
        </span>
        {!hideChevron && (
          <ChevronDown
            size={13}
            className={styles.iconSelectDropdownChevron}
            data-open={isMenuOpen ? 'true' : undefined}
          />
        )}
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className={cx(
            styles.iconSelectDropdownMenu,
            scrollbarStyles.thin,
            classNames?.menu,
          )}
          role="listbox"
          aria-labelledby={id}
          onKeyDown={handleMenuKeyDown}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch') {
              onHoverOption?.(null);
            }
          }}
        >
          {emptyOption && (
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              data-testid={emptyOption.testId}
              data-selected={value === null ? 'true' : undefined}
              className={cx(
                styles.iconSelectDropdownOption,
                classNames?.option,
              )}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') {
                  onHoverOption?.(null);
                }
              }}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <span>{emptyOption.label}</span>
            </button>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              data-testid={opt.testId}
              data-selected={value === opt.value ? 'true' : undefined}
              className={cx(
                styles.iconSelectDropdownOption,
                classNames?.option,
              )}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'touch') {
                  onHoverOption?.(opt.value);
                }
              }}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.icon}
              <span>{opt.content ?? opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
