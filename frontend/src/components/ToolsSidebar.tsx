import { PanelLeftClose, Sliders, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { AdminSection } from './tools/AdminSection';
import { CollapsedRail } from './tools/CollapsedRail';
import { MapControlsSection } from './tools/MapControlsSection';
import { MapLegendSection } from './tools/MapLegendSection';
import { SandboxToolsSection } from './tools/SandboxToolsSection';
import { StandingsSection } from './tools/StandingsSection';
import type { ToolsSidebarProps } from './tools/toolsSidebarProps';

export type { ToolsSidebarProps };

export const ToolsSidebar: React.FC<ToolsSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  activePower,
  onSelectPower,
  ownership,
  units,
  finalizedPowers,
  surrenderedPowers = [],
  issues,
  isMultiplayer = false,
  participants,
  sandboxMode,
  onToggleSandboxMode,
  onClearForeignPreMoves,
  foreignModifiedOrdersCount,
  onGenerateAIMoves,
  onAIStepTurn,
  onLoadScenario,
  onSaveSandboxClick,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onToggleAdminOverride,
  variant = 'panel',
  open = false,
  onClose,
  historyFooter,
}) => {
  const isDrawer = variant === 'drawer';
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // A drawer takes focus when it opens and closes on Escape, like the other phone overlays.
  useEffect(() => {
    if (!isDrawer || !open) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDrawer, open, onClose]);

  // Collapsed Minimalist Rail
  if (collapsed && !isDrawer) {
    return (
      <CollapsedRail
        onToggleCollapse={onToggleCollapse}
        zoomPercent={zoomPercent}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetCamera={onResetCamera}
        sandboxMode={sandboxMode}
        onToggleSandboxMode={onToggleSandboxMode}
        isGameCreator={isGameCreator}
        onOpenAdminTools={onOpenAdminTools}
        adminOverrideActive={adminOverrideActive}
      />
    );
  }

  // Expanded Tools Sidebar
  const panel = (
    <aside
      className={`tools-sidebar tools-sidebar-expanded ${isDrawer ? 'tools-drawer' : ''}`.trim()}
      aria-label="Chancellery Tools & Intel"
      data-testid={isDrawer ? 'tools-drawer' : undefined}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
    >
      {/* 1. SIDEBAR HEADER */}
      <div className="tools-sidebar-header">
        <div className="tools-header-title">
          <Sliders size={16} className="tools-header-icon" />
          <div>
            <h3>CHANCELLERY TOOLS</h3>
            <span className="tools-header-sub">
              Intel, Camera &amp; War Room
            </span>
          </div>
        </div>
        {isDrawer ? (
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="tools-drawer-close-btn"
            className="sidebar-collapse-toggle-btn tools-drawer-close-btn"
            onClick={onClose}
            aria-label="Close tools"
          >
            <X size={20} />
          </button>
        ) : (
          <button
            type="button"
            data-testid="tools-sidebar-collapse-btn"
            className="sidebar-collapse-toggle-btn"
            onClick={onToggleCollapse}
            title="Collapse Tools Sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <div className="tools-sidebar-content">
        {/* 2. CAMERA & MAP CONTROLS */}
        {/* Phones zoom with the buttons on the map instead. */}
        {!isDrawer && (
          <MapControlsSection
            zoomPercent={zoomPercent}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetCamera={onResetCamera}
          />
        )}

        {/* 3. CARTOGRAPHIC TACTICAL LEGEND */}
        <MapLegendSection />

        {/* 4. GREAT POWERS STANDING & SELECTION */}
        <StandingsSection
          activePower={activePower}
          onSelectPower={onSelectPower}
          ownership={ownership}
          units={units}
          finalizedPowers={finalizedPowers}
          surrenderedPowers={surrenderedPowers}
          issues={issues}
          isMultiplayer={isMultiplayer}
          participants={participants}
          sandboxMode={sandboxMode}
          adminOverrideActive={adminOverrideActive}
        />

        {/* 5. HYPOTHETICAL MODE & TACTICAL AI GENERAL STAFF */}
        <SandboxToolsSection
          sandboxMode={sandboxMode}
          onToggleSandboxMode={onToggleSandboxMode}
          onClearForeignPreMoves={onClearForeignPreMoves}
          foreignModifiedOrdersCount={foreignModifiedOrdersCount}
          onGenerateAIMoves={onGenerateAIMoves}
          onAIStepTurn={onAIStepTurn}
          onLoadScenario={onLoadScenario}
          onSaveSandboxClick={onSaveSandboxClick}
          isMultiplayer={isMultiplayer}
        />

        {/* 6. CREATOR ADMINISTRATOR CONTROLS */}
        {isGameCreator && onOpenAdminTools && (
          <AdminSection
            onOpenAdminTools={onOpenAdminTools}
            adminOverrideActive={adminOverrideActive}
            onToggleAdminOverride={onToggleAdminOverride}
          />
        )}
      </div>

      {historyFooter}
    </aside>
  );

  if (!isDrawer) return panel;

  // Kept mounted so it can slide in and out. While closed it is inert: hidden from taps,
  // focus and screen readers.
  return (
    <div className={`tools-drawer-layer ${open ? 'open' : ''}`} inert={!open}>
      <div
        className="tools-drawer-backdrop"
        data-testid="tools-drawer-backdrop"
        onClick={onClose}
      />
      {panel}
    </div>
  );
};
