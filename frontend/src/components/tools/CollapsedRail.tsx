import {
  ChevronRight,
  Eye,
  Maximize2,
  MessagesSquare,
  PanelLeftOpen,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type React from 'react';
import { usePressBadge } from '../../hooks/usePress';
import { cx } from '../../utils/cx';
import chromeStyles from '../SidebarChrome.module.css';
import styles from '../ToolsSidebar.module.css';
import { PressUnreadBadge, pressBadgeAnchor } from './press/PressUnreadBadge';
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
}) => {
  const press = usePressBadge();
  return (
    <aside
      className={cx(styles.toolsSidebar, styles.toolsSidebarCollapsed)}
      data-testid="tools-sidebar-collapsed"
      aria-label="Tools Sidebar Collapsed"
    >
      <button
        type="button"
        data-testid="tools-sidebar-expand-btn"
        className={cx(chromeStyles.sidebarRailBtn, chromeStyles.railToggleBtn)}
        onClick={onToggleCollapse}
        title="Expand Chancellery Tools & Intel"
      >
        <PanelLeftOpen size={16} />
      </button>

      <div className={chromeStyles.railDivider} />

      <div className={styles.railGroup} title={`Current Zoom: ${zoomPercent}%`}>
        <button
          type="button"
          className={chromeStyles.sidebarRailBtn}
          onClick={onZoomIn}
          title="Zoom In (+)"
        >
          <ZoomIn size={15} />
        </button>
        <button
          type="button"
          className={chromeStyles.sidebarRailBtn}
          onClick={onZoomOut}
          title="Zoom Out (-)"
        >
          <ZoomOut size={15} />
        </button>
        <button
          type="button"
          className={chromeStyles.sidebarRailBtn}
          onClick={onResetCamera}
          title="Fit Map / Reset Camera"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className={chromeStyles.railDivider} />

      <button
        type="button"
        className={cx(
          chromeStyles.sidebarRailBtn,
          sandboxMode && styles.railActiveGlow,
        )}
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

      {press.enabled && (
        <button
          type="button"
          data-testid="tools-rail-press-btn"
          className={cx(chromeStyles.sidebarRailBtn, pressBadgeAnchor)}
          onClick={onToggleCollapse}
          title="Open Press"
        >
          <MessagesSquare size={15} />
          <PressUnreadBadge />
        </button>
      )}

      <div className={chromeStyles.railSpacer} />

      <button
        type="button"
        className={cx(
          chromeStyles.sidebarRailBtn,
          chromeStyles.railExpandChevron,
        )}
        onClick={onToggleCollapse}
        title="Expand Tools"
      >
        <ChevronRight size={16} />
      </button>
    </aside>
  );
};
