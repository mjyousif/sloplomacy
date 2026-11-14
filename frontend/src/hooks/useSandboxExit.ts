import { type Dispatch, type SetStateAction, useEffect } from 'react';
import { exitSandboxMode } from '../api';
import type { Power } from '../types/diplomacy';

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
    exitSandboxMode({
      query: { game_id: sandboxGameId },
      body: { power: playerPower },
    }).catch(() => {});
    setSandboxGameId(null);
    setSandboxMode(false);
    setShowSimulationOverlay(false);
  }, [viewMode, sandboxGameId]);
}
