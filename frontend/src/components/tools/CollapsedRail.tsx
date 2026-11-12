import {
  ChevronRight,
  Eye,
  Maximize2,
  PanelLeftOpen,
  ShieldAlert,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type React from 'react';
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
  | 'isGameCreator'
  | 'onOpenAdminTools'
  | 'adminOverrideActive'
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
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
}) => (
  <aside
    className="tools-sidebar tools-sidebar-collapsed"
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

    <div className="rail-group" title={`Current Zoom: ${zoomPercent}%`}>
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
      className={`sidebar-rail-btn ${sandboxMode ? 'rail-active-glow' : ''}`}
      onClick={onToggleSandboxMode}
      title={
        sandboxMode
          ? 'Hypothetical Mode ACTIVE (Click to toggle)'
          : 'Enter Hypothetical Mode'
      }
    >
      <Eye size={16} />
    </button>

    {isGameCreator && onOpenAdminTools && (
      <button
        type="button"
        className={`sidebar-rail-btn ${adminOverrideActive ? 'rail-admin-glow' : ''}`}
        onClick={onOpenAdminTools}
        title="Creator Admin Console"
      >
        <ShieldAlert size={16} />
      </button>
    )}

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
