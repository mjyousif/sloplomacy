export type ViewMode = 'lobby' | 'sandbox' | 'multiplayer';

/** The screen the app opens on: the Solo Sandbox for `?view=sandbox` or `#sandbox`, else the lobby. */
export function initialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'lobby';
  return new URLSearchParams(window.location.search).get('view') ===
    'sandbox' || window.location.hash === '#sandbox'
    ? 'sandbox'
    : 'lobby';
}
