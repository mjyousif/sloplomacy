import { useSyncExternalStore } from 'react';

/**
 * The one breakpoint for the phone layout. Narrow screens match the first part, and phones
 * held sideways match the second, because they are wide but very short.
 *
 * App puts the answer on the shell as `data-layout="compact"`, and every phone style in
 * `styles/compact/` keys off that attribute instead of its own `@media` rule, so this constant
 * is the only place the breakpoint is written down.
 */
export const COMPACT_LAYOUT_QUERY = '(max-width: 767px), (max-height: 500px)';

function getMediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return null;
  return window.matchMedia(COMPACT_LAYOUT_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = getMediaQuery();
  if (!query) return () => {};
  // Safari before 14 only has the older listener methods.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function getSnapshot(): boolean {
  return getMediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True while the screen is phone-sized. Follows rotation and window resizes. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
