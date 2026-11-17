// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTapCount } from './useTapCount';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTapCount', () => {
  it('fires on the third quick click and starts over after', () => {
    const fire = vi.fn();
    const { result } = renderHook(() => useTapCount(fire));
    result.current();
    result.current();
    expect(fire).not.toHaveBeenCalled();
    result.current();
    expect(fire).toHaveBeenCalledTimes(1);
    result.current();
    result.current();
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the clicks are too far apart', () => {
    const fire = vi.fn();
    const { result } = renderHook(() => useTapCount(fire));
    result.current();
    vi.advanceTimersByTime(2000);
    result.current();
    vi.advanceTimersByTime(2000);
    result.current();
    expect(fire).not.toHaveBeenCalled();
  });
});
