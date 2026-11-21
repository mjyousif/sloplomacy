// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCopyFeedback } from './useCopyFeedback';

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
  });
}

function setExecCommand(impl: ((cmd: string) => boolean) | undefined) {
  Object.defineProperty(document, 'execCommand', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

describe('useCopyFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setClipboard(undefined);
    setExecCommand(undefined);
  });

  it('says copied only once the clipboard accepted the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const { result } = renderHook(() => useCopyFeedback());

    await act(async () => {
      await result.current.copy('hello', 'link');
    });

    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe('link');
    expect(result.current.failed).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.copied).toBeNull();
  });

  it('reports a failure when the clipboard rejects and nothing else can copy', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    setExecCommand(() => false);
    const { result } = renderHook(() => useCopyFeedback());

    await act(async () => {
      await result.current.copy('hello', 'pw');
    });

    expect(result.current.copied).toBeNull();
    expect(result.current.failed).toBe('pw');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.failed).toBeNull();
  });

  it('reports a failure when there is no clipboard (plain http) and no fallback', async () => {
    setClipboard(undefined);
    setExecCommand(undefined);
    const { result } = renderHook(() => useCopyFeedback());

    await act(async () => {
      await result.current.copy('hello', 'gid');
    });

    expect(result.current.copied).toBeNull();
    expect(result.current.failed).toBe('gid');
  });

  it('falls back to the legacy copy command where the clipboard is missing', async () => {
    setClipboard(undefined);
    const execCommand = vi.fn().mockReturnValue(true);
    setExecCommand(execCommand);
    const { result } = renderHook(() => useCopyFeedback());

    await act(async () => {
      await result.current.copy('hello', 'link');
    });

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(result.current.copied).toBe('link');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
