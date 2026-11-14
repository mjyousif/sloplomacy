// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAnimationFrames,
  makeMapSvg,
  nextFrame,
} from '../../../test/mapDom';
import {
  DEFAULT_CAMERA,
  getViewportFit,
} from '../../../utils/mapCameraHelpers';
import { useMapCamera } from './useMapCamera';
import { useMapGestures } from './useMapGestures';

type PointerInit = {
  pointerId?: number;
  pointerType?: string;
  button?: number;
  clientX?: number;
  clientY?: number;
};
const pointer = ({
  pointerId = 1,
  pointerType = 'mouse',
  button = 0,
  clientX = 0,
  clientY = 0,
}: PointerInit) =>
  ({
    pointerId,
    pointerType,
    button,
    clientX,
    clientY,
  }) as React.PointerEvent<SVGSVGElement>;

function setup() {
  const box = makeMapSvg();
  const onZoomChange = vi.fn();
  const hook = renderHook(() => {
    const camera = useMapCamera({
      svgRef: box.svgRef,
      cameraGroupRef: box.cameraGroupRef,
      compact: false,
      activePower: 'FRANCE',
      ownUnitsCentre: null,
      onZoomChange,
      onCameraSync: () => {},
    });
    return { camera, gestures: useMapGestures(box.svgRef, camera) };
  });
  const h = () => hook.result.current.gestures.pointerHandlers;
  const camera = () => hook.result.current.camera.cameraRef.current;
  const run = (fn: () => void) => act(fn);
  onZoomChange.mockClear();
  return { ...box, ...hook, h, camera, run, onZoomChange };
}

/** One board unit in screen pixels on the desktop map box. */
const SCALE = getViewportFit(980, 860).scale;

beforeEach(() => {
  fakeAnimationFrames();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useMapGestures', () => {
  it.each([
    ['mouse', 4],
    ['touch', 10],
  ])(
    'treats a %s press that moves at most %ipx as a tap',
    (pointerType, slop) => {
      const { h, camera, svg, run, result } = setup();
      run(() => {
        h().onPointerDown(pointer({ pointerType, clientX: 100, clientY: 100 }));
        h().onPointerMove(
          pointer({ pointerType, clientX: 100 + slop, clientY: 100 }),
        );
        nextFrame();
      });
      expect(result.current.gestures.dragMovedRef.current).toBe(false);
      expect(result.current.gestures.isPanningRef.current).toBe(true);
      expect(svg.dataset.mapPanning).toBe('true');
      expect(svg.dataset.mapDragging).toBeUndefined();
      expect(svg.setPointerCapture).not.toHaveBeenCalled();
      expect(camera()).toEqual(DEFAULT_CAMERA);

      run(() => h().onPointerUp(pointer({ pointerType })));
      expect(result.current.gestures.isPanningRef.current).toBe(false);
      expect(svg.dataset.mapPanning).toBeUndefined();
    },
  );

  it('pans by the distance dragged once the press passes the threshold', () => {
    const { h, camera, svg, run, result } = setup();
    run(() => {
      h().onPointerDown(pointer({ clientX: 100, clientY: 100 }));
      h().onPointerMove(pointer({ clientX: 110, clientY: 100 }));
      h().onPointerMove(pointer({ clientX: 140, clientY: 80 }));
      nextFrame();
    });
    // The first move crosses the threshold and pans from where the press began.
    expect(camera().x).toBeCloseTo(DEFAULT_CAMERA.x + 40 / SCALE);
    expect(camera().y).toBeCloseTo(DEFAULT_CAMERA.y - 20 / SCALE);
    expect(result.current.gestures.dragMovedRef.current).toBe(true);
    expect(svg.dataset.mapDragging).toBe('true');
    expect(svg.setPointerCapture).toHaveBeenCalledWith(1);

    run(() => h().onPointerUp(pointer({})));
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(svg.dataset.mapDragging).toBeUndefined();
    // The click that ends a drag must not select anything until the next press.
    expect(result.current.gestures.dragMovedRef.current).toBe(true);
    run(() => h().onPointerDown(pointer({ clientX: 5, clientY: 5 })));
    expect(result.current.gestures.dragMovedRef.current).toBe(false);
  });

  it('ignores the right and middle mouse buttons', () => {
    const { h, camera, run, result } = setup();
    run(() => {
      h().onPointerDown(pointer({ button: 2, clientX: 100, clientY: 100 }));
      h().onPointerMove(pointer({ clientX: 300, clientY: 300 }));
      nextFrame();
    });
    expect(result.current.gestures.isPanningRef.current).toBe(false);
    expect(camera()).toEqual(DEFAULT_CAMERA);
  });

  it('zooms in when two fingers spread, and reports the zoom once they lift', () => {
    const { h, camera, svg, run, result, onZoomChange } = setup();
    const touch = (pointerId: number, clientX: number, clientY = 400) =>
      pointer({ pointerId, pointerType: 'touch', clientX, clientY });
    run(() => {
      h().onPointerDown(touch(1, 400));
      h().onPointerDown(touch(2, 500));
    });
    expect(result.current.camera.pinchingRef.current).toBe(true);
    // A pinch is never a tap, and both fingers are captured.
    expect(result.current.gestures.dragMovedRef.current).toBe(true);
    expect(svg.setPointerCapture).toHaveBeenCalledWith(1);
    expect(svg.setPointerCapture).toHaveBeenCalledWith(2);

    run(() => {
      h().onPointerMove(touch(1, 350));
      nextFrame();
      h().onPointerMove(touch(2, 550));
      nextFrame();
    });
    expect(camera().zoom).toBeCloseTo(DEFAULT_CAMERA.zoom * 2);
    expect(onZoomChange).not.toHaveBeenCalled();

    run(() => h().onPointerUp(touch(2, 550)));
    expect(result.current.camera.pinchingRef.current).toBe(false);
    run(() => h().onPointerUp(touch(1, 350)));
    expect(onZoomChange).toHaveBeenCalledExactlyOnceWith(
      Math.round(camera().zoom * 100),
    );
  });

  it('keeps panning with the finger left after a pinch', () => {
    const { h, camera, run } = setup();
    const touch = (pointerId: number, clientX: number, clientY = 400) =>
      pointer({ pointerId, pointerType: 'touch', clientX, clientY });
    run(() => {
      h().onPointerDown(touch(1, 400));
      h().onPointerDown(touch(2, 500));
      h().onPointerUp(touch(2, 500));
    });
    const before = camera();
    run(() => {
      h().onPointerMove(touch(1, 430));
      nextFrame();
    });
    expect(camera().x).toBeCloseTo(before.x + 30 / SCALE);
  });

  it('ignores a third finger', () => {
    const { h, camera, run } = setup();
    const touch = (pointerId: number, clientX: number) =>
      pointer({ pointerId, pointerType: 'touch', clientX, clientY: 400 });
    run(() => {
      h().onPointerDown(touch(1, 400));
      h().onPointerDown(touch(2, 500));
      h().onPointerDown(touch(3, 600));
    });
    const before = camera();
    run(() => {
      h().onPointerMove(touch(3, 700));
      nextFrame();
    });
    expect(camera()).toBe(before);
  });

  it('ends a press that leaves the map before it becomes a drag', () => {
    const { h, run, result } = setup();
    run(() => {
      h().onPointerDown(pointer({ clientX: 100, clientY: 100 }));
      h().onPointerLeave(pointer({}));
    });
    expect(result.current.gestures.isPanningRef.current).toBe(false);
  });

  it('keeps a captured drag going when the pointer leaves the map', () => {
    const { h, camera, run, result } = setup();
    run(() => {
      h().onPointerDown(pointer({ clientX: 100, clientY: 100 }));
      h().onPointerMove(pointer({ clientX: 150, clientY: 100 }));
      h().onPointerLeave(pointer({}));
      h().onPointerMove(pointer({ clientX: 200, clientY: 100 }));
      nextFrame();
    });
    expect(result.current.gestures.isPanningRef.current).toBe(true);
    expect(camera().x).toBeCloseTo(DEFAULT_CAMERA.x + 100 / SCALE);
  });
});
