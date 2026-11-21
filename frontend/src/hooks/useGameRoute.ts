import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../lib/api';
import type {
  AuthUser,
  MultiplayerGameSummary,
  Power,
} from '../types/diplomacy';
import {
  currentGameRoute,
  type GameRoute,
  parseGameRoute,
  urlFor,
} from '../utils/gameRoute';
import { myPowerIn } from '../utils/heroGame';
import type { ViewMode } from '../utils/viewMode';
import { watchRefusal } from './useSpectate';

export interface GameRouteOptions {
  viewMode: ViewMode;
  activeGameId: string;
  authUser: AuthUser | null;
  /** The first read of who is signed in is done, so a link knows the player's seat. */
  authReady: boolean;
  matchPasscodes: Record<string, string>;
  /** Takes the player into a seat they hold: the lobby's resume path. */
  enterSeat: (gameId: string, power: Power) => Promise<void>;
  /** Opens a match to watch without a seat; rejects (after a toast) when it cannot be. */
  watchGame: (gameId: string) => Promise<void>;
  /** Leaves the board for the lobby, keeping any seat. False when the player stayed. */
  leaveToLobby: () => Promise<boolean>;
  /** Opens the Solo Sandbox. */
  openSandbox: () => Promise<void> | void;
  triggerToast: (msg: string) => void;
}

/** A private match whose link was opened with no passcode: Join with code asks for it. */
export interface PasscodeRequest {
  gameId: string;
}

type UrlWrite = 'push' | 'replace';

function writeUrl(path: string, how: UrlWrite) {
  const { pathname, search, hash } = window.location;
  if (pathname + search + hash === path) return;
  if (how === 'push') window.history.pushState(null, '', path);
  else window.history.replaceState(null, '', path);
}

/**
 * The address bar and the screen on show, kept together. A match is at `/game/<id>` and
 * the lobby at `/`, so a link opens a game, a reload stays in it and Back returns to the
 * lobby. Opening a link takes a player into a seat they hold, asks for a private match's
 * passcode through Join with code, and otherwise watches. The passcode never enters the
 * address. `?view=sandbox` and `#sandbox` still open the Solo Sandbox.
 */
export function useGameRoute(options: GameRouteOptions) {
  const { viewMode, activeGameId, authReady } = options;
  const latest = useRef(options);
  latest.current = options;

  const [initialRoute] = useState<GameRoute>(currentGameRoute);
  // While a link or a Back/Forward is being followed the screen is in between, so the
  // address is left alone; `finish` writes it once the screen has settled.
  const followingRef = useRef(initialRoute.kind === 'game');
  const nextWriteRef = useRef<UrlWrite>('replace');
  const navSeqRef = useRef(0);
  const [settled, setSettled] = useState(0);
  const [passcodeRequest, setPasscodeRequest] =
    useState<PasscodeRequest | null>(null);

  const finish = (seq: number, how: UrlWrite) => {
    if (seq !== navSeqRef.current) return;
    followingRef.current = false;
    nextWriteRef.current = how;
    setSettled((n) => n + 1);
  };

  /** Opens a match from its link. False when it could not be opened. */
  const openLink = async (gameId: string): Promise<boolean> => {
    const o = latest.current;
    let summary: MultiplayerGameSummary;
    try {
      const res = await fetch(
        `${API_BASE}/games/${encodeURIComponent(gameId)}`,
      );
      if (!res.ok) {
        o.triggerToast(watchRefusal(res.status));
        return false;
      }
      summary = await res.json();
    } catch {
      o.triggerToast('Could not reach the server to open this campaign.');
      return false;
    }
    if (summary.is_sandbox) {
      o.triggerToast('Only multiplayer campaigns can be opened from a link.');
      return false;
    }
    try {
      const seat = myPowerIn(summary, latest.current.authUser);
      if (seat) {
        await latest.current.enterSeat(gameId, seat);
      } else if (
        summary.has_passcode &&
        !latest.current.matchPasscodes[gameId]
      ) {
        setPasscodeRequest({ gameId });
      } else {
        await latest.current.watchGame(gameId);
      }
      return true;
    } catch {
      return false;
    }
  };

  // A link opened on load waits for the first read of who is signed in.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!authReady || startedRef.current) return;
    startedRef.current = true;
    if (initialRoute.kind !== 'game') return;
    const seq = ++navSeqRef.current;
    void openLink(initialRoute.gameId).then(() => finish(seq, 'replace'));
  }, [authReady]);

  // Back and Forward: the address has already changed, so the screen follows it.
  useEffect(() => {
    const onPopState = async () => {
      const seq = ++navSeqRef.current;
      followingRef.current = true;
      const route = parseGameRoute(window.location);
      const o = latest.current;
      if (route.kind === 'lobby') {
        const left = o.viewMode === 'lobby' || (await o.leaveToLobby());
        // Staying on the board puts its address back.
        finish(seq, left ? 'replace' : 'push');
        return;
      }
      if (route.kind === 'sandbox') {
        if (o.viewMode !== 'sandbox') await o.openSandbox();
        finish(seq, 'replace');
        return;
      }
      if (o.viewMode === 'multiplayer' && o.activeGameId === route.gameId) {
        finish(seq, 'replace');
        return;
      }
      // Another board is left through the lobby, which closes its private sandbox.
      if (o.viewMode !== 'lobby' && !(await o.leaveToLobby())) {
        finish(seq, 'push');
        return;
      }
      await openLink(route.gameId);
      finish(seq, 'replace');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Every other change of screen is a new page in the history.
  useEffect(() => {
    if (followingRef.current) return;
    const target = urlFor(viewMode, activeGameId, currentGameRoute());
    if (target !== null) writeUrl(target, nextWriteRef.current);
    nextWriteRef.current = 'push';
  }, [viewMode, activeGameId, settled]);

  return {
    /** A private match's link waiting on its passcode, for the lobby to ask. */
    passcodeRequest,
    clearPasscodeRequest: () => setPasscodeRequest(null),
  };
}
