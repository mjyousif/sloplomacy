import { type Dispatch, type SetStateAction, useEffect } from 'react';
import { authedFetch } from '../lib/supabase';
import type { Power } from '../types/diplomacy';

const API_BASE = '/api';

export interface SandboxExitOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  /** From `useSandboxSession`: the private copy's id while the player is in one. */
  sandboxGameId: string | null;
  playerPower: Power;
  setSandboxGameId: Dispatch<SetStateAction<string | null>>;
  setSandboxMode: Dispatch<SetStateAction<boolean>>;
  setShowSimulationOverlay: Dispatch<SetStateAction<boolean>>;
}

/**
 * Closes a multiplayer match's private sandbox copy once the player leaves the match board,
 * whichever way they leave. The server carries the player's own changed orders back.
 */
export function useSandboxExit({
  viewMode,
  sandboxGameId,
  playerPower,
  setSandboxGameId,
  setSandboxMode,
  setShowSimulationOverlay,
}: SandboxExitOptions) {
  // Leaving the match board by any route closes its private sandbox.
  useEffect(() => {
    if (!sandboxGameId || viewMode === 'multiplayer') return;
    authedFetch(
      `${API_BASE}/sandbox/exit?game_id=${encodeURIComponent(sandboxGameId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ power: playerPower }),
      },
    ).catch(() => {});
    setSandboxGameId(null);
    setSandboxMode(false);
    setShowSimulationOverlay(false);
  }, [viewMode, sandboxGameId]);
}
