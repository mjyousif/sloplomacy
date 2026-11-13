import {
  ChevronRight,
  Eye,
  Maximize2,
  PanelLeftOpen,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type React from 'react';
import { cx } from '../../utils/cx';
import styles from '../ToolsSidebar.module.css';
import type { ToolsSidebarProps } from './toolsSidebarProps';

export type CollapsedRailProps = Pick<
  ToolsSidebarProps,
  | 'onToggleCollapse'
  | 'zoomPercent'
  | 'onZoomIn'
  | 'onZoomOut'
  | 'onResetCamera'
  | 'sandboxMode'
  | 'onToggleSandboxMode'
>;

/** The minimalist rail the desktop panel folds into. The drawer is never collapsed. */
export const CollapsedRail: React.FC<CollapsedRailProps> = ({
  onToggleCollapse,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  sandboxMode,
  onToggleSandboxMode,
}) => (
  <aside
    className={cx(styles.toolsSidebar, styles.toolsSidebarCollapsed)}
    data-testid="tools-sidebar-collapsed"
    aria-label="Tools Sidebar Collapsed"
  >
    <button
      type="button"
      data-testid="tools-sidebar-expand-btn"
      className="sidebar-rail-btn rail-toggle-btn"
      onClick={onToggleCollapse}
      title="Expand Chancellery Tools & Intel"
    >
      <PanelLeftOpen size={16} />
    </button>

    <div className="rail-divider" />

    <div className={styles.railGroup} title={`Current Zoom: ${zoomPercent}%`}>
      <button
        type="button"
        className="sidebar-rail-btn"
        onClick={onZoomIn}
        title="Zoom In (+)"
      >
        <ZoomIn size={15} />
      </button>
      <button
        type="button"
        className="sidebar-rail-btn"
        onClick={onZoomOut}
        title="Zoom Out (-)"
      >
        <ZoomOut size={15} />
      </button>
      <button
        type="button"
        className="sidebar-rail-btn"
        onClick={onResetCamera}
        title="Fit Map / Reset Camera"
      >
        <Maximize2 size={14} />
      </button>
    </div>

    <div className="rail-divider" />

    <button
      type="button"
      className={cx('sidebar-rail-btn', sandboxMode && styles.railActiveGlow)}
      data-active={sandboxMode ? 'true' : undefined}
      onClick={onToggleSandboxMode}
      title={
        sandboxMode
          ? 'Hypothetical Mode ACTIVE (Click to toggle)'
          : 'Enter Hypothetical Mode'
      }
    >
      <Eye size={16} />
    </button>

    <div className="rail-spacer" />

    <button
      type="button"
      className="sidebar-rail-btn rail-expand-chevron"
      onClick={onToggleCollapse}
      title="Expand Tools"
    >
      <ChevronRight size={16} />
    </button>
  </aside>
);
