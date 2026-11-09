// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMPACT_LAYOUT_QUERY, useCompactLayout } from './useCompactLayout';

type Listener = () => void;

/** A stand-in for `window.matchMedia` whose answer the test can flip. */
function mockMatchMedia(initial: boolean, { legacy = false } = {}) {
  const listeners = new Set<Listener>();
  const query = {
    matches: initial,
    media: COMPACT_LAYOUT_QUERY,
    addEventListener: legacy
      ? undefined
      : (_type: string, cb: Listener) => listeners.add(cb),
    removeEventListener: legacy
      ? undefined
      : (_type: string, cb: Listener) => listeners.delete(cb),
    addListener: (cb: Listener) => listeners.add(cb),
    removeListener: (cb: Listener) => listeners.delete(cb),
  };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    listeners,
    set(matches: boolean) {
      query.matches = matches;
      for (const cb of listeners) cb();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCompactLayout', () => {
  it('asks the one phone breakpoint', () => {
    const media = mockMatchMedia(false);
    renderHook(() => useCompactLayout());
    expect(media.matchMedia).toHaveBeenCalledWith(COMPACT_LAYOUT_QUERY);
  });

  it('is false on a wide screen and true on a phone', () => {
    mockMatchMedia(false);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(false);
    mockMatchMedia(true);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(true);
  });

  it('follows the screen when it is rotated or resized', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useCompactLayout());
    act(() => media.set(true));
    expect(result.current).toBe(true);
    act(() => media.set(false));
    expect(result.current).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const media = mockMatchMedia(false);
    const { unmount } = renderHook(() => useCompactLayout());
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('uses the older listener methods where addEventListener is missing', () => {
    const media = mockMatchMedia(false, { legacy: true });
    const { result, unmount } = renderHook(() => useCompactLayout());
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useCompactLayout()).result.current).toBe(false);
  });
});
