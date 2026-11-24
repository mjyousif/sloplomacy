import type React from 'react';
import { useEffect, useRef } from 'react';

export interface UseOverlayFocusEscapeOptions {
  /** Whether the overlay is currently open. */
  open: boolean;
  /** Element focused when the overlay opens (typically its close button). */
  focusRef: React.RefObject<HTMLElement | null>;
  /** Called when `Escape` is pressed while open. */
  onClose?: () => void;
}

/**
 * Focuses an overlay's close control on open and dismisses it on `Escape`.
 */
export function useOverlayFocusEscape({
  open,
  focusRef,
  onClose,
}: UseOverlayFocusEscapeOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    focusRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, focusRef]);
}
