// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAnimationFrames,
  makeMapSvg,
  nextFrame,
  PHONE_BOX,
  readTransform,
} from '../../../test/mapDom';
import type { Power } from '../../../types/diplomacy';
import {
  COMPACT_MAX_ZOOM,
  DEFAULT_CAMERA,
  elementPointToViewBox,
  getPhoneDefaultCamera,
  getViewportFit,
  MAP_CENTER_X,
  MAP_CENTER_Y,
  MAX_ZOOM,
  zoomAtPoint,
} from '../../../utils/mapCameraHelpers';
import {
  type UseMapCameraOptions,
  useKeepSelectionInView,
  useMapCamera,
} from './useMapCamera';

const PARIS = { x: 560, y: 760 };
const MOSCOW = { x: 1210, y: 330 };

function setup(
  overrides: Partial<UseMapCameraOptions> = {},
  box = makeMapSvg(),
) {
  const onZoomChange = vi.fn();
  const onCameraSync = vi.fn();
  const initialProps: UseMapCameraOptions = {
    svgRef: box.svgRef,
    cameraGroupRef: box.cameraGroupRef,
    compact: false,
    activePower: 'FRANCE',
    ownUnitsCentre: PARIS,
    onZoomChange,
    onCameraSync,
    ...overrides,
  };
  const hook = renderHook((props: UseMapCameraOptions) => useMapCamera(props), {
    initialProps,
  });
  return { ...box, ...hook, onZoomChange, onCameraSync, initialProps };
}

beforeEach(() => {
  fakeAnimationFrames();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useMapCamera', () => {
  it('starts on the default camera, untouched, and tells App its zoom', () => {
    const { result, group, onZoomChange } = setup();
    expect(result.current.cameraRef.current).toEqual(DEFAULT_CAMERA);
    // The wide layout's first render already draws DEFAULT_CAMERA, so nothing is rewritten.
    expect(readTransform(group)).toBeNull();
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(105);
  });

  it('zooms about the middle of the view and reports each new figure once', () => {
    const { result, group, onZoomChange, onCameraSync } = setup();
    onZoomChange.mockClear();

    act(() => result.current.stepZoom(0.2));
    const expected = zoomAtPoint(
      DEFAULT_CAMERA,
      { x: MAP_CENTER_X, y: MAP_CENTER_Y },
      1.25,
    );
    expect(readTransform(group)).toEqual(expected);
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(125);
    // The floating menu is placed in screen space, so it follows every camera write.
    expect(onCameraSync).toHaveBeenCalledTimes(1);

    act(() => result.current.stepZoom(0.001));
    expect(onZoomChange).toHaveBeenCalledTimes(1);
  });

  it('caps the zoom, higher on a phone', () => {
    const wide = setup();
    act(() => wide.result.current.stepZoom(20));
    expect(wide.result.current.cameraRef.current.zoom).toBe(MAX_ZOOM);

    const phone = setup({ compact: true }, makeMapSvg(PHONE_BOX));
    act(() => phone.result.current.stepZoom(20));
    expect(phone.result.current.cameraRef.current.zoom).toBe(COMPACT_MAX_ZOOM);
  });

  it('zooms toward the cursor on the wheel and draws once per frame', () => {
    const { result, svg, group, onZoomChange } = setup();
    onZoomChange.mockClear();
    const wheel = (deltaY: number) => {
      const e = new WheelEvent('wheel', {
        deltaY,
        clientX: 310,
        clientY: 420,
        cancelable: true,
      });
      svg.dispatchEvent(e);
      return e;
    };

    expect(wheel(-200).defaultPrevented).toBe(true);
    wheel(-200);
    // Nothing is drawn until the frame, and then once.
    expect(readTransform(group)).toBeNull();
    act(nextFrame);

    const cursor = elementPointToViewBox({ x: 300, y: 400 }, 980, 860);
    const once = zoomAtPoint(
      DEFAULT_CAMERA,
      cursor,
      Number((1.05 * Math.exp(0.28)).toFixed(3)),
    );
    const twice = zoomAtPoint(
      once,
      cursor,
      Number((once.zoom * Math.exp(0.28)).toFixed(3)),
    );
    expect(readTransform(group)).toEqual(twice);
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(
      Math.round(twice.zoom * 100),
    );
    expect(result.current.cameraRef.current).toEqual(twice);
  });

  it('holds the zoom report while a pinch is in progress', () => {
    const { result, onZoomChange } = setup();
    onZoomChange.mockClear();
    result.current.pinchingRef.current = true;
    act(() => {
      result.current.cameraRef.current = { ...DEFAULT_CAMERA, zoom: 2 };
      result.current.scheduleCameraSync();
    });
    act(nextFrame);
    expect(onZoomChange).not.toHaveBeenCalled();

    result.current.pinchingRef.current = false;
    act(() => result.current.reportZoom());
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(200);
  });

  it('turns client coordinates into board coordinates across the letterbox', () => {
    const { result } = setup();
    expect(result.current.clientToViewBox({ x: 510, y: 450 })).toEqual(
      elementPointToViewBox({ x: 500, y: 430 }, 980, 860),
    );
  });

  it('goes home to the default camera on a wide screen', () => {
    const { result } = setup();
    act(() => result.current.stepZoom(0.6));
    act(() => result.current.resetCamera());
    expect(result.current.cameraRef.current).toEqual(DEFAULT_CAMERA);
  });

  it("starts a phone around the player's own units, and follows a change of power", () => {
    const { result, group, rerender, initialProps } = setup(
      {},
      makeMapSvg(PHONE_BOX),
    );
    const phoneHome = (centre: typeof PARIS) =>
      getPhoneDefaultCamera(PHONE_BOX.width, PHONE_BOX.height, centre, {
        maxZoom: COMPACT_MAX_ZOOM,
      });

    rerender({ ...initialProps, compact: true });
    expect(readTransform(group)).toEqual(phoneHome(PARIS));

    rerender({
      ...initialProps,
      compact: true,
      activePower: 'RUSSIA' as Power,
      ownUnitsCentre: MOSCOW,
    });
    expect(result.current.cameraRef.current).toEqual(phoneHome(MOSCOW));

    // Back on a wide screen, the camera goes back to the default.
    rerender({ ...initialProps });
    expect(result.current.cameraRef.current).toEqual(DEFAULT_CAMERA);
  });

  it("doesn't move the camera when the phone re-renders for the same power", () => {
    const { result, rerender, initialProps } = setup(
      { compact: true },
      makeMapSvg(PHONE_BOX),
    );
    act(() => result.current.stepZoom(0.5));
    const zoomed = result.current.cameraRef.current;
    rerender({ ...initialProps, compact: true, ownUnitsCentre: MOSCOW });
    expect(result.current.cameraRef.current).toBe(zoomed);
  });

  it("sizes a phone's tap targets once the zoom has settled", () => {
    const { result } = setup({ compact: true }, makeMapSvg(PHONE_BOX));
    const scale = getViewportFit(PHONE_BOX.width, PHONE_BOX.height).scale;
    act(() => vi.advanceTimersByTime(150));
    const settled = result.current.touchPxPerUnit;
    expect(settled).toBeCloseTo(scale * result.current.cameraRef.current.zoom);

    act(() => result.current.stepZoom(1));
    act(() => vi.advanceTimersByTime(149));
    expect(result.current.touchPxPerUnit).toBe(settled);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.touchPxPerUnit).toBeCloseTo(
      scale * result.current.cameraRef.current.zoom,
    );
  });

  it('leaves tap targets alone on a wide screen', () => {
    const { result } = setup();
    act(() => result.current.stepZoom(1));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.touchPxPerUnit).toBe(0);
  });
});

describe('useKeepSelectionInView', () => {
  interface Props {
    compact: boolean;
    anchor: { x: number; y: number } | null;
    selectedUnitId: string | null;
  }

  function setupSelection(barHeight: number) {
    const box = makeMapSvg(PHONE_BOX);
    const container = document.createElement('div');
    container.style.setProperty('--docked-bar-h', `${barHeight}px`);
    const containerRef = { current: container as HTMLDivElement | null };
    const hook = renderHook(
      ({ compact, anchor, selectedUnitId }: Props) => {
        const camera = useMapCamera({
          svgRef: box.svgRef,
          cameraGroupRef: box.cameraGroupRef,
          compact,
          activePower: 'FRANCE',
          ownUnitsCentre: PARIS,
          onCameraSync: () => {},
        });
        useKeepSelectionInView(camera, {
          svgRef: box.svgRef,
          containerRef,
          compact,
          anchor,
          selectedUnitId,
          selectedBuildProv: null,
        });
        return camera;
      },
      {
        initialProps: {
          compact: true,
          anchor: null,
          selectedUnitId: null,
        } as Props,
      },
    );
    return { ...box, ...hook };
  }

  /** Where a board point lands on the phone's map, in pixels from its top-left corner. */
  function onScreen(
    camera: { x: number; y: number; zoom: number },
    pt: { x: number; y: number },
  ) {
    const { scale, offsetX, offsetY } = getViewportFit(
      PHONE_BOX.width,
      PHONE_BOX.height,
    );
    return {
      x:
        offsetX +
        (MAP_CENTER_X + (pt.x - MAP_CENTER_X) * camera.zoom + camera.x) * scale,
      y:
        offsetY +
        (MAP_CENTER_Y + (pt.y - MAP_CENTER_Y) * camera.zoom + camera.y) * scale,
    };
  }

  it('pans a unit selected off screen into the part of the map the docked bar leaves free', () => {
    const { result, rerender } = setupSelection(120);
    const before = result.current.cameraRef.current;
    expect(onScreen(before, MOSCOW).x).toBeGreaterThan(PHONE_BOX.width);

    rerender({ compact: true, anchor: MOSCOW, selectedUnitId: 'RUS_A_MOS' });
    const pt = onScreen(result.current.cameraRef.current, MOSCOW);
    expect(pt.x).toBeGreaterThanOrEqual(80);
    expect(pt.x).toBeLessThanOrEqual(PHONE_BOX.width - 80);
    expect(pt.y).toBeGreaterThanOrEqual(80);
    expect(pt.y).toBeLessThanOrEqual(PHONE_BOX.height - 120 - 80);
  });

  it('lifts a unit hidden behind the docked bar clear of it', () => {
    const { result, rerender } = setupSelection(120);
    const camera = result.current.cameraRef.current;
    // The board point 90px above the phone map's bottom edge: under the 120px bar, though
    // inside the margin of a map with no bar at all.
    const { scale, offsetX, offsetY } = getViewportFit(
      PHONE_BOX.width,
      PHONE_BOX.height,
    );
    const toBoard = (
      screen: number,
      offset: number,
      centre: number,
      pan: number,
    ) => ((screen - offset) / scale - pan - centre) / camera.zoom + centre;
    const hidden = {
      x: toBoard(PHONE_BOX.width / 2, offsetX, MAP_CENTER_X, camera.x),
      y: toBoard(PHONE_BOX.height - 90, offsetY, MAP_CENTER_Y, camera.y),
    };

    rerender({ compact: true, anchor: hidden, selectedUnitId: 'FRA_F_BRE' });
    // Toward the middle of the free map, as far as the camera's bounds allow.
    const pt = onScreen(result.current.cameraRef.current, hidden);
    expect(pt.y).toBeLessThanOrEqual(PHONE_BOX.height - 120 - 80);
  });

  it('leaves the camera alone for a unit already in view, and after the player pans away', () => {
    const { result, rerender } = setupSelection(120);
    const home = result.current.cameraRef.current;
    rerender({ compact: true, anchor: PARIS, selectedUnitId: 'FRA_A_PAR' });
    expect(result.current.cameraRef.current).toBe(home);

    // The same selection re-rendered does not pull the camera back.
    const panned = { ...home, x: home.x - 900 };
    result.current.cameraRef.current = panned;
    rerender({ compact: true, anchor: PARIS, selectedUnitId: 'FRA_A_PAR' });
    expect(result.current.cameraRef.current).toBe(panned);
  });

  it('never pans on a wide screen', () => {
    const { result, rerender } = setupSelection(0);
    rerender({ compact: false, anchor: null, selectedUnitId: null });
    const wide = result.current.cameraRef.current;
    rerender({ compact: false, anchor: MOSCOW, selectedUnitId: 'RUS_A_MOS' });
    expect(result.current.cameraRef.current).toBe(wide);
  });
});
