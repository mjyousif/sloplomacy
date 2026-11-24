// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resolveMapHudDismiss, useMapHudEscape } from './useMapHudEscape';

describe('useMapHudEscape', () => {
  it('calls onDismiss on Escape when active and ignores other keys', () => {
    const onDismiss = vi.fn();
    renderHook(() => useMapHudEscape(onDismiss));

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not fire when null or when a higher-priority layer stops propagation', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderHook(
      ({ handler }: { handler: (() => void) | null }) =>
        useMapHudEscape(handler),
      { initialProps: { handler: null as (() => void) | null } },
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();

    rerender({ handler: onDismiss });

    const captureBlocker = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation();
    };
    window.addEventListener('keydown', captureBlocker, true);
    try {
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', captureBlocker, true);
    }

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('prioritizes CoastPicker over Unit/BuildMenu and Direct-Edit coast choice in direct edit', () => {
    const cancelDirect = vi.fn();
    const cancelCoast = vi.fn();
    const clearSel = vi.fn();

    expect(
      resolveMapHudDismiss({
        directEditActive: true,
        hasDirectEditCoastChoice: true,
        onCancelDirectEditCoast: cancelDirect,
        hasCoastChoice: true,
        onCancelCoast: cancelCoast,
        hasUnitOrBuildMenu: true,
        onClearSelection: clearSel,
      }),
    ).toBe(cancelDirect);

    expect(
      resolveMapHudDismiss({
        directEditActive: true,
        hasDirectEditCoastChoice: false,
        onCancelDirectEditCoast: cancelDirect,
        hasCoastChoice: true,
        onCancelCoast: cancelCoast,
        hasUnitOrBuildMenu: true,
        onClearSelection: clearSel,
      }),
    ).toBeNull();

    expect(
      resolveMapHudDismiss({
        directEditActive: false,
        hasDirectEditCoastChoice: false,
        onCancelDirectEditCoast: cancelDirect,
        hasCoastChoice: true,
        onCancelCoast: cancelCoast,
        hasUnitOrBuildMenu: true,
        onClearSelection: clearSel,
      }),
    ).toBe(cancelCoast);

    expect(
      resolveMapHudDismiss({
        directEditActive: false,
        hasDirectEditCoastChoice: false,
        onCancelDirectEditCoast: cancelDirect,
        hasCoastChoice: false,
        onCancelCoast: cancelCoast,
        hasUnitOrBuildMenu: true,
        onClearSelection: clearSel,
      }),
    ).toBe(clearSel);
  });
});
