import { MessagesSquare, PanelLeftClose, Sliders, X } from 'lucide-react';
import type React from 'react';
import { useRef } from 'react';
import { useOverlayFocusEscape } from '../hooks/useOverlayFocusEscape';
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
  const isCollapsedPanel = collapsed && !isDrawer;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useOverlayFocusEscape({
    open: isDrawer && open,
    focusRef: closeButtonRef,
    onClose,
  });

  // One <aside> stays mounted across collapsed/expanded panel states so the width transition plays.
  const panel = (
    <aside
      className={cx(
        chromeStyles.sidebarShell,
        styles.toolsSidebar,
        isDrawer && styles.toolsDrawer,
      )}
      data-side="left"
      data-collapsed={isCollapsedPanel ? 'true' : undefined}
      data-expanded={!isCollapsedPanel ? 'true' : undefined}
      aria-label={
        isCollapsedPanel
          ? 'Tools Sidebar Collapsed'
          : 'Chancellery Tools & Intel'
      }
      data-testid={
        isDrawer
          ? 'tools-drawer'
          : isCollapsedPanel
            ? 'tools-sidebar-collapsed'
            : 'tools-sidebar'
      }
      data-drawer={isDrawer ? 'true' : undefined}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer ? true : undefined}
    >
      {isCollapsedPanel ? (
        <CollapsedRail
          onToggleCollapse={onToggleCollapse}
          zoomPercent={zoomPercent}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetCamera={onResetCamera}
          sandboxMode={sandboxMode}
          onToggleSandboxMode={onToggleSandboxMode}
        />
      ) : (
        <>
          {/* 1. SIDEBAR HEADER */}
          <div className={chromeStyles.panelHeader}>
            <div className={chromeStyles.panelHeaderTitle}>
              <Sliders size={16} className={chromeStyles.panelHeaderIcon} />
              <h3>CHANCELLERY TOOLS</h3>
            </div>
            {isDrawer ? (
              <button
                ref={closeButtonRef}
                type="button"
                data-testid="tools-drawer-close-btn"
                className={cx(
                  chromeStyles.sidebarCollapseToggleBtn,
                  chromeStyles.panelCloseBtn,
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
                press && !press.surrendered
                  ? (press.power ?? undefined)
                  : undefined
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
        </>
      )}
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
