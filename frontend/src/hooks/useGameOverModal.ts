import { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../lib/supabase';
import type {
  AuthUser,
  GameState,
  MultiplayerGameSummary,
  Power,
} from '../types/diplomacy';
import { getMyParticipant } from '../utils/gameOverHelpers';

export interface UseGameOverModalOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId: string;
  gameState: GameState | null;
  activeGameSummary: MultiplayerGameSummary | null;
  authUser: AuthUser | null;
  onSummaryUpdated?: (summary: MultiplayerGameSummary) => void;
}

export function useGameOverModal({
  viewMode,
  activeGameId,
  gameState,
  activeGameSummary,
  authUser,
  onSummaryUpdated,
}: UseGameOverModalOptions) {
  const [gameOverModalOpen, setGameOverModalOpen] = useState(false);

  const prevGameRef = useRef<{ gameId: string; winner: Power | null }>({
    gameId: activeGameId,
    winner: gameState?.winner ?? null,
  });
  const autoShownGamesRef = useRef<Set<string>>(new Set());
  const ackedGamesRef = useRef<Set<string>>(new Set());

  const acknowledgeIfNeeded = async (gid: string) => {
    if (ackedGamesRef.current.has(gid)) return;
    const participant = getMyParticipant(activeGameSummary, authUser);
    if (!participant || participant.game_over_seen_at) return;

    ackedGamesRef.current.add(gid);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `/api/games/${encodeURIComponent(gid)}/acknowledge-game-over`,
        {
          method: 'POST',
          headers: { ...authHeaders },
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          summary?: MultiplayerGameSummary;
        };
        if (data.summary && onSummaryUpdated) {
          onSummaryUpdated(data.summary);
        }
      } else {
        ackedGamesRef.current.delete(gid);
      }
    } catch {
      ackedGamesRef.current.delete(gid);
    }
  };

  useEffect(() => {
    if (viewMode === 'lobby') {
      setGameOverModalOpen(false);
      prevGameRef.current = { gameId: activeGameId, winner: null };
      return;
    }

    const currentWinner = gameState?.winner ?? null;
    const prev = prevGameRef.current;
    const sameGame = prev.gameId === activeGameId;
    const justWon = sameGame && !prev.winner && Boolean(currentWinner);

    prevGameRef.current = { gameId: activeGameId, winner: currentWinner };

    if (!currentWinner) {
      setGameOverModalOpen(false);
      return;
    }

    const myParticipant =
      viewMode === 'multiplayer'
        ? getMyParticipant(activeGameSummary, authUser)
        : null;
    const unwitnessedParticipant = Boolean(
      myParticipant && !myParticipant.game_over_seen_at,
    );

    if (
      justWon ||
      (unwitnessedParticipant && !autoShownGamesRef.current.has(activeGameId))
    ) {
      autoShownGamesRef.current.add(activeGameId);
      setGameOverModalOpen(true);
      if (viewMode === 'multiplayer') {
        void acknowledgeIfNeeded(activeGameId);
      }
    }
  }, [viewMode, activeGameId, gameState?.winner, activeGameSummary, authUser]);

  const openGameOverModal = () => {
    setGameOverModalOpen(true);
    if (viewMode === 'multiplayer') {
      void acknowledgeIfNeeded(activeGameId);
    }
  };

  const closeGameOverModal = () => {
    setGameOverModalOpen(false);
    if (viewMode === 'multiplayer') {
      void acknowledgeIfNeeded(activeGameId);
    }
  };

  return {
    gameOverModalOpen,
    openGameOverModal,
    closeGameOverModal,
  };
}
