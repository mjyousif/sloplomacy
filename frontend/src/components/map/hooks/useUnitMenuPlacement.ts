import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import type { Point } from '../../../data/europeMapGeometry';
import type { Unit } from '../../../types/diplomacy';
import type { CameraState } from '../../../utils/mapCameraHelpers';
import type { PendingCoastChoice } from './useMapInteraction';

/** How far the docked unit bar sits above the bottom of the map (`.unit-docked-bar` in compact.css). */
const DOCKED_BAR_INSET = 8;

export interface UseUnitMenuPlacementOptions {
  compact: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cameraRef: React.RefObject<CameraState>;
  scheduleCameraSync: () => void;
  selectedUnitId: string | null;
  selectedUnit: Unit | null;
  selectedBuildProv: string | null;
  inspectedProvince?: string | null;
  /** The selected unit's destinations, which the floating menu keeps clear of. */
  reachableList: { province: string; coasts: string[] }[];
  pendingCoastChoice: PendingCoastChoice | null;
  getUnitPoint: (unit: Unit) => Point;
  getProvincePoint: (provCode: string, coast?: string | null) => Point;
  onDockedBarChange?: (visible: boolean) => void;
}

export interface UnitMenuPlacement {
  /** Docks a menu (or the coast picker) as the phone's bar, and puts its space on the map. */
  dockRef: (el: HTMLDivElement | null) => void;
  /** The unit or build menu's ref: the dock on a phone, the floating menu otherwise. */
  menuRef: React.Ref<HTMLDivElement>;
  menuClassName: string;
  floatingStyle: { left: number; top: number } | undefined;
  /** Spread on the menu header. Only the floating menu can be dragged. */
  dragHeaderProps: React.HTMLAttributes<HTMLDivElement> & { title?: string };
  showBuildMenu: boolean;
  showUnitMenu: boolean;
  /** Moves the floating menu with the camera. The camera calls it on every write. */
  syncFloatingMenu: () => void;
}

/**
 * Where the selected unit's menu goes. On a wide screen it floats beside the unit, away from
 * the provinces it can reach, follows the camera and can be dragged by its header. On a phone
 * the menu, the build menu and the coast picker dock as one bar at the bottom of the map.
 */
export function useUnitMenuPlacement({
  compact,
  containerRef,
  cameraRef,
  scheduleCameraSync,
  selectedUnitId,
  selectedUnit,
  selectedBuildProv,
  inspectedProvince = null,
  reachableList,
  pendingCoastChoice,
  getUnitPoint,
  getProvincePoint,
  onDockedBarChange,
}: UseUnitMenuPlacementOptions): UnitMenuPlacement {
  const floatingMenuRef = useRef<HTMLDivElement | null>(null);

  // On a phone the unit menu, build menu and coast picker dock as one bar at the bottom of the
  // map instead of floating beside the unit. The space the bar takes (its height plus the 8px
  // it sits above the map's edge, see compact.css) goes on the map as --docked-bar-h, so the
  // zoom buttons can sit above it.
  const dockObserverRef = useRef<ResizeObserver | null>(null);
  const dockRef = useCallback(
    (el: HTMLDivElement | null) => {
      dockObserverRef.current?.disconnect();
      dockObserverRef.current = null;
      const container = containerRef.current;
      if (!el) {
        container?.style.removeProperty('--docked-bar-h');
        return;
      }
      const apply = () =>
        container?.style.setProperty(
          '--docked-bar-h',
          `${Math.ceil(el.getBoundingClientRect().height) + DOCKED_BAR_INSET}px`,
        );
      apply();
      if (typeof ResizeObserver === 'undefined') return;
      dockObserverRef.current = new ResizeObserver(apply);
      dockObserverRef.current.observe(el);
    },
    [containerRef],
  );

  // Draggable Floating Menu State (also updated via ref during drag)
  const menuDragOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const menuDragStartRef = useRef<Point>({ x: 0, y: 0 });

  // Reset the menu drag offset whenever a different unit or province is selected: during render, not in
  // an effect, which would run after the new menu was placed with the old offset.
  const targetKey = inspectedProvince || selectedUnitId;
  const offsetUnitRef = useRef(targetKey);
  if (offsetUnitRef.current !== targetKey) {
    offsetUnitRef.current = targetKey;
    menuDragOffsetRef.current = { x: 0, y: 0 };
  }

  // Convert SVG (1524x1357) point to container screen coordinates using current cameraRef
  const svgPointToScreen = useCallback(
    (pt: Point, W: number, H: number): Point => {
      const { x: panX, y: panY, zoom: z } = cameraRef.current;
      const svgX = 762 + (pt.x - 762) * z + panX;
      const svgY = 678 + (pt.y - 678) * z + panY;
      const scale = Math.min(W / 1524, H / 1357);
      const offsetX = (W - 1524 * scale) / 2;
      const offsetY = (H - 1357 * scale) / 2;
      return {
        x: offsetX + svgX * scale,
        y: offsetY + svgY * scale,
      };
    },
    [cameraRef],
  );

  // Smart placement for the floating menu
  const getSelectedUnitFloatingPosition = useCallback((): {
    left: number;
    top: number;
    anchorLeft: number;
    anchorTop: number;
  } | null => {
    const anchorPt = selectedUnit
      ? getUnitPoint(selectedUnit)
      : inspectedProvince
        ? getProvincePoint(inspectedProvince)
        : selectedBuildProv
          ? getProvincePoint(selectedBuildProv)
          : null;
    if (!anchorPt) return null;

    const W = containerRef.current?.clientWidth || 980;
    const H = containerRef.current?.clientHeight || 860;
    const unitScreen = svgPointToScreen(anchorPt, W, H);
    const neighborScreens = reachableList.map((r) =>
      svgPointToScreen(getProvincePoint(r.province), W, H),
    );

    const menuW = 256;
    const menuH = 98;

    const candidates: Point[] = [
      { x: unitScreen.x - menuW / 2, y: unitScreen.y - menuH - 95 }, // Above
      { x: unitScreen.x - menuW / 2, y: unitScreen.y + 95 }, // Below
      { x: unitScreen.x - menuW - 95, y: unitScreen.y - menuH / 2 }, // Left
      { x: unitScreen.x + 95, y: unitScreen.y - menuH / 2 }, // Right
      { x: unitScreen.x - menuW - 75, y: unitScreen.y - menuH - 75 }, // Top-Left
      { x: unitScreen.x + 75, y: unitScreen.y - menuH - 75 }, // Top-Right
      { x: unitScreen.x - menuW - 75, y: unitScreen.y + 75 }, // Bottom-Left
      { x: unitScreen.x + 75, y: unitScreen.y + 75 }, // Bottom-Right
    ];

    let bestCandidate = candidates[0];
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const clampedX = Math.max(14, Math.min(W - menuW - 14, cand.x));
      const clampedY = Math.max(64, Math.min(H - menuH - 14, cand.y));
      const centerX = clampedX + menuW / 2;
      const centerY = clampedY + menuH / 2;

      let minNeighborDist = 9999;
      for (const ns of neighborScreens) {
        const d = Math.hypot(centerX - ns.x, centerY - ns.y);
        if (d < minNeighborDist) minNeighborDist = d;
      }
      const distToUnit = Math.hypot(
        centerX - unitScreen.x,
        centerY - unitScreen.y,
      );
      const score = Math.min(minNeighborDist, distToUnit);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = { x: clampedX, y: clampedY };
      }
    }

    return {
      left: Math.max(
        10,
        Math.min(W - menuW - 10, bestCandidate.x + menuDragOffsetRef.current.x),
      ),
      top: Math.max(
        10,
        Math.min(H - menuH - 10, bestCandidate.y + menuDragOffsetRef.current.y),
      ),
      anchorLeft: bestCandidate.x,
      anchorTop: bestCandidate.y,
    };
  }, [
    selectedUnit,
    inspectedProvince,
    selectedBuildProv,
    reachableList,
    svgPointToScreen,
    getUnitPoint,
    getProvincePoint,
    containerRef,
  ]);

  // The floating menu sits in screen space, so it follows every camera write.
  const syncFloatingMenu = () => {
    if (floatingMenuRef.current) {
      const pos = getSelectedUnitFloatingPosition();
      if (pos) {
        floatingMenuRef.current.style.left = `${pos.left}px`;
        floatingMenuRef.current.style.top = `${pos.top}px`;
      }
    }
  };

  // The cursor stays over the menu during a drag, so the map's own handlers never see it.
  // Capturing the pointer sends every move and the release to the header instead, wherever
  // the cursor goes. A capture also takes the click, so buttons in the header must not start one.
  const handleMenuDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    const pos = getSelectedUnitFloatingPosition();
    if (pos) {
      // Start from where the menu is, since an earlier drag may have run past the map edge
      menuDragOffsetRef.current = {
        x: pos.left - pos.anchorLeft,
        y: pos.top - pos.anchorTop,
      };
    }
    menuDragStartRef.current = {
      x: e.clientX - menuDragOffsetRef.current.x,
      y: e.clientY - menuDragOffsetRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    floatingMenuRef.current?.classList.add('dragging');
  };

  const handleMenuDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    menuDragOffsetRef.current = {
      x: e.clientX - menuDragStartRef.current.x,
      y: e.clientY - menuDragStartRef.current.y,
    };
    scheduleCameraSync();
  };

  const handleMenuDragEnd = () => {
    floatingMenuRef.current?.classList.remove('dragging');
  };

  // Phones dock the menus instead, so they skip the placement math.
  const floatingPos = compact ? null : getSelectedUnitFloatingPosition();
  const floatingStyle = floatingPos
    ? { left: floatingPos.left, top: floatingPos.top }
    : undefined;
  const menuRef = compact ? dockRef : floatingMenuRef;
  const menuClassName = compact
    ? 'unit-floating-menu unit-docked-bar'
    : 'unit-floating-menu';
  // Only the floating menu can be dragged. A docked bar stays put.
  const dragHeaderProps = compact
    ? {}
    : {
        title: 'Drag to move this menu anywhere',
        onPointerDown: handleMenuDragStart,
        onPointerMove: handleMenuDragMove,
        onLostPointerCapture: handleMenuDragEnd,
      };
  const showBuildMenu = Boolean(
    !inspectedProvince &&
      selectedBuildProv &&
      selectedUnitId &&
      (compact || floatingPos),
  );
  // A phone shows the coast picker in the bar's place while it is open.
  const showUnitMenu = Boolean(
    !inspectedProvince &&
      selectedUnit &&
      (compact ? !pendingCoastChoice : floatingPos),
  );
  const dockedBarVisible =
    compact &&
    (showBuildMenu ||
      Boolean(!inspectedProvince && selectedUnit) ||
      Boolean(pendingCoastChoice));

  const onDockedBarChangeRef = useRef(onDockedBarChange);
  onDockedBarChangeRef.current = onDockedBarChange;
  useEffect(() => {
    if (compact) onDockedBarChangeRef.current?.(dockedBarVisible);
  }, [compact, dockedBarVisible]);

  return {
    dockRef,
    menuRef,
    menuClassName,
    floatingStyle,
    dragHeaderProps,
    showBuildMenu,
    showUnitMenu,
    syncFloatingMenu,
  };
}
