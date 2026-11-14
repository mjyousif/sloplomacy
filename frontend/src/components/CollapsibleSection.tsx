import { ChevronDown, ChevronRight } from 'lucide-react';
import type React from 'react';
import { useId, useState } from 'react';
import { cx } from '../utils/cx';
import styles from './CollapsibleSection.module.css';

export interface CollapsibleSectionProps {
  /** Title or header content displayed in the section overline */
  title: React.ReactNode;
  /** Optional badge or counter element displayed on the right of the header */
  badge?: React.ReactNode;
  /** Whether this section can be collapsed. Defaults to true. When false, acts as a uniform styled section */
  collapsible?: boolean;
  /** Default open state when uncontrolled. Defaults to true */
  defaultOpen?: boolean;
  /** Controlled open state */
  isOpen?: boolean;
  /** Callback fired when toggle state changes */
  onToggle?: (isOpen: boolean) => void;
  /** Optional additional CSS class for the section container */
  className?: string;
  /** Optional icon displayed before the title */
  icon?: React.ReactNode;
  /** Children content rendered inside the section body */
  children?: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  badge,
  collapsible = true,
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle,
  className = '',
  icon,
  children,
}) => {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(defaultOpen);
  const contentId = useId();

  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  const handleToggle = () => {
    if (!collapsible) return;
    const next = !open;
    if (!isControlled) {
      setUncontrolledIsOpen(next);
    }
    onToggle?.(next);
  };

  return (
    <section
      className={cx(styles.sidebarSection, className)}
      data-open={open ? 'true' : 'false'}
    >
      <div className={styles.sidebarSectionHeader}>
        {collapsible ? (
          <button
            type="button"
            className={styles.sidebarSectionToggleBtn}
            data-testid="sidebar-section-toggle"
            onClick={handleToggle}
            aria-expanded={open}
            aria-controls={contentId}
          >
            <span className={styles.sidebarSectionTitleWrap}>
              <span className={styles.sidebarSectionChevron} aria-hidden="true">
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {icon && (
                <span className={styles.sidebarSectionIcon}>{icon}</span>
              )}
              <span>{title}</span>
            </span>
            {badge && (
              <span className={styles.sidebarSectionBadgeWrap}>{badge}</span>
            )}
          </button>
        ) : (
          <div
            className={styles.sidebarSectionStaticHeader}
            data-testid="sidebar-section-static-header"
          >
            <span className={styles.sidebarSectionTitleWrap}>
              {icon && (
                <span className={styles.sidebarSectionIcon}>{icon}</span>
              )}
              <span>{title}</span>
            </span>
            {badge && (
              <span className={styles.sidebarSectionBadgeWrap}>{badge}</span>
            )}
          </div>
        )}
      </div>

      {(!collapsible || open) && (
        <div
          id={contentId}
          className={styles.sidebarSectionContent}
          role="region"
          aria-label={typeof title === 'string' ? title : undefined}
        >
          {children}
        </div>
      )}
    </section>
  );
};
