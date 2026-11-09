// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../types/diplomacy';
import {
  DEFAULT_DISPLAY_PREFS,
  type DisplayPrefs,
} from '../utils/displayPrefs';
import { useDisplayPrefs } from './useDisplayPrefs';

const supabase = vi.hoisted(() => ({
  fetchAccountDisplayPrefs: vi.fn(),
  saveAccountDisplayPrefs: vi.fn(),
}));
vi.mock('../lib/supabase', () => supabase);

const STORAGE_KEY = 'diplomacy_1901_display_prefs';
const ALICE: AuthUser = {
  id: 'user-alice',
  email: 'alice@example.test',
  displayName: 'Alice',
};
const FLAGS: DisplayPrefs = { pieceStyle: 'flags', unitMark: 'nato' };
const SEATED: DisplayPrefs = { pieceStyle: 'seated', unitMark: 'letters' };

/** A promise the test settles by hand, to hold an account read open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const storedPrefs = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

beforeEach(() => {
  localStorage.clear();
  supabase.fetchAccountDisplayPrefs.mockReset();
  supabase.saveAccountDisplayPrefs.mockReset();
  supabase.saveAccountDisplayPrefs.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDisplayPrefs for a guest', () => {
  it('starts on the defaults when nothing was chosen on this device', () => {
    const { result } = renderHook(() => useDisplayPrefs(null));
    expect(result.current.prefs).toEqual(DEFAULT_DISPLAY_PREFS);
    expect(result.current.saveState).toBe('device');
  });

  it("starts on this device's saved choice", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FLAGS));
    const { result } = renderHook(() => useDisplayPrefs(null));
    expect(result.current.prefs).toEqual(FLAGS);
  });

  it('replaces an edited or corrupt saved value setting by setting', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pieceStyle: '3d', unitMark: 'nato' }),
    );
    const { result } = renderHook(() => useDisplayPrefs(null));
    expect(result.current.prefs).toEqual({
      pieceStyle: DEFAULT_DISPLAY_PREFS.pieceStyle,
      unitMark: 'nato',
    });
  });

  it('applies a change at once, saves it on the device and never on an account', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDisplayPrefs(null));
    act(() => result.current.updatePrefs({ pieceStyle: 'compact' }));
    expect(result.current.prefs.pieceStyle).toBe('compact');
    expect(storedPrefs()).toEqual({
      ...DEFAULT_DISPLAY_PREFS,
      pieceStyle: 'compact',
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(supabase.saveAccountDisplayPrefs).not.toHaveBeenCalled();
    expect(supabase.fetchAccountDisplayPrefs).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe('device');
  });
});

describe('useDisplayPrefs for a signed-in player', () => {
  it("applies the account's choice and keeps a copy on the device", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FLAGS));
    supabase.fetchAccountDisplayPrefs.mockResolvedValue({
      prefs: SEATED,
      error: null,
    });
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    expect(result.current.saveState).toBe('saving');
    await waitFor(() => expect(result.current.saveState).toBe('account'));
    expect(supabase.fetchAccountDisplayPrefs).toHaveBeenCalledWith(ALICE);
    expect(result.current.prefs).toEqual(SEATED);
    expect(storedPrefs()).toEqual(SEATED);
    expect(supabase.saveAccountDisplayPrefs).not.toHaveBeenCalled();
  });

  it("uploads this device's choice to an account that has none", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FLAGS));
    supabase.fetchAccountDisplayPrefs.mockResolvedValue({
      prefs: null,
      error: null,
    });
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    await waitFor(() => expect(result.current.saveState).toBe('account'));
    expect(supabase.saveAccountDisplayPrefs).toHaveBeenCalledWith(ALICE, FLAGS);
    expect(result.current.prefs).toEqual(FLAGS);
  });

  it('treats a failed account read as unknown, so nothing is overwritten', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FLAGS));
    supabase.fetchAccountDisplayPrefs.mockResolvedValue({
      prefs: null,
      error: 'network down',
    });
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    await waitFor(() => expect(result.current.saveState).toBe('failed'));
    expect(supabase.saveAccountDisplayPrefs).not.toHaveBeenCalled();
    expect(result.current.prefs).toEqual(FLAGS);
  });

  it('keeps a change made while the account was being read, and uploads it', async () => {
    const read = deferred<{ prefs: unknown; error: string | null }>();
    supabase.fetchAccountDisplayPrefs.mockReturnValue(read.promise);
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    act(() => result.current.updatePrefs({ unitMark: 'vehicles' }));
    await act(async () => read.resolve({ prefs: SEATED, error: null }));
    expect(result.current.prefs).toEqual({
      ...DEFAULT_DISPLAY_PREFS,
      unitMark: 'vehicles',
    });
    expect(supabase.saveAccountDisplayPrefs).toHaveBeenCalledWith(ALICE, {
      ...DEFAULT_DISPLAY_PREFS,
      unitMark: 'vehicles',
    });
  });

  it('saves a burst of changes to the account once, after a short pause', async () => {
    supabase.fetchAccountDisplayPrefs.mockResolvedValue({
      prefs: SEATED,
      error: null,
    });
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    await waitFor(() => expect(result.current.saveState).toBe('account'));

    vi.useFakeTimers();
    act(() => result.current.updatePrefs({ pieceStyle: 'flags' }));
    act(() => result.current.updatePrefs({ unitMark: 'nato' }));
    expect(result.current.saveState).toBe('saving');
    expect(storedPrefs()).toEqual(FLAGS);
    act(() => {
      vi.advanceTimersByTime(599);
    });
    expect(supabase.saveAccountDisplayPrefs).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(supabase.saveAccountDisplayPrefs).toHaveBeenCalledTimes(1);
    expect(supabase.saveAccountDisplayPrefs).toHaveBeenCalledWith(ALICE, FLAGS);
    expect(result.current.saveState).toBe('account');
  });

  it('says the account save failed when it did', async () => {
    supabase.fetchAccountDisplayPrefs.mockResolvedValue({
      prefs: SEATED,
      error: null,
    });
    supabase.saveAccountDisplayPrefs.mockResolvedValue({ error: 'denied' });
    const { result } = renderHook(() => useDisplayPrefs(ALICE));
    await waitFor(() => expect(result.current.saveState).toBe('account'));

    vi.useFakeTimers();
    act(() => result.current.updatePrefs({ pieceStyle: 'compact' }));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.saveState).toBe('failed');
    // The change still applies on this device.
    expect(result.current.prefs.pieceStyle).toBe('compact');
  });
});
