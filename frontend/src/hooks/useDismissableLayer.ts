import type React from 'react';
import { useEffect, useRef } from 'react';

export interface UseDismissableLayerOptions {
  /** Whether the popover/menu is currently open. */
  open: boolean;
  /** Root element containing both the trigger and the floating layer. */
  rootRef: React.RefObject<HTMLElement | null>;
  /** Called on an outside `pointerdown` or an `Escape` keypress. */
  onDismiss: () => void;
  /** Optional element (usually the trigger) focused when dismissed via `Escape`. */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  /** Register `document` listeners in capture phase. Defaults to `false`. */
  capture?: boolean;
}

/**
 * Dismisses a floating popover or dropdown on an outside `pointerdown` or `Escape`
 * keypress, stopping `Escape` propagation and optionally restoring focus to its trigger.
 */
export function useDismissableLayer({
  open,
  rootRef,
  onDismiss,
  restoreFocusRef,
  capture = false,
}: UseDismissableLayerOptions): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onDismissRef.current();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismissRef.current();
        restoreFocusRef?.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, capture);
    document.addEventListener('keydown', handleKeyDown, capture);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, capture);
      document.removeEventListener('keydown', handleKeyDown, capture);
    };
  }, [open, capture, rootRef, restoreFocusRef]);
}
