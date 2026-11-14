import { useCallback, useEffect, useRef, useState } from 'react';
import { getTurnRecordJson, listTurnHistoryJson } from '../api';
import type { Power, TurnHistoryEntry, TurnRecord } from '../types/diplomacy';
import { sameTurn, stepTurn } from '../utils/historyHelpers';

interface UseTurnHistoryOptions {
  /** The real game, never a private sandbox copy: the server keeps no shared history for those. */
  gameId: string;
  /** Changes whenever the live turn does, which is when a new phase joins the history. */
  liveTurnKey: string;
  /** For a private match this player is not seated in. */
  passcode: string | null;
  /** False in the lobby, where there is no game to look back on. */
  enabled: boolean;
}

export interface TurnHistory {
  entries: TurnHistoryEntry[];
  /** The past turn being looked at, or null for the live turn. */
  viewIndex: number | null;
  /** The record for `viewIndex` once it has arrived. */
  turn: TurnRecord | null;
  /** The nation chip: only this power's orders are drawn. Null draws everyone's. */
  power: Power | null;
  select: (index: number | null) => void;
  step: (delta: -1 | 1) => void;
  setPower: (power: Power | null) => void;
  goLive: () => void;
}

function historyHeaders(passcode: string | null): Record<string, string> {
  return passcode ? { 'X-Passcode': passcode } : {};
}

/**
 * The turn selector's state: the game's resolved phases, which one is being looked at, and its
 * record. Records are cached until the list changes, because a rollback can put a different
 * turn at the same index.
 */
export function useTurnHistory({
  gameId,
  liveTurnKey,
  passcode,
  enabled,
}: UseTurnHistoryOptions): TurnHistory {
  const [entries, setEntries] = useState<TurnHistoryEntry[]>([]);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [turn, setTurn] = useState<TurnRecord | null>(null);
  const [power, setPower] = useState<Power | null>(null);
  const cache = useRef(new Map<number, TurnRecord>());
  // The entry being looked at, so it can be found again in a refetched list.
  const viewedRef = useRef<TurnHistoryEntry | null>(null);

  const select = useCallback(
    (index: number | null) => {
      setViewIndex(index);
      viewedRef.current = index === null ? null : (entries[index] ?? null);
      if (index === null) {
        setPower(null);
        setTurn(null);
      } else {
        const cached = cache.current.get(index);
        if (cached) {
          setTurn(cached);
        }
      }
    },
    [entries],
  );

  const goLive = useCallback(() => select(null), [select]);

  const step = useCallback(
    (delta: -1 | 1) => select(stepTurn(entries, viewIndex, delta)),
    [entries, viewIndex, select],
  );

  // Another game, or coming back from the lobby, always opens on the live turn.
  useEffect(() => {
    setViewIndex(null);
    setPower(null);
    setTurn(null);
    setEntries([]);
    viewedRef.current = null;
    cache.current.clear();
  }, [gameId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listTurnHistoryJson({
      query: { game_id: gameId },
      headers: historyHeaders(passcode),
      auth: 'headers',
    })
      .then((list) => {
        if (cancelled) return;
        cache.current.clear();
        setEntries(list);
        // Keep looking at the same turn if it is still there (a rollback or the 30-phase cap
        // can move or drop it), and go back to the live turn if it is gone.
        const viewed = viewedRef.current;
        if (viewed) {
          const found = list.find((e) => sameTurn(e, viewed));
          setViewIndex(found ? found.index : null);
          viewedRef.current = found ?? null;
          if (!found) {
            setPower(null);
            setTurn(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load turn history:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, gameId, liveTurnKey, passcode]);

  useEffect(() => {
    if (viewIndex === null) {
      setTurn(null);
      return;
    }
    const cached = cache.current.get(viewIndex);
    if (cached) {
      setTurn(cached);
      return;
    }
    let cancelled = false;
    getTurnRecordJson({
      path: { index: viewIndex },
      query: { game_id: gameId },
      headers: historyHeaders(passcode),
      auth: 'headers',
    })
      .then((record) => {
        cache.current.set(record.index, record);
        if (!cancelled) setTurn(record);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load a past turn:', err);
        setViewIndex(null);
        viewedRef.current = null;
        setTurn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewIndex, gameId, passcode, entries]);

  const activeTurn =
    viewIndex === null ? null : (cache.current.get(viewIndex) ?? turn);

  return {
    entries,
    viewIndex,
    turn: activeTurn,
    power,
    select,
    step,
    setPower,
    goLive,
  };
}
