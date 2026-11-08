export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export interface CameraBoundsOptions {
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  centerX?: number;
  centerY?: number;
  minZoom?: number;
  maxZoom?: number;
  marginX?: number;
  marginY?: number;
}

export interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const MAP_VIEWBOX_WIDTH = 1524;
export const MAP_VIEWBOX_HEIGHT = 1357;
export const MAP_CENTER_X = 762;
export const MAP_CENTER_Y = 678;

export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 3.0;

export const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: -35,
  zoom: 1.05,
};

export const DEFAULT_MARGIN_X = 400;
export const DEFAULT_MARGIN_Y = 350;

/**
 * Calculates allowable camera pan bounds for a given zoom level.
 * Ensures the map cannot be panned endlessly off-screen into empty void.
 */
export function getCameraBounds(
  zoom: number,
  options?: CameraBoundsOptions,
): CameraBounds {
  const cx = options?.centerX ?? MAP_CENTER_X;
  const cy = options?.centerY ?? MAP_CENTER_Y;
  const h = options?.viewBoxHeight ?? MAP_VIEWBOX_HEIGHT;
  const marginX = options?.marginX ?? DEFAULT_MARGIN_X;
  const marginY = options?.marginY ?? DEFAULT_MARGIN_Y;

  const maxX = Math.max(0, cx * (zoom - 1) + marginX);
  const minX = -maxX;

  const maxY = Math.max(0, cy * (zoom - 1) + marginY);
  const minY = -Math.max(0, (h - cy) * (zoom - 1) + marginY);

  return { minX, maxX, minY, maxY };
}

/**
 * Clamps camera coordinates (x, y, zoom) so that the map stays within bounded limits.
 */
export function clampCamera(
  camera: CameraState,
  options?: CameraBoundsOptions,
): CameraState {
  const minZoom = options?.minZoom ?? MIN_ZOOM;
  const maxZoom = options?.maxZoom ?? MAX_ZOOM;

  const rawZoom = Number.isFinite(camera.zoom)
    ? camera.zoom
    : DEFAULT_CAMERA.zoom;
  const clampedZoom = Math.min(maxZoom, Math.max(minZoom, rawZoom));

  const bounds = getCameraBounds(clampedZoom, options);

  const rawX = Number.isFinite(camera.x) ? camera.x : DEFAULT_CAMERA.x;
  const rawY = Number.isFinite(camera.y) ? camera.y : DEFAULT_CAMERA.y;

  const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, rawX));
  const clampedY = Math.min(bounds.maxY, Math.max(bounds.minY, rawY));

  return {
    x: clampedX,
    y: clampedY,
    zoom: clampedZoom,
  };
}

/** Phones get a higher zoom ceiling, because a piece at 3× is still only about 27px across. */
export const COMPACT_MAX_ZOOM = 6.0;

export interface Point2D {
  x: number;
  y: number;
}

/**
 * How the SVG's `viewBox` sits inside its element. The default `preserveAspectRatio`
 * ("xMidYMid meet") scales the board to fit and centres it, leaving bars on the long side.
 */
export interface ViewportFit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function getViewportFit(width: number, height: number): ViewportFit {
  const scale =
    Math.min(width / MAP_VIEWBOX_WIDTH, height / MAP_VIEWBOX_HEIGHT) || 1;
  return {
    scale,
    offsetX: (width - MAP_VIEWBOX_WIDTH * scale) / 2,
    offsetY: (height - MAP_VIEWBOX_HEIGHT * scale) / 2,
  };
}

/** Turns a point in element pixels (relative to its top-left corner) into viewBox units. */
export function elementPointToViewBox(
  pt: Point2D,
  width: number,
  height: number,
): Point2D {
  const { scale, offsetX, offsetY } = getViewportFit(width, height);
  return { x: (pt.x - offsetX) / scale, y: (pt.y - offsetY) / scale };
}

/**
 * Changes the zoom while keeping the board point under `anchor` (in viewBox units) where it is.
 * The wheel, a pinch and the zoom buttons all use this.
 *
 * The camera group is drawn as `translate(x, y) scale(zoom)` about (MAP_CENTER_X, MAP_CENTER_Y),
 * so a board point p lands at `center + (p - center) * zoom + pan`.
 */
export function zoomAtPoint(
  camera: CameraState,
  anchor: Point2D,
  newZoom: number,
  options?: CameraBoundsOptions,
): CameraState {
  const minZoom = options?.minZoom ?? MIN_ZOOM;
  const maxZoom = options?.maxZoom ?? MAX_ZOOM;
  const cx = options?.centerX ?? MAP_CENTER_X;
  const cy = options?.centerY ?? MAP_CENTER_Y;
  const zoom = Math.min(maxZoom, Math.max(minZoom, newZoom));

  const boardX = cx + (anchor.x - cx - camera.x) / camera.zoom;
  const boardY = cy + (anchor.y - cy - camera.y) / camera.zoom;

  return clampCamera(
    {
      x: anchor.x - cx - (boardX - cx) * zoom,
      y: anchor.y - cy - (boardY - cy) * zoom,
      zoom,
    },
    options,
  );
}

/**
 * One frame of a two-finger gesture, with every point in viewBox units. The board point that
 * was under the old midpoint follows the fingers to the new midpoint, and the zoom changes by
 * how much the fingers spread apart.
 */
export function pinchStep(
  camera: CameraState,
  prev: [Point2D, Point2D],
  next: [Point2D, Point2D],
  options?: CameraBoundsOptions,
): CameraState {
  const prevDist = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
  const nextDist = Math.hypot(next[0].x - next[1].x, next[0].y - next[1].y);
  const ratio = prevDist > 0 && nextDist > 0 ? nextDist / prevDist : 1;

  const prevMid = {
    x: (prev[0].x + prev[1].x) / 2,
    y: (prev[0].y + prev[1].y) / 2,
  };
  const nextMid = {
    x: (next[0].x + next[1].x) / 2,
    y: (next[0].y + next[1].y) / 2,
  };

  // Move first, without clamping, so a board edge doesn't eat part of the zoom anchor.
  const moved = {
    x: camera.x + (nextMid.x - prevMid.x),
    y: camera.y + (nextMid.y - prevMid.y),
    zoom: camera.zoom,
  };
  return zoomAtPoint(moved, nextMid, camera.zoom * ratio, options);
}

/**
 * The starting view on a phone. A portrait screen fits the board to its width, which leaves it
 * a thin strip, so this zooms until the board fills the height instead, and centres on `focus`
 * (the player's own units) when there is one. A screen as wide as the board already fills
 * just gets the usual default.
 */
export function getPhoneDefaultCamera(
  width: number,
  height: number,
  focus: Point2D | null,
  options?: CameraBoundsOptions,
): CameraState {
  if (!(width > 0) || !(height > 0))
    return clampCamera({ ...DEFAULT_CAMERA }, options);
  const fillHeightZoom =
    (height * MAP_VIEWBOX_WIDTH) / (MAP_VIEWBOX_HEIGHT * width);
  if (fillHeightZoom <= DEFAULT_CAMERA.zoom)
    return clampCamera({ ...DEFAULT_CAMERA }, options);

  const cx = options?.centerX ?? MAP_CENTER_X;
  const cy = options?.centerY ?? MAP_CENTER_Y;
  const zoom = Number(fillHeightZoom.toFixed(3));
  const target = focus ?? { x: cx, y: cy };
  return clampCamera(
    {
      x: (cx - target.x) * zoom,
      // The board fills the height exactly, so only sideways panning is needed.
      y: 0,
      zoom,
    },
    options,
  );
}
