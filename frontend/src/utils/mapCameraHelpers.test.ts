import { describe, expect, it } from 'vitest';
import {
  COMPACT_MAX_ZOOM,
  clampCamera,
  compactHitRadius,
  DEFAULT_CAMERA,
  DEFAULT_MARGIN_X,
  DEFAULT_MARGIN_Y,
  elementPointToViewBox,
  getCameraBounds,
  getPhoneDefaultCamera,
  getViewportFit,
  halfNearestDistances,
  keepPointInView,
  MAP_CENTER_X,
  MAP_CENTER_Y,
  MAP_VIEWBOX_HEIGHT,
  MAX_ZOOM,
  MIN_TOUCH_RADIUS_PX,
  MIN_ZOOM,
  pinchStep,
  zoomAtPoint,
} from './mapCameraHelpers';

describe('Map Camera Bounding (Issue #20)', () => {
  it('ensures DEFAULT_CAMERA is valid and within allowable bounds', () => {
    const bounds = getCameraBounds(DEFAULT_CAMERA.zoom);
    expect(DEFAULT_CAMERA.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(DEFAULT_CAMERA.x).toBeLessThanOrEqual(bounds.maxX);
    expect(DEFAULT_CAMERA.y).toBeGreaterThanOrEqual(bounds.minY);
    expect(DEFAULT_CAMERA.y).toBeLessThanOrEqual(bounds.maxY);

    const clamped = clampCamera(DEFAULT_CAMERA);
    expect(clamped).toEqual(DEFAULT_CAMERA);
  });

  it('calculates expected camera bounds at zoom 1.0', () => {
    const bounds = getCameraBounds(1.0);
    expect(bounds.maxX).toBe(DEFAULT_MARGIN_X);
    expect(bounds.minX).toBe(-DEFAULT_MARGIN_X);
    expect(bounds.maxY).toBe(DEFAULT_MARGIN_Y);
    expect(bounds.minY).toBe(-DEFAULT_MARGIN_Y);
  });

  it('expands camera bounds proportionally when zoomed in', () => {
    const bounds2x = getCameraBounds(2.0);
    expect(bounds2x.maxX).toBe(MAP_CENTER_X + DEFAULT_MARGIN_X);
    expect(bounds2x.minX).toBe(-(MAP_CENTER_X + DEFAULT_MARGIN_X));
    expect(bounds2x.maxY).toBe(MAP_CENTER_Y + DEFAULT_MARGIN_Y);
    expect(bounds2x.minY).toBe(-(MAP_CENTER_Y + 1 + DEFAULT_MARGIN_Y));

    const bounds3x = getCameraBounds(3.0);
    expect(bounds3x.maxX).toBeGreaterThan(bounds2x.maxX);
    expect(bounds3x.minX).toBeLessThan(bounds2x.minX);
    expect(bounds3x.maxY).toBeGreaterThan(bounds2x.maxY);
    expect(bounds3x.minY).toBeLessThan(bounds2x.minY);
  });

  it('keeps valid non-inverted bounds when zoomed out to minimum zoom', () => {
    const boundsMin = getCameraBounds(MIN_ZOOM);
    expect(boundsMin.minX).toBeLessThanOrEqual(boundsMin.maxX);
    expect(boundsMin.minY).toBeLessThanOrEqual(boundsMin.maxY);
    expect(boundsMin.maxX).toBeGreaterThan(0);
    expect(boundsMin.maxY).toBeGreaterThan(0);
  });

  it('clamps extreme positive and negative coordinates to prevent endless panning', () => {
    const extremePan = {
      x: 99999,
      y: -99999,
      zoom: 1.05,
    };
    const clamped = clampCamera(extremePan);
    const bounds = getCameraBounds(1.05);

    expect(clamped.x).toBe(bounds.maxX);
    expect(clamped.y).toBe(bounds.minY);
    expect(clamped.zoom).toBe(1.05);
  });

  it('clamps opposite extreme coordinates', () => {
    const extremePan = {
      x: -50000,
      y: 50000,
      zoom: 1.5,
    };
    const clamped = clampCamera(extremePan);
    const bounds = getCameraBounds(1.5);

    expect(clamped.x).toBe(bounds.minX);
    expect(clamped.y).toBe(bounds.maxY);
    expect(clamped.zoom).toBe(1.5);
  });

  it('clamps zoom outside of allowable range', () => {
    const tooSmall = clampCamera({ x: 0, y: 0, zoom: 0.1 });
    expect(tooSmall.zoom).toBe(MIN_ZOOM);

    const tooLarge = clampCamera({ x: 0, y: 0, zoom: 10.0 });
    expect(tooLarge.zoom).toBe(MAX_ZOOM);
  });

  it('safely recovers from NaN or non-finite inputs', () => {
    const invalidCamera = {
      x: Number.NaN,
      y: Infinity,
      zoom: -Infinity,
    };
    const clamped = clampCamera(invalidCamera);
    expect(Number.isFinite(clamped.x)).toBe(true);
    expect(Number.isFinite(clamped.y)).toBe(true);
    expect(Number.isFinite(clamped.zoom)).toBe(true);
    expect(clamped.zoom).toBe(DEFAULT_CAMERA.zoom);
    expect(clamped.x).toBe(DEFAULT_CAMERA.x);
    expect(clamped.y).toBe(DEFAULT_CAMERA.y);
  });

  it('respects custom margin options', () => {
    const customBounds = getCameraBounds(1.0, {
      marginX: 200,
      marginY: 150,
    });
    expect(customBounds.maxX).toBe(200);
    expect(customBounds.minX).toBe(-200);
    expect(customBounds.maxY).toBe(150);
    expect(customBounds.minY).toBe(-150);
  });
});

describe('touch camera helpers (issue #54)', () => {
  const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
  // Where a board point is drawn, in viewBox units, for a camera.
  const project = (
    cam: { x: number; y: number; zoom: number },
    p: { x: number; y: number },
  ) => ({
    x: MAP_CENTER_X + (p.x - MAP_CENTER_X) * cam.zoom + cam.x,
    y: MAP_CENTER_Y + (p.y - MAP_CENTER_Y) * cam.zoom + cam.y,
  });

  it('getViewportFit letterboxes a portrait phone top and bottom', () => {
    const fit = getViewportFit(375, 700);
    close(fit.scale, 375 / 1524);
    close(fit.offsetX, 0);
    expect(fit.offsetY).toBeGreaterThan(0);
    const pt = elementPointToViewBox({ x: 375 / 2, y: 350 }, 375, 700);
    close(pt.x, MAP_CENTER_X);
    close(pt.y, MAP_CENTER_Y + 0.5); // 1357 is odd, so the centre is 678.5
  });

  it('zoomAtPoint keeps the board point under the anchor still', () => {
    const cam = { x: 120, y: -40, zoom: 1.2 };
    const anchor = { x: 400, y: 300 };
    const boardX = MAP_CENTER_X + (anchor.x - MAP_CENTER_X - cam.x) / cam.zoom;
    const boardY = MAP_CENTER_Y + (anchor.y - MAP_CENTER_Y - cam.y) / cam.zoom;
    const next = zoomAtPoint(cam, anchor, 2);
    close(next.zoom, 2);
    const drawn = project(next, { x: boardX, y: boardY });
    close(drawn.x, anchor.x);
    close(drawn.y, anchor.y);
  });

  it('zoomAtPoint about the view centre with no pan keeps the pan at zero', () => {
    const next = zoomAtPoint(
      { x: 0, y: 0, zoom: 1 },
      { x: MAP_CENTER_X, y: MAP_CENTER_Y },
      2.5,
    );
    expect(next).toEqual({ x: 0, y: 0, zoom: 2.5 });
  });

  it('zoomAtPoint respects the zoom limits it is given', () => {
    const cam = { x: 0, y: 0, zoom: 2 };
    const centre = { x: MAP_CENTER_X, y: MAP_CENTER_Y };
    expect(zoomAtPoint(cam, centre, 10).zoom).toBe(MAX_ZOOM);
    expect(
      zoomAtPoint(cam, centre, 10, { maxZoom: COMPACT_MAX_ZOOM }).zoom,
    ).toBe(COMPACT_MAX_ZOOM);
    expect(zoomAtPoint(cam, centre, 0.1).zoom).toBe(MIN_ZOOM);
  });

  it('pinchStep doubles the zoom when the fingers spread to twice the distance', () => {
    const cam = { x: 0, y: 0, zoom: 1.5 };
    const next = pinchStep(
      cam,
      [
        { x: 700, y: 600 },
        { x: 800, y: 600 },
      ],
      [
        { x: 650, y: 600 },
        { x: 850, y: 600 },
      ],
    );
    close(next.zoom, 3);
  });

  it('pinchStep carries the board point under the fingers along with them', () => {
    const cam = { x: 50, y: 20, zoom: 2 };
    const prev: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 600, y: 500 },
      { x: 700, y: 560 },
    ];
    const next: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 640, y: 470 },
      { x: 760, y: 542 },
    ];
    const prevMid = { x: 650, y: 530 };
    const boardX = MAP_CENTER_X + (prevMid.x - MAP_CENTER_X - cam.x) / cam.zoom;
    const boardY = MAP_CENTER_Y + (prevMid.y - MAP_CENTER_Y - cam.y) / cam.zoom;
    const result = pinchStep(cam, prev, next, { maxZoom: COMPACT_MAX_ZOOM });
    const drawn = project(result, { x: boardX, y: boardY });
    close(drawn.x, 700);
    close(drawn.y, 506);
    close(result.zoom, 2 * (Math.hypot(120, 72) / Math.hypot(100, 60)));
  });

  it('pinchStep with fingers on one spot changes nothing', () => {
    const cam = { x: 10, y: 10, zoom: 2 };
    const same: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 500, y: 500 },
      { x: 500, y: 500 },
    ];
    expect(pinchStep(cam, same, same)).toEqual(cam);
  });

  it('getPhoneDefaultCamera fills a portrait screen top to bottom', () => {
    const cam = getPhoneDefaultCamera(375, 700, null, {
      maxZoom: COMPACT_MAX_ZOOM,
    });
    const fit = getViewportFit(375, 700);
    // The board's drawn height, in screen pixels, matches the screen.
    // (to within a pixel, since the zoom is rounded to three places).
    expect(MAP_VIEWBOX_HEIGHT * cam.zoom * fit.scale).toBeCloseTo(700, 0);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('getPhoneDefaultCamera centres on the focus point', () => {
    const focus = { x: 1100, y: 900 };
    const cam = getPhoneDefaultCamera(375, 700, focus, {
      maxZoom: COMPACT_MAX_ZOOM,
    });
    close(project(cam, focus).x, MAP_CENTER_X);
    expect(cam).toEqual(clampCamera(cam, { maxZoom: COMPACT_MAX_ZOOM }));
  });

  it('getPhoneDefaultCamera keeps the usual view on a wide screen or with no size', () => {
    expect(getPhoneDefaultCamera(812, 330, null)).toEqual(DEFAULT_CAMERA);
    expect(getPhoneDefaultCamera(0, 0, null)).toEqual(DEFAULT_CAMERA);
  });
});

describe('keepPointInView', () => {
  // A 390×599 phone map at the phone's fill-height zoom, as on an iPhone 14 with the sheet lowered.
  const W = 390;
  const H = 599;
  const options = { maxZoom: COMPACT_MAX_ZOOM };
  const camera = getPhoneDefaultCamera(W, H, { x: 400, y: 900 }, options);
  const toScreen = (
    cam: { x: number; y: number; zoom: number },
    p: { x: number; y: number },
  ) => {
    const { scale, offsetX, offsetY } = getViewportFit(W, H);
    return {
      x:
        offsetX +
        (MAP_CENTER_X + (p.x - MAP_CENTER_X) * cam.zoom + cam.x) * scale,
      y:
        offsetY +
        (MAP_CENTER_Y + (p.y - MAP_CENTER_Y) * cam.zoom + cam.y) * scale,
    };
  };

  it('leaves the camera alone when the point is already comfortably in view', () => {
    const centre = { x: 400, y: 900 };
    const before = toScreen(camera, centre);
    expect(before.y).toBeGreaterThan(80);
    const same = keepPointInView(
      camera,
      centre,
      W,
      H,
      { top: 0, bottom: H },
      80,
      options,
    );
    expect(same).toBe(camera);
  });

  it('lifts a point the docked bar would cover into the middle of what is left', () => {
    // Find a board point that lands under a 150px bar at the bottom.
    const hidden = { x: 400, y: 900 };
    const barTop = H - 150;
    const start = toScreen(camera, hidden);
    const pushed = {
      ...camera,
      y: camera.y + (barTop + 20 - start.y) / getViewportFit(W, H).scale,
    };
    expect(toScreen(pushed, hidden).y).toBeGreaterThan(barTop);

    const next = keepPointInView(
      pushed,
      hidden,
      W,
      H,
      { top: 0, bottom: barTop },
      80,
      options,
    );
    const after = toScreen(next, hidden);
    expect(after.y).toBeCloseTo(barTop / 2, 0);
    // Sideways it was already in view, so it didn't move that way.
    expect(after.x).toBeCloseTo(toScreen(pushed, hidden).x, 5);
    expect(next.zoom).toBe(pushed.zoom);
  });

  it('never pans past the edge of the board', () => {
    // The very bottom of the board can't be lifted to the middle, so it stops at the edge.
    const bottomEdge = { x: MAP_CENTER_X, y: MAP_VIEWBOX_HEIGHT };
    const next = keepPointInView(
      camera,
      bottomEdge,
      W,
      H,
      { top: 0, bottom: H - 150 },
      80,
      options,
    );
    expect(next).toEqual(clampCamera(next, options));
  });

  it('does nothing before the map has a size', () => {
    expect(
      keepPointInView(camera, { x: 0, y: 0 }, 0, 0, { top: 0, bottom: 0 }, 80),
    ).toBe(camera);
  });
});

describe('phone tap targets', () => {
  it('halves the distance to the nearest neighbour, so targets never overlap', () => {
    const caps = halfNearestDistances({
      a: { x: 0, y: 0 },
      b: { x: 30, y: 40 },
      c: { x: 300, y: 0 },
    });
    expect(caps.a).toBe(25);
    expect(caps.b).toBe(25);
    expect(caps.c).toBeCloseTo(Math.hypot(270, 40) / 2, 6);
    expect(halfNearestDistances({ lone: { x: 1, y: 1 } }).lone).toBe(Infinity);
  });

  it('grows a target until it is 44px across on screen', () => {
    // At half a pixel per board unit, 22px on screen is 44 board units.
    expect(compactHitRadius(17, 0.5, Infinity)).toBe(MIN_TOUCH_RADIUS_PX / 0.5);
  });

  it('stops at the cap so neighbours keep their own targets', () => {
    expect(compactHitRadius(17, 0.5, 30)).toBe(30);
  });

  it('never shrinks below the style radius, even zoomed far in or crowded', () => {
    expect(compactHitRadius(21, 4, Infinity)).toBe(21);
    expect(compactHitRadius(21, 0.5, 10)).toBe(21);
  });

  it('keeps the style radius until the zoom is known', () => {
    expect(compactHitRadius(0, 0, 30)).toBe(0);
  });
});
