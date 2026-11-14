import type React from 'react';
import { useRef } from 'react';
import type { Point } from '../../../data/europeMapGeometry';
import {
  clampCamera,
  getViewportFit,
  pinchStep,
} from '../../../utils/mapCameraHelpers';
import type { MapCamera } from './useMapCamera';

type SvgPointerHandler = (e: React.PointerEvent<SVGSVGElement>) => void;

export interface MapGestures {
  /** True from a press on the map until every pointer lifts. Hover is ignored meanwhile. */
  isPanningRef: React.RefObject<boolean>;
  /** True once a press has moved past the tap threshold, so the click that ends it selects nothing. */
  dragMovedRef: React.RefObject<boolean>;
  /** Spread onto the map's `<svg>`. */
  pointerHandlers: {
    onPointerDown: SvgPointerHandler;
    onPointerMove: SvgPointerHandler;
    onPointerUp: SvgPointerHandler;
    onPointerCancel: SvgPointerHandler;
    onPointerLeave: SvgPointerHandler;
  };
}

/**
 * Panning with one pointer and pinch-zooming with two. Pointer Events cover the mouse, a
 * finger and a pen alike. The map takes the pointer only once a drag passes the threshold:
 * capturing on press would send the click to the map instead of the unit or province under it.
 */
export function useMapGestures(
  svgRef: React.RefObject<SVGSVGElement | null>,
  camera: MapCamera,
): MapGestures {
  const {
    cameraRef,
    cameraOptionsRef,
    pinchingRef,
    clientToViewBox,
    reportZoom,
    scheduleCameraSync,
  } = camera;
  const isPanningRef = useRef<boolean>(false);
  const dragMovedRef = useRef<boolean>(false);
  const mouseDownClientRef = useRef<Point>({ x: 0, y: 0 });
  // Pointers pressed on the map, by id, at the client position last applied to the camera.
  // One pointer pans, and two pinch.
  const activePointersRef = useRef<Map<number, Point>>(new Map());

  const endPanning = () => {
    isPanningRef.current = false;
    delete svgRef.current?.dataset.mapPanning;
    delete svgRef.current?.dataset.mapDragging;
    reportZoom();
  };

  const markDragging = () => {
    dragMovedRef.current = true;
    if (svgRef.current) svgRef.current.dataset.mapDragging = 'true';
  };

  const capturePointer = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // The pointer is already gone, for example lifted in the same frame.
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const pointers = activePointersRef.current;
    const client = { x: e.clientX, y: e.clientY };
    if (pointers.size === 0) {
      isPanningRef.current = true;
      if (svgRef.current) svgRef.current.dataset.mapPanning = 'true';
      dragMovedRef.current = false;
      mouseDownClientRef.current = client;
    }
    pointers.set(e.pointerId, client);
    pinchingRef.current = pointers.size >= 2;
    if (pointers.size === 2) {
      // A second finger turns the gesture into a pinch, and a pinch is never a tap.
      markDragging();
      pointers.forEach((_, id) => capturePointer(id));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const pointers = activePointersRef.current;
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const client = { x: e.clientX, y: e.clientY };

    if (pointers.size >= 2) {
      const [idA, idB] = Array.from(pointers.keys());
      if (e.pointerId !== idA && e.pointerId !== idB) return;
      const prev: [Point, Point] = [
        clientToViewBox(pointers.get(idA)!),
        clientToViewBox(pointers.get(idB)!),
      ];
      pointers.set(e.pointerId, client);
      const next: [Point, Point] = [
        clientToViewBox(pointers.get(idA)!),
        clientToViewBox(pointers.get(idB)!),
      ];
      cameraRef.current = pinchStep(
        cameraRef.current,
        prev,
        next,
        cameraOptionsRef.current,
      );
      scheduleCameraSync();
      return;
    }

    if (!dragMovedRef.current) {
      // A finger wobbles more than a mouse, so a tap allows more movement before it pans.
      const threshold = e.pointerType === 'mouse' ? 4 : 10;
      const dist = Math.hypot(
        client.x - mouseDownClientRef.current.x,
        client.y - mouseDownClientRef.current.y,
      );
      if (dist <= threshold) return;
      markDragging();
      capturePointer(e.pointerId);
    }

    const rect = svgRef.current?.getBoundingClientRect();
    const { scale } = getViewportFit(rect?.width || 980, rect?.height || 860);
    cameraRef.current = clampCamera(
      {
        x: cameraRef.current.x + (client.x - last.x) / scale,
        y: cameraRef.current.y + (client.y - last.y) / scale,
        zoom: cameraRef.current.zoom,
      },
      cameraOptionsRef.current,
    );
    pointers.set(e.pointerId, client);
    scheduleCameraSync();
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const pointers = activePointersRef.current;
    if (!pointers.delete(e.pointerId)) return;
    pinchingRef.current = pointers.size >= 2;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    // With one finger left after a pinch, carrying on pans from where that finger is.
    if (pointers.size === 0) endPanning();
  };

  // A captured pointer keeps the drag going off the map. Before the threshold, leaving the map
  // ends the press, as it always has for the mouse.
  const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) return;
    handlePointerUp(e);
  };

  return {
    isPanningRef,
    dragMovedRef,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onPointerLeave: handlePointerLeave,
    },
  };
}
