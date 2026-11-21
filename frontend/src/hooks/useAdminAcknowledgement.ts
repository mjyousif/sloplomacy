import { useCallback, useMemo, useState } from 'react';
import type { AuthUser, GameState, Power } from '../types/diplomacy';
import {
  acknowledgeAdminEntriesRequest,
  getUnacknowledgedAdminEntries,
} from '../utils/adminHelpers';

export interface UseAdminAcknowledgementParams {
  activeGameId: string;
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  lockedPower: Power | null;
  gameState: GameState | null;
  authUser: AuthUser | null;
  onUpdateGameState: (newState: GameState) => void;
}

export function useAdminAcknowledgement({
  activeGameId,
  viewMode,
  lockedPower,
  gameState,
  authUser,
  onUpdateGameState,
}: UseAdminAcknowledgementParams) {
  const [acknowledgingAdminEntries, setAcknowledgingAdminEntries] =
    useState(false);

  const unacknowledgedAdminEntries = useMemo(
    () =>
      getUnacknowledgedAdminEntries(
        gameState?.admin_log,
        authUser,
        lockedPower,
        viewMode,
      ),
    [authUser, gameState?.admin_log, lockedPower, viewMode],
  );

  const handleAcknowledgeAdminEntries = useCallback(async () => {
    if (!gameState || unacknowledgedAdminEntries.length === 0) return;
    setAcknowledgingAdminEntries(true);
    try {
      const result = await acknowledgeAdminEntriesRequest(
        activeGameId,
        unacknowledgedAdminEntries.map((e) => e.id),
        authUser,
        lockedPower,
      );
      if (result?.ok) {
        const ackedIds = new Set(unacknowledgedAdminEntries.map((e) => e.id));
        const viewerTokens = [
          result.acknowledged_by,
          authUser?.id,
          lockedPower,
          !authUser && !lockedPower ? 'guest' : null,
        ].filter((t): t is string => Boolean(t));
        onUpdateGameState({
          ...gameState,
          admin_log: (gameState.admin_log ?? []).map((entry) =>
            ackedIds.has(entry.id)
              ? {
                  ...entry,
                  acknowledged_by: Array.from(
                    new Set([
                      ...(entry.acknowledged_by ?? []),
                      ...viewerTokens,
                    ]),
                  ),
                }
              : entry,
          ),
        });
      }
    } finally {
      setAcknowledgingAdminEntries(false);
    }
  }, [
    activeGameId,
    authUser,
    gameState,
    lockedPower,
    onUpdateGameState,
    unacknowledgedAdminEntries,
  ]);

  return {
    unacknowledgedAdminEntries,
    acknowledgingAdminEntries,
    handleAcknowledgeAdminEntries,
  };
}
