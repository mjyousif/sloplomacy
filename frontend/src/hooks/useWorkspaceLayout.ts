import { useCallback, useEffect, useRef, useState } from 'react';
import type { SheetSnap } from '../utils/sheetHelpers';

/** Below 1200px (narrow desktop / landscape tablet), start with Tools collapsed for map room. */
export const NARROW_DESKTOP_QUERY = '(max-width: 1199px)';
/** Below 960px (portrait tablet), start with both sidebars collapsed as rails. */
export const TABLET_COLLAPSED_QUERY = '(max-width: 959px)';

function getMediaQuery(query: string): MediaQueryList | null {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return null;
  }
  return window.matchMedia(query);
}

export interface WorkspaceLayoutOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId: string;
  /** From `useCompactLayout()`: true on a phone. */
  isCompact: boolean;
}

/**
 * How the game screen is laid out around the map: the desktop sidebars' rails (defaulting to
 * collapsed on mid-width / tablet viewports so the map stays unobstructed), and on a phone the
 * order sheet's snap and the tools drawer.
 */
export function useWorkspaceLayout({
  viewMode,
  activeGameId,
  isCompact,
}: WorkspaceLayoutOptions) {
  // The desktop sidebars' rails. Phones have no rails: orders live in a sheet and tools in a drawer.
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState<boolean>(
    () => getMediaQuery(NARROW_DESKTOP_QUERY)?.matches ?? false,
  );
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(
    () => getMediaQuery(TABLET_COLLAPSED_QUERY)?.matches ?? false,
  );

  useEffect(() => {
    const narrowQuery = getMediaQuery(NARROW_DESKTOP_QUERY);
    const tabletQuery = getMediaQuery(TABLET_COLLAPSED_QUERY);
    const listen = (
      query: MediaQueryList | null,
      onChange: () => void,
    ): (() => void) => {
      if (!query) return () => {};
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', onChange);
        return () => query.removeEventListener('change', onChange);
      }
      query.addListener(onChange);
      return () => query.removeListener(onChange);
    };
    const offNarrow = listen(narrowQuery, () => {
      if (narrowQuery) setLeftSidebarCollapsed(narrowQuery.matches);
    });
    const offTablet = listen(tabletQuery, () => {
      if (tabletQuery) setRightSidebarCollapsed(tabletQuery.matches);
    });
    return () => {
      offNarrow();
      offTablet();
    };
  }, []);
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
