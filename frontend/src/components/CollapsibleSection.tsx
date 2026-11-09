import { ChevronDown, ChevronRight } from 'lucide-react';
import type React from 'react';
import { useId, useState } from 'react';

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
      className={`sidebar-section ${collapsible ? 'is-collapsible' : 'is-static'} ${open ? 'is-open' : 'is-collapsed'} ${className}`.trim()}
    >
      <div className="sidebar-section-header">
        {collapsible ? (
          <button
            type="button"
            className="sidebar-section-toggle-btn"
            onClick={handleToggle}
            aria-expanded={open}
            aria-controls={contentId}
          >
            <span className="sidebar-section-title-wrap">
              <span className="sidebar-section-chevron" aria-hidden="true">
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              {icon && <span className="sidebar-section-icon">{icon}</span>}
              <span className="sidebar-section-title">{title}</span>
            </span>
            {badge && (
              <span className="sidebar-section-badge-wrap">{badge}</span>
            )}
          </button>
        ) : (
          <div className="sidebar-section-static-header">
            <span className="sidebar-section-title-wrap">
              {icon && <span className="sidebar-section-icon">{icon}</span>}
              <span className="sidebar-section-title">{title}</span>
            </span>
            {badge && (
              <span className="sidebar-section-badge-wrap">{badge}</span>
            )}
          </div>
        )}
      </div>

      {(!collapsible || open) && (
        <div
          id={contentId}
          className="sidebar-section-content"
          role="region"
          aria-label={typeof title === 'string' ? title : undefined}
        >
          {children}
        </div>
      )}
    </section>
  );
};
