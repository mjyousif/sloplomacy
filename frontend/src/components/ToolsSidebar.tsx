import { MessagesSquare, PanelLeftClose, Sliders, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { cx } from '../utils/cx';
import styles from './ToolsSidebar.module.css';
import { CollapsedRail } from './tools/CollapsedRail';
import { MapControlsSection } from './tools/MapControlsSection';
import { PressSection } from './tools/PressSection';
import {
  PressUnreadBadge,
  pressBadgeAnchor,
} from './tools/press/PressUnreadBadge';
import { SandboxToolsSection } from './tools/SandboxToolsSection';
import { StandingsSection } from './tools/StandingsSection';
import type { ToolsSidebarProps } from './tools/toolsSidebarProps';
import { Button } from './ui/Button';
import scrollbarStyles from './ui/Scrollbars.module.css';
import chromeStyles from './ui/SidebarChrome.module.css';

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
  showAllMoves,
  onChangeShowAllMoves,
  sandboxMode,
  viewingHistory = false,
  onToggleSandboxMode,
  onClearForeignPreMoves,
  foreignModifiedOrdersCount,
  adminOverrideActive = false,
  variant = 'panel',
  open = false,
  onClose,
  press,
  onOpenPress,
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
          <h3>CHANCELLERY TOOLS</h3>
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

      <div className={cx(styles.toolsSidebarContent, scrollbarStyles.thin)}>
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

        {/* 3. GREAT POWERS STANDING & SELECTION */}
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
          showAllMoves={showAllMoves}
          onChangeShowAllMoves={onChangeShowAllMoves}
          sandboxMode={sandboxMode}
          viewingHistory={viewingHistory}
          adminOverrideActive={adminOverrideActive}
          pressPower={
            press && !press.surrendered ? (press.power ?? undefined) : undefined
          }
          onPressPick={isDrawer ? onOpenPress : undefined}
        />

        {/* 5. PRESS: full panel on desktop, dedicated full-width launcher in phone drawer */}
        {press &&
          (isDrawer && onOpenPress ? (
            <div className={styles.drawerOpenPressSection}>
              <Button
                variant="secondary"
                fullWidth
                className={cx(styles.drawerOpenPressBtn, pressBadgeAnchor)}
                data-testid="drawer-open-press-btn"
                onClick={onOpenPress}
              >
                <MessagesSquare size={15} aria-hidden="true" />
                <span>Open Press &amp; Diplomacy</span>
                <PressUnreadBadge />
              </Button>
            </div>
          ) : (
            <PressSection {...press} visible={!isDrawer || open} />
          ))}

        {/* 6. HYPOTHETICAL MODE & PRE-MOVES */}
        {onToggleSandboxMode && (
          <SandboxToolsSection
            sandboxMode={sandboxMode}
            onToggleSandboxMode={onToggleSandboxMode}
            onClearForeignPreMoves={onClearForeignPreMoves}
            foreignModifiedOrdersCount={foreignModifiedOrdersCount}
          />
        )}
      </div>
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
