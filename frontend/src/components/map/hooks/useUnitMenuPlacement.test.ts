// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../../../data/europeMapGeometry';
import { unitAt } from '../../../test/mapFixtures';
import type { Unit } from '../../../types/diplomacy';
import {
  DEFAULT_CAMERA,
  getViewportFit,
} from '../../../utils/mapCameraHelpers';
import type { PendingCoastChoice } from './useMapInteraction';
import {
  type UseUnitMenuPlacementOptions,
  useUnitMenuPlacement,
} from './useUnitMenuPlacement';

const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_MAR = unitAt('FRANCE', 'A', 'MAR');
const POINTS: Record<string, Point> = {
  PAR: { x: 560, y: 760 },
  MAR: { x: 620, y: 1000 },
  BUR: { x: 640, y: 780 },
  GAS: { x: 480, y: 900 },
};
const getProvincePoint = (prov: string) => POINTS[prov];
const getUnitPoint = (u: Unit) => POINTS[u.province];

type Props = Partial<UseUnitMenuPlacementOptions>;

function setup(initial: Props = {}) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { value: 980 });
  Object.defineProperty(container, 'clientHeight', { value: 860 });
  document.body.appendChild(container);
  const containerRef = { current: container as HTMLDivElement | null };
  const cameraRef = { current: { ...DEFAULT_CAMERA } };
  const onDockedBarChange = vi.fn();
  // The camera draws on the next frame; here the menu follows at once.
  let sync = () => {};
  const scheduleCameraSync = vi.fn(() => sync());
  const base: UseUnitMenuPlacementOptions = {
    compact: false,
    containerRef,
    cameraRef,
    scheduleCameraSync,
    selectedUnitId: null,
    selectedUnit: null,
    selectedBuildProv: null,
    reachableList: [],
    pendingCoastChoice: null,
    getUnitPoint,
    getProvincePoint,
    onDockedBarChange,
    ...initial,
  };
  const hook = renderHook(
    (props: Props) => useUnitMenuPlacement({ ...base, ...props }),
    {
      initialProps: {},
    },
  );
  sync = () => hook.result.current.syncFloatingMenu();
  return { ...hook, container, cameraRef, onDockedBarChange, base };
}

const select = (u: Unit) => ({ selectedUnitId: u.id, selectedUnit: u });

/** A floating menu element, hooked up the way UnitMenu hooks it up. */
function mountMenu(menuRef: React.Ref<HTMLDivElement>) {
  const menu = document.createElement('div');
  const header = document.createElement('div');
  menu.appendChild(header);
  document.body.appendChild(menu);
  if (typeof menuRef === 'function') menuRef(menu);
  else if (menuRef)
    (menuRef as React.RefObject<HTMLDivElement | null>).current = menu;
  const captured = new Set<number>();
  header.setPointerCapture = (id) => captured.add(id);
  header.hasPointerCapture = (id) => captured.has(id);
  return { menu, header };
}

const pointerEvent = (header: HTMLElement, clientX: number, clientY: number) =>
  ({
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    target: header,
    currentTarget: header,
  }) as unknown as React.PointerEvent<HTMLDivElement>;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useUnitMenuPlacement on a wide screen', () => {
  it('floats the menu beside the selected unit, inside the map', () => {
    const { result, rerender } = setup();
    expect(result.current.floatingStyle).toBeUndefined();
    expect(result.current.showUnitMenu).toBe(false);

    rerender(select(A_PAR));
    const style = result.current.floatingStyle!;
    expect(style.left).toBeGreaterThanOrEqual(10);
    expect(style.left).toBeLessThanOrEqual(980 - 256 - 10);
    expect(style.top).toBeGreaterThanOrEqual(10);
    expect(style.top).toBeLessThanOrEqual(860 - 98 - 10);
    expect(result.current.showUnitMenu).toBe(true);
    expect(result.current.docked).toBe(false);
  });

  it('moves the menu off a province the unit can reach', () => {
    const { result, rerender } = setup(select(A_PAR));
    const alone = result.current.floatingStyle!;
    // A reachable province right under where the menu would open.
    const { scale, offsetX, offsetY } = getViewportFit(980, 860);
    const toBoard = (
      screen: number,
      offset: number,
      centre: number,
      pan: number,
    ) =>
      ((screen - offset) / scale - pan - centre) / DEFAULT_CAMERA.zoom + centre;
    POINTS.UNDER = {
      x: toBoard(alone.left + 128, offsetX, 762, DEFAULT_CAMERA.x),
      y: toBoard(alone.top + 49, offsetY, 678, DEFAULT_CAMERA.y),
    };
    rerender({
      ...select(A_PAR),
      reachableList: [{ province: 'UNDER', coasts: [] }],
    });
    expect(result.current.floatingStyle).not.toEqual(alone);
  });

  it('drags by its header, and opens the next unit where it belongs', () => {
    const { result, rerender } = setup(select(A_MAR));
    const marseillesHome = result.current.floatingStyle;
    rerender(select(A_PAR));
    const parisHome = result.current.floatingStyle!;

    const { menu, header } = mountMenu(result.current.menuRef);
    const drag = result.current.dragHeaderProps;
    expect(drag.title).toBe('Drag to move this menu anywhere');
    act(() => {
      drag.onPointerDown?.(pointerEvent(header, 200, 200));
      drag.onPointerMove?.(pointerEvent(header, 260, 230));
    });
    expect(menu).toHaveAttribute('data-dragging', 'true');
    // jsdom keeps four decimals of a length.
    expect(parseFloat(menu.style.left)).toBeCloseTo(parisHome.left + 60, 3);
    expect(parseFloat(menu.style.top)).toBeCloseTo(parisHome.top + 30, 3);
    act(() => drag.onLostPointerCapture?.(pointerEvent(header, 260, 230)));
    expect(menu).not.toHaveAttribute('data-dragging');

    rerender(select(A_MAR));
    expect(result.current.floatingStyle).toEqual(marseillesHome);
  });

  it("doesn't start a drag from a button in the header", () => {
    const { result } = setup(select(A_PAR));
    const { menu, header } = mountMenu(result.current.menuRef);
    const button = document.createElement('button');
    header.appendChild(button);
    act(() =>
      result.current.dragHeaderProps.onPointerDown?.({
        ...pointerEvent(header, 200, 200),
        target: button,
      } as unknown as React.PointerEvent<HTMLDivElement>),
    );
    expect(menu).not.toHaveAttribute('data-dragging');
  });

  it('follows the camera', () => {
    const { result, cameraRef } = setup(select(A_PAR));
    const { menu } = mountMenu(result.current.menuRef);
    act(() => result.current.syncFloatingMenu());
    const before = menu.style.left;
    cameraRef.current = { ...cameraRef.current, x: cameraRef.current.x - 200 };
    act(() => result.current.syncFloatingMenu());
    expect(menu.style.left).not.toBe(before);
  });

  it('shows no menu for a unit the sidebar picked, and the menu returns when the flag clears', () => {
    const { result, rerender } = setup({
      ...select(A_PAR),
      suppressUnitMenu: true,
    });
    expect(result.current.showUnitMenu).toBe(false);
    rerender({ suppressUnitMenu: false });
    expect(result.current.showUnitMenu).toBe(true);
  });

  it('never reports a docked bar', () => {
    const { rerender, onDockedBarChange } = setup();
    rerender(select(A_PAR));
    expect(onDockedBarChange).not.toHaveBeenCalled();
  });
});

describe('useUnitMenuPlacement on a phone', () => {
  it('docks instead of floating, with no drag header', () => {
    const { result } = setup({ compact: true, ...select(A_PAR) });
    expect(result.current.floatingStyle).toBeUndefined();
    expect(result.current.menuRef).toBe(result.current.dockRef);
    expect(result.current.docked).toBe(true);
    expect(result.current.dragHeaderProps).toEqual({});
  });

  it("puts the bar's height plus its inset on the map", () => {
    const { result, container } = setup({ compact: true, ...select(A_PAR) });
    const bar = document.createElement('div');
    bar.getBoundingClientRect = () => ({ height: 71.4 }) as DOMRect;
    act(() => result.current.dockRef(bar));
    expect(container.style.getPropertyValue('--docked-bar-h')).toBe('80px');
    act(() => result.current.dockRef(null));
    expect(container.style.getPropertyValue('--docked-bar-h')).toBe('');
  });

  it('tells App when the bar comes and goes', () => {
    const { rerender, onDockedBarChange } = setup({ compact: true });
    expect(onDockedBarChange).toHaveBeenLastCalledWith(false);
    rerender(select(A_PAR));
    expect(onDockedBarChange).toHaveBeenLastCalledWith(true);
    rerender({ selectedUnitId: null, selectedUnit: null });
    expect(onDockedBarChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps the docked bar for a unit the sidebar picked: the sheet hands its orders to the bar', () => {
    const { result, onDockedBarChange } = setup({
      compact: true,
      ...select(A_PAR),
      suppressUnitMenu: true,
    });
    expect(result.current.showUnitMenu).toBe(true);
    expect(onDockedBarChange).toHaveBeenLastCalledWith(true);
  });

  it('shows the coast picker in place of the unit menu', () => {
    const choice: PendingCoastChoice = { target: 'SPA', coasts: ['NC', 'SC'] };
    const { result } = setup({
      compact: true,
      ...select(A_PAR),
      pendingCoastChoice: choice,
    });
    expect(result.current.showUnitMenu).toBe(false);
  });

  it('shows a build menu for a selected build slot', () => {
    const { result } = setup({
      compact: true,
      selectedUnitId: 'BUILD_FRANCE_PAR',
      selectedBuildProv: 'PAR',
    });
    expect(result.current.showBuildMenu).toBe(true);
  });
});
