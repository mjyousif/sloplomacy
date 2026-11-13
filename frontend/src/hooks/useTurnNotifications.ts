import { useEffect, useRef } from 'react';
import type {
  GameState,
  MultiplayerGameSummary,
  PhaseTimer,
  Power,
} from '../types/diplomacy';
import { getRequiredPowers } from '../utils/orderProgress';
import { playAttentionChime, setupAudioUnlock } from '../utils/soundEffects';
import { turnLabel } from '../utils/timerHelpers';

export const DEFAULT_DOCUMENT_TITLE =
  'Sloplomacy 1901 — Tactical Command & Pre-Move Atlas';

export interface TurnAttentionInput {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  gameState: GameState | null;
  activeGameSummary: MultiplayerGameSummary | null;
  lockedPower: Power | null;
  sandboxGameId: string | null;
  hypotheticalMatchTimer: PhaseTimer | null;
}

export interface TurnAttentionState {
  needsMove: boolean;
  needsVote: boolean;
}

/**
 * Determines whether the local player currently needs to submit orders or vote
 * on the phase timer in an active multiplayer match.
 */
export function computeTurnAttention({
  viewMode,
  gameState,
  activeGameSummary,
  lockedPower,
  sandboxGameId,
  hypotheticalMatchTimer,
}: TurnAttentionInput): TurnAttentionState {
  if (
    viewMode !== 'multiplayer' ||
    !lockedPower ||
    !gameState ||
    gameState.winner
  ) {
    return { needsMove: false, needsVote: false };
  }

  const effectiveTimer = sandboxGameId
    ? hypotheticalMatchTimer
    : (gameState.timer ?? null);

  const needsVote =
    !!effectiveTimer &&
    effectiveTimer.stage === 'voting' &&
    effectiveTimer.players.includes(lockedPower) &&
    !(lockedPower in effectiveTimer.votes);

  if (sandboxGameId) {
    return { needsMove: false, needsVote };
  }

  const isAdjustmentPhase =
    gameState.phase === 'Adjustments' || gameState.season === 'Winter';
  const isRetreatPhase = gameState.phase === 'Retreats';

  const requiredPowers = getRequiredPowers({
    isMultiplayer: true,
    participants: activeGameSummary?.participants,
    surrenderedPowers: gameState.surrendered_powers ?? [],
    isAdjustmentPhase,
    isRetreatPhase,
    builds: gameState.builds ?? null,
    retreats: gameState.retreats ?? null,
    units: gameState.units,
  });

  const needsMove =
    requiredPowers.includes(lockedPower) &&
    !gameState.finalized_powers.includes(lockedPower);

  return { needsMove, needsVote };
}

/** Builds the browser tab title reflecting the current board and attention state. */
export function formatDocumentTitle(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  gameState: GameState | null,
  attention: TurnAttentionState,
): string {
  if (viewMode === 'lobby' || !gameState) {
    return DEFAULT_DOCUMENT_TITLE;
  }

  const label = turnLabel(gameState);
  if (attention.needsMove && attention.needsVote) {
    return `● Your Move & Vote — ${label} · Sloplomacy`;
  }
  if (attention.needsMove) {
    return `● Your Move — ${label} · Sloplomacy`;
  }
  if (attention.needsVote) {
    return `● Vote Needed — ${label} · Sloplomacy`;
  }
  return `${label} · Sloplomacy`;
}

export interface UseTurnNotificationsOptions extends TurnAttentionInput {
  soundEnabled: boolean;
}

interface PreviousSnapshot {
  gameId: string;
  turnKey: string;
  timerStage: PhaseTimer['stage'] | null;
}

/**
 * Updates `document.title` when the player's attention is needed (orders or
 * timer vote) and plays a Web Audio chime when a new turn or vote begins while
 * the tab is in the background.
 */
export function useTurnNotifications({
  viewMode,
  gameState,
  activeGameSummary,
  lockedPower,
  sandboxGameId,
  hypotheticalMatchTimer,
  soundEnabled,
}: UseTurnNotificationsOptions): void {
  const attention = computeTurnAttention({
    viewMode,
    gameState,
    activeGameSummary,
    lockedPower,
    sandboxGameId,
    hypotheticalMatchTimer,
  });

  useEffect(() => setupAudioUnlock(), []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = formatDocumentTitle(viewMode, gameState, attention);
  }, [
    viewMode,
    gameState?.season,
    gameState?.year,
    gameState?.phase,
    attention.needsMove,
    attention.needsVote,
  ]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.title = DEFAULT_DOCUMENT_TITLE;
      }
    };
  }, []);

  const prevRef = useRef<PreviousSnapshot | null>(null);

  const effectiveTimer = sandboxGameId
    ? hypotheticalMatchTimer
    : (gameState?.timer ?? null);
  const currentGameId = gameState?.game_id ?? null;
  const currentTurnKey = gameState
    ? `${gameState.season}|${gameState.year}|${gameState.phase}`
    : null;
  const currentTimerStage = effectiveTimer?.stage ?? null;

  useEffect(() => {
    if (
      viewMode !== 'multiplayer' ||
      !currentGameId ||
      !currentTurnKey ||
      !lockedPower
    ) {
      prevRef.current = null;
      return;
    }

    const prev = prevRef.current;
    prevRef.current = {
      gameId: currentGameId,
      turnKey: currentTurnKey,
      timerStage: currentTimerStage,
    };

    if (!prev || prev.gameId !== currentGameId) {
      return;
    }

    const turnAdvanced = prev.turnKey !== currentTurnKey;
    const voteOpened =
      currentTimerStage === 'voting' && prev.timerStage !== 'voting';

    const shouldChimeForTurn = turnAdvanced && attention.needsMove;
    const shouldChimeForVote = voteOpened && attention.needsVote;

    if (
      soundEnabled &&
      typeof document !== 'undefined' &&
      document.hidden &&
      (shouldChimeForTurn || shouldChimeForVote)
    ) {
      void playAttentionChime(shouldChimeForTurn ? 'turn' : 'vote');
    }
  }, [
    viewMode,
    currentGameId,
    currentTurnKey,
    currentTimerStage,
    lockedPower,
    soundEnabled,
    attention.needsMove,
    attention.needsVote,
  ]);
}
