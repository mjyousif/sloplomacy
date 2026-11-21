import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { API_BASE } from '../lib/api';
import { suggestionStore } from '../lib/suggestionStore';
import { authedFetch } from '../lib/supabase';
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
      const res = await authedFetch(
        `${API_BASE}/order?game_id=${encodeURIComponent(targetGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order,
            turn: gameState ? turnLabel(gameState) : undefined,
          }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        if (settleOptimisticOrder) {
          settleOptimisticOrder(optimisticSeq, st);
        } else {
          applyServerState(st);
        }
      } else {
        settleOptimisticOrder?.(optimisticSeq);
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'That order was not accepted.');
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
      const res = await authedFetch(
        `${API_BASE}/orders/batch?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power: lockedPower,
            orders,
            turn: turnLabel(gameState),
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return err.detail || 'Those orders were not accepted.';
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

  const handleClearAllOrders = async () => {
    if (!gameState) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/orders/clear-all?game_id=${encodeURIComponent(draftGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        clearPendingOrders?.();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          `Cleared all orders for ${POWER_METADATA[playerPower].shortName}.`,
        );
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Orders could not be cleared.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFinalizeClick = async (force = false) => {
    if (!gameState || !requireRealBoard('finalize your real orders')) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/finalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            power: playerPower,
            force,
            turn: turnLabel(gameState),
          }),
        },
      );
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
        const err = await res.json().catch(() => ({}));
        setSanityModalOpen(false);
        triggerToast(err.detail || 'Could not finalize your orders.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnfinalizeClick = async () => {
    if (!gameState || !requireRealBoard('unlock your real orders')) return;
    try {
      const res = await authedFetch(
        `${API_BASE}/unfinalize?game_id=${encodeURIComponent(activeGameId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ power: playerPower }),
        },
      );
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
      const res = await authedFetch(
        `${API_BASE}/games/${encodeURIComponent(activeGameId)}/timer/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'The clock did not accept that.');
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
      const turn = encodeURIComponent(turnLabel(gameState));
      const targetGameId = sandboxMode ? draftGameId : activeGameId;
      const res = await authedFetch(
        `${API_BASE}/adjudicate?game_id=${encodeURIComponent(targetGameId)}&turn=${turn}`,
        { method: 'POST' },
      );
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
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'Could not resolve the turn.');
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
