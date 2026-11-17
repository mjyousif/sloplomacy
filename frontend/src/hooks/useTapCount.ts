import { useCallback, useRef } from 'react';

/**
 * Returns a click handler that calls `onTrigger` after `count` clicks with no more than
 * `windowMs` between one and the next, then starts over. A slower click starts a new run.
 */
export function useTapCount(
  onTrigger: () => void,
  count = 3,
  windowMs = 1500,
): () => void {
  const taps = useRef(0);
  const last = useRef(0);

  return useCallback(() => {
    const now = Date.now();
    taps.current = now - last.current <= windowMs ? taps.current + 1 : 1;
    last.current = now;
    if (taps.current >= count) {
      taps.current = 0;
      onTrigger();
    }
  }, [onTrigger, count, windowMs]);
}
