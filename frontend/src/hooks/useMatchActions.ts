import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiFetch, readErrorDetail } from '../lib/api';
import { suggestionStore } from '../lib/suggestionStore';
import {
  type FinalizeResponse,
  type GameState,
  type Order,
  type PhaseTimer,
  POWER_METADATA,
  type Power,
  type ValidationIssue,
} from '../types/diplomacy';
import { turnLabel } from '../utils/timerHelpers';

export interface MatchActionsOptions {
  viewMode: 'lobby' | 'sandbox' | 'multiplayer';
  activeGameId: string;
  /** The seat this player holds in a multiplayer match. */
  lockedPower: Power | null;
  gameState: GameState | null;
  playerPower: Power;
  /** The host's Direct-Edit, on and in this game. */
  directEditActive: boolean;
  /** From `useSandboxSession`. */
  sandboxMode: boolean;
  sandboxGameId: string | null;
  draftGameId: string;
  requireRealBoard: (action: string) => boolean;
  setHypotheticalMatchTimer: Dispatch<SetStateAction<PhaseTimer | null>>;
  triggerToast: (msg: string) => void;
  setSelectedUnitId: Dispatch<SetStateAction<string | null>>;
  /** From `useGameSession`. */
  applyServerState: (st: GameState) => void;
  beginOptimisticOrder?: (gameId: string, order: Order) => number | null;
  settleOptimisticOrder?: (seq: number | null, serverState?: GameState) => void;
  clearPendingOrders?: () => void;
  fetchGamesList: () => Promise<void>;
}

/**
 * What a player does in a match: send an order, confirm every order, finalize (through the
 * Sanity Check modal when the orders have problems) and unlock again, resolve the turn, and
 * the turn clock's buttons. Orders update optimistically on the client while the server
 * validates, persists, and returns the authoritative board.
 */
export function useMatchActions({
  viewMode,
  activeGameId,
  lockedPower,
  gameState,
  playerPower,
  directEditActive,
  sandboxMode,
  sandboxGameId,
  draftGameId,
  requireRealBoard,
  setHypotheticalMatchTimer,
  triggerToast,
  setSelectedUnitId,
  applyServerState,
  beginOptimisticOrder,
  settleOptimisticOrder,
  clearPendingOrders,
  fetchGamesList,
}: MatchActionsOptions) {
  // Sanity Check Modal State
  const [sanityModalOpen, setSanityModalOpen] = useState<boolean>(false);
  const [sanityModalIssues, setSanityModalIssues] = useState<ValidationIssue[]>(
    [],
  );

  const handleUpdateOrder = async (order: Order) => {
    // In multiplayer mode without Sandbox Pre-Move active, only allow ordering own power's units
    if (
      viewMode === 'multiplayer' &&
      lockedPower &&
      !sandboxMode &&
      !directEditActive &&
      order.power !== lockedPower
    ) {
      triggerToast(
        `Enable "Sandbox Pre-Moves" to plot hypothetical orders for foreign powers.`,
      );
      return;
    }
    const targetGameId = draftGameId;
    const optimisticSeq = beginOptimisticOrder?.(targetGameId, order) ?? null;
    try {
      const res = await apiFetch('/order', {
        method: 'POST',
        query: { game_id: targetGameId },
        json: {
          order,
          turn: gameState ? turnLabel(gameState) : undefined,
        },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        if (settleOptimisticOrder) {
          settleOptimisticOrder(optimisticSeq, st);
        } else {
          applyServerState(st);
        }
      } else {
        settleOptimisticOrder?.(optimisticSeq);
        triggerToast(
          await readErrorDetail(res, 'That order was not accepted.'),
        );
      }
    } catch (e) {
      settleOptimisticOrder?.(optimisticSeq);
      console.error(e);
    }
  };

  // Taking a move suggestion from press: the player's own part of it replaces those units'
  // orders in one all-or-nothing batch. The Press section reaches this through the store.
  const adoptOrders = async (orders: Order[]): Promise<string | null> => {
    if (!gameState || !lockedPower || orders.length === 0) {
      return 'There are no orders here for your units.';
    }
    if (!requireRealBoard('use suggested orders'))
      return 'Leave Hypothetical Mode first.';
    try {
      const res = await apiFetch('/orders/batch', {
        method: 'POST',
        query: { game_id: activeGameId },
        json: {
          power: lockedPower,
          orders,
          turn: turnLabel(gameState),
        },
      });
      if (!res.ok) {
        return readErrorDetail(res, 'Those orders were not accepted.');
      }
      clearPendingOrders?.();
      applyServerState(await res.json());
      setSelectedUnitId(null);
      triggerToast(
        `Suggested orders copied to ${orders.length} of your units. Review them, then finalize.`,
      );
      return null;
    } catch (e) {
      console.error(e);
      return 'Those orders could not be sent.';
    }
  };
  const adoptRef = useRef(adoptOrders);
  adoptRef.current = adoptOrders;
  useEffect(() => {
    suggestionStore.setAdopter((orders) => adoptRef.current(orders));
    return () => suggestionStore.setAdopter(null);
  }, []);

  // Using a Spring 1901 opening from the order panel: its orders replace those units' orders in
  // one batch, on the board being played (a sandbox's own copy included). Nothing is finalized.
  const applyOpening = async (
    power: Power,
    orders: Order[],
  ): Promise<string | null> => {
    if (!gameState || orders.length === 0) return 'There are no orders here.';
    try {
      const res = await apiFetch('/orders/batch', {
        method: 'POST',
        query: { game_id: draftGameId },
        json: { power, orders, turn: turnLabel(gameState) },
      });
      if (!res.ok) {
        return readErrorDetail(res, 'Those orders were not accepted.');
      }
      clearPendingOrders?.();
      applyServerState(await res.json());
      setSelectedUnitId(null);
      triggerToast('Opening orders filled in. Review them, then finalize.');
      return null;
    } catch (e) {
      console.error(e);
      return 'Those orders could not be sent.';
    }
  };
  const applyOpeningRef = useRef(applyOpening);
  applyOpeningRef.current = applyOpening;
  useEffect(() => {
    suggestionStore.setOpeningApplier((power, orders) =>
      applyOpeningRef.current(power, orders),
    );
    return () => suggestionStore.setOpeningApplier(null);
  }, []);

  const handleClearAllOrders = async () => {
    if (!gameState) return;
    try {
      const res = await apiFetch('/orders/clear-all', {
        method: 'POST',
        query: { game_id: draftGameId },
        json: { power: playerPower },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        clearPendingOrders?.();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          `Cleared all orders for ${POWER_METADATA[playerPower].shortName}.`,
        );
      } else {
        triggerToast(
          await readErrorDetail(res, 'Orders could not be cleared.'),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalizeClick = async (force = false) => {
    if (!gameState || !requireRealBoard('finalize your real orders')) return;
    try {
      const res = await apiFetch('/finalize', {
        method: 'POST',
        query: { game_id: activeGameId },
        json: {
          power: playerPower,
          force,
          turn: turnLabel(gameState),
        },
      });
      if (res.ok) {
        const data: FinalizeResponse = await res.json();
        applyServerState(data.state);
        if (data.requires_confirmation) {
          setSanityModalIssues(data.issues);
          setSanityModalOpen(true);
        } else {
          setSanityModalOpen(false);
          triggerToast(
            `${POWER_METADATA[playerPower].name} orders locked & finalized!`,
          );
          fetchGamesList();
        }
      } else {
        // The clock can resolve the phase while the request is on its way.
        setSanityModalOpen(false);
        triggerToast(
          await readErrorDetail(res, 'Could not finalize your orders.'),
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfinalizeClick = async () => {
    if (!gameState || !requireRealBoard('unlock your real orders')) return;
    try {
      const res = await apiFetch('/unfinalize', {
        method: 'POST',
        query: { game_id: activeGameId },
        json: { power: playerPower },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        triggerToast('Orders unlocked for editing.');
        fetchGamesList();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const postTimerAction = async (
    action: 'start' | 'vote' | 'extend' | 'ready',
    body: Record<string, unknown> = {},
  ) => {
    try {
      const res = await apiFetch(
        `/games/${encodeURIComponent(activeGameId)}/timer/${action}`,
        {
          method: 'POST',
          json: body,
        },
      );
      if (!res.ok) {
        triggerToast(
          await readErrorDetail(res, 'The clock did not accept that.'),
        );
        return;
      }
      const st: GameState = await res.json();
      if (sandboxGameId) {
        setHypotheticalMatchTimer(st.timer ?? null);
      } else {
        applyServerState(st);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // A double-click must not resolve two phases: the second click waits for the first, and the
  // server refuses a turn that has already resolved.
  const adjudicatingRef = useRef(false);
  const handleAdjudicateTurn = async () => {
    if (!gameState || adjudicatingRef.current) return;
    if (!sandboxMode && !requireRealBoard('resolve the real turn')) return;
    adjudicatingRef.current = true;
    try {
      const targetGameId = sandboxMode ? draftGameId : activeGameId;
      const res = await apiFetch('/adjudicate', {
        method: 'POST',
        query: {
          game_id: targetGameId,
          turn: turnLabel(gameState),
        },
      });
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          st.winner
            ? `${POWER_METADATA[st.winner].name} has won the game!`
            : sandboxGameId
              ? `Hypothetical turn stepped to ${st.season} ${st.year} (${st.phase} Phase).`
              : `Turn resolved! Now in ${st.season} ${st.year} (${st.phase} Phase).`,
        );
        if (!sandboxGameId) {
          fetchGamesList();
        }
      } else {
        triggerToast(await readErrorDetail(res, 'Could not resolve the turn.'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      adjudicatingRef.current = false;
    }
  };

  return {
    sanityModalOpen,
    setSanityModalOpen,
    sanityModalIssues,
    handleUpdateOrder,
    handleClearAllOrders,
    handleFinalizeClick,
    handleUnfinalizeClick,
    postTimerAction,
    handleAdjudicateTurn,
  };
}
