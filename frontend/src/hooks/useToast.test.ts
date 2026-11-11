// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, useToast } from './useToast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useToast', () => {
  it('shows nothing until a toast is triggered', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toastBanner).toBeNull();
  });

  it('shows a message and clears it after the toast duration', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.triggerToast('Orders unlocked for editing.'));
    expect(result.current.toastBanner).toBe('Orders unlocked for editing.');

    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(result.current.toastBanner).toBe('Orders unlocked for editing.');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.toastBanner).toBeNull();
  });

  it('stays up for four and a half seconds', () => {
    expect(TOAST_DURATION_MS).toBe(4500);
  });

  it('lets a newer message outlive the older one’s timer', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.triggerToast('First'));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.triggerToast('Second'));
    expect(result.current.toastBanner).toBe('Second');

    // The first message's timer fires, but the banner has moved on, so it stays.
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.toastBanner).toBe('Second');
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toastBanner).toBeNull();
  });

  it('clears a repeated message on the first one’s timer', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.triggerToast('Same'));
    act(() => vi.advanceTimersByTime(3000));
    act(() => result.current.triggerToast('Same'));
    // The timers match on the text, so the first one clears the repeat too.
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.toastBanner).toBeNull();
  });
});
