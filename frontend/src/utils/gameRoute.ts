import type { ViewMode } from './viewMode';

/**
 * What the address bar asks for: a game by its link (`/game/<id>`), the Solo Sandbox
 * (`?view=sandbox` or `#sandbox`), or the lobby (anything else).
 */
export type GameRoute =
  | { kind: 'game'; gameId: string }
  | { kind: 'sandbox' }
  | { kind: 'lobby' };

const GAME_PATH = /^\/game\/([A-Za-z0-9_]+)\/?$/;

/**
 * Whether a game can be opened from a link. Only multiplayer matches (`mp_`) can: a solo
 * (`solo_`), saved (`saved_`) or private (`sbx_`) sandbox belongs to one player, and the
 * shared default board (`DEFAULT_GAME_ID`) has no lobby entry to open it by.
 */
export function isLinkableGameId(gameId: string): boolean {
  return gameId.startsWith('mp_');
}

/** Reads a location. A link to a game that cannot be linked is the lobby. */
export function parseGameRoute(loc: {
  pathname: string;
  search: string;
  hash: string;
}): GameRoute {
  const match = GAME_PATH.exec(loc.pathname);
  if (match && isLinkableGameId(match[1])) {
    return { kind: 'game', gameId: match[1] };
  }
  if (
    new URLSearchParams(loc.search).get('view') === 'sandbox' ||
    loc.hash === '#sandbox'
  ) {
    return { kind: 'sandbox' };
  }
  return { kind: 'lobby' };
}

/** The route of the page as loaded now. */
export function currentGameRoute(): GameRoute {
  if (typeof window === 'undefined') return { kind: 'lobby' };
  return parseGameRoute(window.location);
}

/**
 * The screen the app opens on: the Solo Sandbox for `?view=sandbox` or `#sandbox`, else the
 * lobby. A game link also starts in the lobby, and `useGameRoute` opens the game from there.
 */
export function initialViewMode(): ViewMode {
  return currentGameRoute().kind === 'sandbox' ? 'sandbox' : 'lobby';
}

/** The path a game's link points to. */
export function gamePath(gameId: string): string {
  return `/game/${gameId}`;
}

/** The full link to a game, to share. It never holds a passcode. */
export function gameLink(gameId: string): string {
  return `${window.location.origin}${gamePath(gameId)}`;
}

/**
 * The address the screen on show should have, or null to leave it as it is. A match is
 * its link; the lobby is `/`; a sandbox keeps a `?view=sandbox` address it was opened by
 * and is `/` otherwise, as a reload of a sandbox has always opened the lobby.
 */
export function urlFor(
  viewMode: ViewMode,
  activeGameId: string,
  current: GameRoute,
): string | null {
  if (viewMode === 'multiplayer' && isLinkableGameId(activeGameId)) {
    return gamePath(activeGameId);
  }
  if (viewMode === 'sandbox' && current.kind === 'sandbox') return null;
  return '/';
}
