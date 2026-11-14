import { type Dispatch, type SetStateAction, useRef, useState } from 'react';
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

const API_BASE = '/api';

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
  fetchGamesList: () => Promise<void>;
}

/**
 * What a player does in a match: send an order, confirm every order, finalize (through the
 * Sanity Check modal when the orders have problems) and unlock again, resolve the turn, and
 * the turn clock's buttons. Every order goes straight to the server, which sends the board back.
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
    try {
      const res = await authedFetch(
        `${API_BASE}/order?game_id=${encodeURIComponent(draftGameId)}`,
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
        applyServerState(st);
      } else {
        const err = await res.json().catch(() => ({}));
        triggerToast(err.detail || 'That order was not accepted.');
      }
    } catch (e) {
      console.error(e);
    }
  };

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
    if (!requireRealBoard('resolve the real turn')) return;
    adjudicatingRef.current = true;
    try {
      const turn = encodeURIComponent(turnLabel(gameState));
      const res = await authedFetch(
        `${API_BASE}/adjudicate?game_id=${encodeURIComponent(activeGameId)}&turn=${turn}`,
        { method: 'POST' },
      );
      if (res.ok) {
        const st: GameState = await res.json();
        applyServerState(st);
        setSelectedUnitId(null);
        triggerToast(
          st.winner
            ? `${POWER_METADATA[st.winner].name} has won the game!`
            : `Turn resolved! Now in ${st.season} ${st.year} (${st.phase} Phase).`,
        );
        fetchGamesList();
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
