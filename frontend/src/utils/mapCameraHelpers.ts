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
  options?: CameraBoundsOptions
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
  options?: CameraBoundsOptions
): CameraState {
  const minZoom = options?.minZoom ?? MIN_ZOOM;
  const maxZoom = options?.maxZoom ?? MAX_ZOOM;

  const rawZoom = Number.isFinite(camera.zoom) ? camera.zoom : DEFAULT_CAMERA.zoom;
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
