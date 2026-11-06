import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  DEFAULT_CAMERA,
  DEFAULT_MARGIN_X,
  DEFAULT_MARGIN_Y,
  getCameraBounds,
  MAP_CENTER_X,
  MAP_CENTER_Y,
  MAX_ZOOM,
  MIN_ZOOM,
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
