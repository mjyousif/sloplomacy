import type React from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Point } from '../../../data/europeMapGeometry';
import type { Power } from '../../../types/diplomacy';
import {
  type CameraBoundsOptions,
  type CameraState,
  COMPACT_MAX_ZOOM,
  DEFAULT_CAMERA,
  elementPointToViewBox,
  getPhoneDefaultCamera,
  getViewportFit,
  getWideHomeCamera,
  keepPointInView,
  MAP_CENTER_X,
  MAP_CENTER_Y,
  WIDE_CAMERA_OPTIONS,
  zoomAtPoint,
} from '../../../utils/mapCameraHelpers';
import { readMapInsets } from './mapInsets';

/** How long the zoom must stay still before a phone's tap targets are resized for it. */
const TOUCH_TARGET_SETTLE_MS = 150;

/** On a phone, a selected unit is kept at least this far (px) from the edges of the uncovered map. */
const SELECTION_VIEW_MARGIN = 80;

export interface UseMapCameraOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
  cameraGroupRef: React.RefObject<SVGGElement | null>;
  /** The phone layout raises the zoom ceiling and starts the camera around the player's units. */
  compact: boolean;
  /** Switching powers on a phone moves the camera home to the new power's units. */
  activePower: Power;
  /** Where a phone's camera starts: the middle of the player's own units, if they have any. */
  ownUnitsCentre: Point | null;
  onZoomChange?: (zoomPercent: number) => void;
  /** Runs after every camera write, so anything placed in screen space (the floating unit menu) follows. */
  onCameraSync: () => void;
}

export interface MapCamera {
  /** The camera, in a ref for zero-re-render 60fps+ pan & zoom. Written to the DOM, never rendered. */
  cameraRef: React.RefObject<CameraState>;
  cameraOptionsRef: React.RefObject<CameraBoundsOptions | undefined>;
  /** Set by the gestures while two fingers are down: a pinch reports its zoom once they lift. */
  pinchingRef: React.RefObject<boolean>;
  /** Phone: screen pixels per board unit once the zoom settles, which sizes the tap targets. */
  touchPxPerUnit: number;
  syncCameraDOM: () => void;
  scheduleCameraSync: () => void;
  reportZoom: () => void;
  clientToViewBox: (pt: Point) => Point;
  zoomAboutCentre: (newZoom: number) => void;
  stepZoom: (delta: number) => void;
  resetCamera: () => void;
}

/**
 * The map's camera: pan and zoom held in a ref and written straight to the camera group's
 * transform once per animation frame, the wheel, the zoom buttons, where the camera starts,
 * and the zoom figure App shows.
 */
export function useMapCamera({
  svgRef,
  cameraGroupRef,
  compact,
  activePower,
  ownUnitsCentre,
  onZoomChange,
  onCameraSync,
}: UseMapCameraOptions): MapCamera {
  // Camera state stored in a mutable ref for zero-re-render 60fps+ pan & zoom via requestAnimationFrame
  const cameraRef = useRef<CameraState>({
    ...DEFAULT_CAMERA,
  });
  const pinchingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);

  // Read through refs so the wheel listener and the rAF callback always see the current values.
  const cameraOptions = useMemo<CameraBoundsOptions | undefined>(
    () => (compact ? { maxZoom: COMPACT_MAX_ZOOM } : WIDE_CAMERA_OPTIONS),
    [compact],
  );
  const cameraOptionsRef = useRef(cameraOptions);
  cameraOptionsRef.current = cameraOptions;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const reportedZoomRef = useRef<number | null>(null);
  const onCameraSyncRef = useRef(onCameraSync);
  onCameraSyncRef.current = onCameraSync;

  // Apply camera transform & floating menu position directly to DOM
  const syncCameraDOM = useCallback(() => {
    const { x, y, zoom: z } = cameraRef.current;
    if (cameraGroupRef.current) {
      cameraGroupRef.current.setAttribute(
        'transform',
        `translate(${x}, ${y}) scale(${z})`,
      );
    }
    onCameraSyncRef.current();
  }, [cameraGroupRef]);

  // Phone: screen pixels per board unit once the zoom settles, which sizes the tap targets.
  // It updates after the zoom stops changing, not on every frame of a pinch.
  const [touchPxPerUnit, setTouchPxPerUnit] = useState(0);
  const touchSettleTimerRef = useRef<number | null>(null);
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const settleTouchTargets = useCallback(() => {
    if (!compactRef.current) return;
    if (touchSettleTimerRef.current !== null)
      window.clearTimeout(touchSettleTimerRef.current);
    touchSettleTimerRef.current = window.setTimeout(() => {
      touchSettleTimerRef.current = null;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTouchPxPerUnit(
        getViewportFit(rect.width, rect.height).scale * cameraRef.current.zoom,
      );
    }, TOUCH_TARGET_SETTLE_MS);
  }, [svgRef]);

  useEffect(() => {
    if (!compact) return;
    settleTouchTargets();
    window.addEventListener('resize', settleTouchTargets);
    return () => {
      window.removeEventListener('resize', settleTouchTargets);
      if (touchSettleTimerRef.current !== null)
        window.clearTimeout(touchSettleTimerRef.current);
    };
  }, [compact, settleTouchTargets]);

  // Tells App the zoom, but only when the rounded figure changes, so a wheel spin or a pinch
  // doesn't re-render the whole app on every frame.
  const reportZoom = useCallback(() => {
    const percent = Math.round(cameraRef.current.zoom * 100);
    if (percent === reportedZoomRef.current) return;
    reportedZoomRef.current = percent;
    onZoomChangeRef.current?.(percent);
    settleTouchTargets();
  }, [settleTouchTargets]);

  const scheduleCameraSync = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      syncCameraDOM();
      // A pinch reports once the fingers lift.
      if (!pinchingRef.current) reportZoom();
    });
  }, [syncCameraDOM, reportZoom]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  /** A client-space point in viewBox units, allowing for the letterbox around the board. */
  const clientToViewBox = useCallback(
    (pt: Point): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      const W = rect?.width || 980;
      const H = rect?.height || 860;
      return elementPointToViewBox(
        { x: pt.x - (rect?.left ?? 0), y: pt.y - (rect?.top ?? 0) },
        W,
        H,
      );
    },
    [svgRef],
  );

  // Native non-passive wheel listener for smooth cursor-anchored zooming
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const current = cameraRef.current;
      const factor = Math.exp(-e.deltaY * 0.0014);
      const next = zoomAtPoint(
        current,
        clientToViewBox({ x: e.clientX, y: e.clientY }),
        Number((current.zoom * factor).toFixed(3)),
        cameraOptionsRef.current,
      );
      if (next.zoom === current.zoom) return;
      cameraRef.current = next;
      scheduleCameraSync();
    };

    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', onWheel);
  }, [svgRef, scheduleCameraSync, clientToViewBox]);

  /**
   * Zooms about the middle of the view, so whatever is in the middle stays there. On a wide
   * screen that is the middle of the strip between the sidebars, which float over the map.
   */
  const zoomAboutCentre = useCallback(
    (newZoom: number) => {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const insets = readMapInsets(svg);
      const anchor = {
        x:
          rect && rect.width > 0 && rect.height > 0
            ? clientToViewBox({
                x:
                  rect.left +
                  insets.left +
                  (rect.width - insets.left - insets.right) / 2,
                y: rect.top + rect.height / 2,
              }).x
            : MAP_CENTER_X,
        y: MAP_CENTER_Y,
      };
      cameraRef.current = zoomAtPoint(
        cameraRef.current,
        anchor,
        newZoom,
        cameraOptionsRef.current,
      );
      syncCameraDOM();
      reportZoom();
    },
    [svgRef, clientToViewBox, syncCameraDOM, reportZoom],
  );

  const stepZoom = useCallback(
    (delta: number) => {
      zoomAboutCentre(Number((cameraRef.current.zoom + delta).toFixed(2)));
    },
    [zoomAboutCentre],
  );

  const ownUnitsCentreRef = useRef(ownUnitsCentre);
  ownUnitsCentreRef.current = ownUnitsCentre;

  const getHomeCamera = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!compact) {
      const insets = readMapInsets(svgRef.current);
      return getWideHomeCamera(
        rect?.width ?? 0,
        rect?.height ?? 0,
        insets.left,
        insets.right,
        cameraOptionsRef.current,
      );
    }
    return getPhoneDefaultCamera(
      rect?.width ?? 0,
      rect?.height ?? 0,
      ownUnitsCentreRef.current,
      cameraOptionsRef.current,
    );
  }, [compact, svgRef]);

  const resetCamera = useCallback(() => {
    cameraRef.current = getHomeCamera();
    syncCameraDOM();
    reportZoom();
  }, [getHomeCamera, syncCameraDOM, reportZoom]);

  // Opening the map, entering or leaving the phone layout, or switching powers on a phone, moves
  // the camera home. On a wide screen home frames the board between the sidebars, which float
  // over the map; opening or collapsing one later never moves the camera (#272).
  const cameraHomeKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = compact ? `compact:${activePower}` : 'wide';
    if (key === cameraHomeKeyRef.current) return;
    cameraHomeKeyRef.current = key;
    // A camera already at home (the first render draws DEFAULT_CAMERA) is left untouched.
    const home = getHomeCamera();
    const current = cameraRef.current;
    if (
      home.x === current.x &&
      home.y === current.y &&
      home.zoom === current.zoom
    )
      return;
    resetCamera();
  }, [compact, activePower, getHomeCamera, resetCamera]);

  useEffect(() => {
    // Tell App the starting zoom. Later reports read onZoomChange through its ref, so a new
    // callback is used from the next change on.
    reportedZoomRef.current = null;
    reportZoom();
  }, [reportZoom]);

  return {
    cameraRef,
    cameraOptionsRef,
    pinchingRef,
    touchPxPerUnit,
    syncCameraDOM,
    scheduleCameraSync,
    reportZoom,
    clientToViewBox,
    zoomAboutCentre,
    stepZoom,
    resetCamera,
  };
}

interface KeepSelectionInViewOptions {
  svgRef: React.RefObject<SVGSVGElement | null>;
  /** The map's container, which carries the docked bar's space as --docked-bar-h. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  compact: boolean;
  /** The selected unit's or build slot's point on the board, or null. */
  anchor: Point | null;
  selectedUnitId: string | null;
  selectedBuildProv: string | null;
}

/**
 * Phone: whatever was just selected, from the map or from its card in the order sheet, is
 * panned clear of the docked bar with room around it for the provinces to tap. It only runs
 * when the selection changes, so panning away afterwards is left alone.
 */
export function useKeepSelectionInView(
  camera: MapCamera,
  {
    svgRef,
    containerRef,
    compact,
    anchor,
    selectedUnitId,
    selectedBuildProv,
  }: KeepSelectionInViewOptions,
): void {
  const selectionAnchorRef = useRef<Point | null>(null);
  selectionAnchorRef.current = anchor;
  const { cameraRef, cameraOptionsRef, syncCameraDOM } = camera;
  useEffect(() => {
    if (!compact) return;
    const anchor = selectionAnchorRef.current;
    const svg = svgRef.current;
    if (!anchor || !svg) return;
    const rect = svg.getBoundingClientRect();
    // The dock ref has already put the bar's space on the map by the time effects run.
    const barSpace =
      parseFloat(
        containerRef.current?.style.getPropertyValue('--docked-bar-h') ?? '',
      ) || 0;
    const next = keepPointInView(
      cameraRef.current,
      anchor,
      rect.width,
      rect.height,
      { top: 0, bottom: rect.height - barSpace },
      SELECTION_VIEW_MARGIN,
      cameraOptionsRef.current,
    );
    if (next === cameraRef.current) return;
    cameraRef.current = next;
    syncCameraDOM();
  }, [compact, selectedUnitId, selectedBuildProv]);
}
