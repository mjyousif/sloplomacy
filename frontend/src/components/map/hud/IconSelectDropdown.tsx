import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cx } from '../../../utils/cx';

export interface IconSelectDropdownClassNames {
  trigger?: string;
  leading?: string;
  value?: string;
  menu?: string;
  option?: string;
}

export interface IconSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  testId?: string;
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
  disabled?: boolean;
  leadingIcon?: ReactNode;
  hideChevron?: boolean;
  classNames?: IconSelectDropdownClassNames;
  onOpenChange?: (open: boolean) => void;
  onHoverOption?: (value: T | null) => void;
}

/** Custom accessible dropdown supporting leading icons/flags beside labels. */
export function IconSelectDropdown<T extends string = string>({
  id,
  testId,
  value,
  options,
  onChange,
  emptyOption,
  placeholder = 'Select…',
  title,
  disabled = false,
  leadingIcon,
  hideChevron = false,
  classNames,
  onOpenChange,
  onHoverOption,
}: IconSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onHoverOptionRef = useRef(onHoverOption);
  onHoverOptionRef.current = onHoverOption;

  useEffect(() => {
    onOpenChange?.(open && !disabled);
  }, [open, disabled, onOpenChange]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const isMenuOpen = open && !disabled;

  useEffect(() => {
    if (!isMenuOpen) return;
    return () => {
      onHoverOptionRef.current?.(null);
    };
  }, [isMenuOpen]);

  const selectedOption =
    value !== null
      ? (options.find((opt) => opt.value === value) ?? null)
      : null;

  return (
    <div
      className={`icon-select-dropdown${disabled ? ' disabled' : ''}${isMenuOpen ? ' open' : ''}`}
      ref={containerRef}
    >
      <button
        type="button"
        id={id}
        data-testid={testId}
        className={cx('icon-select-dropdown-trigger', classNames?.trigger)}
        title={title}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
      >
        {leadingIcon && (
          <span
            className={cx('icon-select-dropdown-leading', classNames?.leading)}
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        <span className={cx('icon-select-dropdown-value', classNames?.value)}>
          {selectedOption ? (
            <>
              {selectedOption.icon}
              <span>{selectedOption.label}</span>
            </>
          ) : emptyOption ? (
            <span>{emptyOption.label}</span>
          ) : (
            <span className="icon-select-dropdown-placeholder">
              {placeholder}
            </span>
          )}
        </span>
        {!hideChevron && (
          <ChevronDown
            size={13}
            className={`icon-select-dropdown-chevron${isMenuOpen ? ' open' : ''}`}
          />
        )}
      </button>

      {isMenuOpen && (
        <div
          className={cx('icon-select-dropdown-menu', classNames?.menu)}
          role="listbox"
          aria-labelledby={id}
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
              className={cx(
                'icon-select-dropdown-option',
                value === null && 'selected',
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
              className={cx(
                'icon-select-dropdown-option',
                value === opt.value && 'selected',
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
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
