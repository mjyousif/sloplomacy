import { useCallback, useEffect, useRef } from 'react';
import type { ConfirmOptions } from '../components/modal/ConfirmModal';
import type { GameState } from '../types/diplomacy';
import {
  buildBoardConflictConfirmOptions,
  hasLiveBoardDiverged,
} from '../utils/adminHelpers';

export interface UseBoardConflictPromptParams {
  directEditActive: boolean;
  isDirtyRef: React.RefObject<boolean>;
  committingRef: React.RefObject<boolean>;
  baseRevision: number;
  baseTurn: { season: string; year: number; phase: string };
  gameState: GameState | null;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  onReloadLatest: (latest: GameState) => void;
}

/**
 * Prompts the admin immediately over WebSocket (and on HTTP 409 fallback) when
 * the live board revision or turn advances while a dirty Edit Board draft is open.
 */
export function useBoardConflictPrompt({
  directEditActive,
  isDirtyRef,
  committingRef,
  baseRevision,
  baseTurn,
  gameState,
  confirm,
  onReloadLatest,
}: UseBoardConflictPromptParams) {
  const conflictPromptOpenRef = useRef(false);
  const promptedConflictRevRef = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const resetPromptedConflict = useCallback(() => {
    promptedConflictRevRef.current = null;
  }, []);

  const promptBoardConflictReload = useCallback(
    async (detail?: string) => {
      if (conflictPromptOpenRef.current) return;
      conflictPromptOpenRef.current = true;
      try {
        const shouldReload = await confirm(
          buildBoardConflictConfirmOptions(detail),
        );
        if (shouldReload && gameStateRef.current) {
          onReloadLatest(gameStateRef.current);
        }
      } finally {
        conflictPromptOpenRef.current = false;
      }
    },
    [confirm, onReloadLatest],
  );

  useEffect(() => {
    if (!directEditActive || !isDirtyRef.current || !gameState) {
      if (!directEditActive) {
        promptedConflictRevRef.current = null;
      }
      return;
    }
    if (!hasLiveBoardDiverged(gameState, baseRevision, baseTurn)) return;

    const liveRev = gameState.board_revision ?? gameState.state_revision ?? 1;
    if (!committingRef.current && promptedConflictRevRef.current !== liveRev) {
      promptedConflictRevRef.current = liveRev;
      void promptBoardConflictReload();
    }
  }, [
    baseRevision,
    baseTurn,
    committingRef,
    directEditActive,
    gameState,
    isDirtyRef,
    promptBoardConflictReload,
  ]);

  return { promptBoardConflictReload, resetPromptedConflict };
}
