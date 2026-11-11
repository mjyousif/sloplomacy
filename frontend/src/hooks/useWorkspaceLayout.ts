import { useCallback, useEffect, useRef, useState } from 'react';
import type { SheetSnap } from '../utils/sheetHelpers';

export interface WorkspaceLayoutOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId: string;
  /** From `useCompactLayout()`: true on a phone. */
  isCompact: boolean;
}

/**
 * How the game screen is laid out around the map: the desktop sidebars' rails, and on a
 * phone the order sheet's snap and the tools drawer.
 */
export function useWorkspaceLayout({
  viewMode,
  activeGameId,
  isCompact,
}: WorkspaceLayoutOptions) {
  // The desktop sidebars' rails. Phones have no rails: orders live in a sheet and tools in a drawer.
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] =
    useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] =
    useState<boolean>(false);
  // The phone order sheet starts lowered, so the map gets as much room as it can.
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');
  const [toolsDrawerOpen, setToolsDrawerOpen] = useState<boolean>(false);
  const toolsToggleRef = useRef<HTMLButtonElement | null>(null);
  // While the map's docked unit bar is up, the sheet drops to its peek so the bar and the
  // provinces to tap stay in view.
  const handleDockedBarChange = useCallback((visible: boolean) => {
    if (visible) setSheetSnap('peek');
  }, []);
  const closeToolsDrawer = useCallback(() => {
    setToolsDrawerOpen(false);
    toolsToggleRef.current?.focus();
  }, []);

  // Every visit to a game starts with the sheet lowered and the drawer shut, and leaving the
  // phone layout (rotating a tablet, widening a window) shuts the drawer too.
  useEffect(() => {
    setSheetSnap('peek');
    setToolsDrawerOpen(false);
  }, [viewMode, activeGameId, isCompact]);

  return {
    leftSidebarCollapsed,
    setLeftSidebarCollapsed,
    rightSidebarCollapsed,
    setRightSidebarCollapsed,
    sheetSnap,
    setSheetSnap,
    toolsDrawerOpen,
    setToolsDrawerOpen,
    toolsToggleRef,
    handleDockedBarChange,
    closeToolsDrawer,
  };
}
