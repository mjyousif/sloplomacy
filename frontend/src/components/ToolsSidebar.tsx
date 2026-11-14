import { PanelLeftClose, Sliders, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { cx } from '../utils/cx';
import chromeStyles from './SidebarChrome.module.css';
import styles from './ToolsSidebar.module.css';
import { CollapsedRail } from './tools/CollapsedRail';
import { MapControlsSection } from './tools/MapControlsSection';
import { MapLegendSection } from './tools/MapLegendSection';
import { PressSection } from './tools/PressSection';
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
  adminOverrideActive = false,
  variant = 'panel',
  open = false,
  onClose,
  historyFooter,
  press,
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
      />
    );
  }

  // Expanded Tools Sidebar
  const panel = (
    <aside
      className={cx(
        styles.toolsSidebar,
        styles.toolsSidebarExpanded,
        isDrawer && styles.toolsDrawer,
      )}
      aria-label="Chancellery Tools & Intel"
      data-testid={isDrawer ? 'tools-drawer' : 'tools-sidebar'}
      data-drawer={isDrawer ? 'true' : undefined}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
    >
      {/* 1. SIDEBAR HEADER */}
      <div className={styles.toolsSidebarHeader}>
        <div className={styles.toolsHeaderTitle}>
          <Sliders size={16} className={styles.toolsHeaderIcon} />
          <div>
            <h3>CHANCELLERY TOOLS</h3>
            <span className={styles.toolsHeaderSub}>
              Intel, Camera &amp; War Room
            </span>
          </div>
        </div>
        {isDrawer ? (
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="tools-drawer-close-btn"
            className={cx(
              chromeStyles.sidebarCollapseToggleBtn,
              styles.toolsDrawerCloseBtn,
            )}
            onClick={onClose}
            aria-label="Close tools"
          >
            <X size={20} />
          </button>
        ) : (
          <button
            type="button"
            data-testid="tools-sidebar-collapse-btn"
            className={chromeStyles.sidebarCollapseToggleBtn}
            onClick={onToggleCollapse}
            title="Collapse Tools Sidebar"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      <div className={styles.toolsSidebarContent}>
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
          pressPower={
            press && !press.gameOver && !press.surrendered
              ? press.power
              : undefined
          }
        />

        {/* 5. PRESS: PUBLIC BOX, PRIVATE THREADS & ANONYMOUS NOTES */}
        {press && <PressSection {...press} visible={!isDrawer || open} />}

        {/* 6. HYPOTHETICAL MODE & TACTICAL AI GENERAL STAFF */}
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
      </div>

      {historyFooter}
    </aside>
  );

  if (!isDrawer) return panel;

  // Kept mounted so it can slide in and out. While closed it is inert: hidden from taps,
  // focus and screen readers.
  return (
    <div
      className={styles.toolsDrawerLayer}
      data-testid="tools-drawer-layer"
      data-open={open ? 'true' : undefined}
      inert={!open}
    >
      <div
        className={styles.toolsDrawerBackdrop}
        data-testid="tools-drawer-backdrop"
        onClick={onClose}
      />
      {panel}
    </div>
  );
};
