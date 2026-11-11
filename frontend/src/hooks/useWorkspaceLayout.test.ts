// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useWorkspaceLayout,
  type WorkspaceLayoutOptions,
} from './useWorkspaceLayout';

const GAME: WorkspaceLayoutOptions = {
  viewMode: 'sandbox',
  activeGameId: 'proto_1901',
  isCompact: true,
};

function renderLayout(initial: WorkspaceLayoutOptions = GAME) {
  return renderHook(
    (props: WorkspaceLayoutOptions) => useWorkspaceLayout(props),
    {
      initialProps: initial,
    },
  );
}

describe('useWorkspaceLayout: desktop rails', () => {
  it('starts with both sidebars open', () => {
    const { result } = renderLayout();
    expect(result.current.leftSidebarCollapsed).toBe(false);
    expect(result.current.rightSidebarCollapsed).toBe(false);
  });

  it('collapses each rail on its own', () => {
    const { result } = renderLayout();
    act(() => result.current.setLeftSidebarCollapsed((prev) => !prev));
    expect(result.current.leftSidebarCollapsed).toBe(true);
    expect(result.current.rightSidebarCollapsed).toBe(false);
    act(() => result.current.setRightSidebarCollapsed((prev) => !prev));
    expect(result.current.rightSidebarCollapsed).toBe(true);
  });

  it('keeps the rails as they were across games', () => {
    const { result, rerender } = renderLayout({ ...GAME, isCompact: false });
    act(() => result.current.setLeftSidebarCollapsed(true));
    rerender({ ...GAME, isCompact: false, activeGameId: 'game_2' });
    expect(result.current.leftSidebarCollapsed).toBe(true);
  });
});

describe('useWorkspaceLayout: phone sheet and drawer', () => {
  it('starts with the sheet lowered and the drawer shut', () => {
    const { result } = renderLayout();
    expect(result.current.sheetSnap).toBe('peek');
    expect(result.current.toolsDrawerOpen).toBe(false);
  });

  it('paints its first frame with the sheet lowered, before any effect runs', () => {
    const firstSnaps: string[] = [];
    renderHook(() => {
      const layout = useWorkspaceLayout(GAME);
      firstSnaps.push(layout.sheetSnap);
      return layout;
    });
    expect(firstSnaps[0]).toBe('peek');
  });

  it('drops the sheet to its peek when the docked unit bar shows', () => {
    const { result } = renderLayout();
    act(() => result.current.setSheetSnap('full'));
    act(() => result.current.handleDockedBarChange(false));
    expect(result.current.sheetSnap).toBe('full');
    act(() => result.current.handleDockedBarChange(true));
    expect(result.current.sheetSnap).toBe('peek');
  });

  it('closes the drawer and hands focus back to its toggle', () => {
    const { result } = renderLayout();
    const toggle = document.createElement('button');
    document.body.append(toggle);
    result.current.toolsToggleRef.current = toggle;

    act(() => result.current.setToolsDrawerOpen(true));
    expect(result.current.toolsDrawerOpen).toBe(true);
    act(() => result.current.closeToolsDrawer());
    expect(result.current.toolsDrawerOpen).toBe(false);
    expect(document.activeElement).toBe(toggle);
    toggle.remove();
  });

  it('closes the drawer without a toggle to focus', () => {
    const { result } = renderLayout();
    act(() => result.current.setToolsDrawerOpen(true));
    act(() => result.current.closeToolsDrawer());
    expect(result.current.toolsDrawerOpen).toBe(false);
  });

  it('keeps its handlers stable across renders', () => {
    const { result, rerender } = renderLayout();
    const { handleDockedBarChange, closeToolsDrawer } = result.current;
    rerender({ ...GAME, activeGameId: 'game_2' });
    expect(result.current.handleDockedBarChange).toBe(handleDockedBarChange);
    expect(result.current.closeToolsDrawer).toBe(closeToolsDrawer);
  });

  it.each<[string, Partial<WorkspaceLayoutOptions>]>([
    ['the view changes', { viewMode: 'multiplayer' }],
    ['the game changes', { activeGameId: 'game_2' }],
    ['the layout changes', { isCompact: false }],
  ])('lowers the sheet and shuts the drawer when %s', (_label, change) => {
    const { result, rerender } = renderLayout();
    act(() => {
      result.current.setSheetSnap('full');
      result.current.setToolsDrawerOpen(true);
    });
    rerender({ ...GAME, ...change });
    expect(result.current.sheetSnap).toBe('peek');
    expect(result.current.toolsDrawerOpen).toBe(false);
  });

  it('leaves the sheet and drawer alone on a render with nothing changed', () => {
    const { result, rerender } = renderLayout();
    act(() => {
      result.current.setSheetSnap('full');
      result.current.setToolsDrawerOpen(true);
    });
    rerender({ ...GAME });
    expect(result.current.sheetSnap).toBe('full');
    expect(result.current.toolsDrawerOpen).toBe(true);
  });
});
