import { useEffect, useRef, useState } from 'react';
import type { LobbyBrowsePage } from '../../../types/diplomacy';
import {
  type BrowseFilters,
  browseQuery,
  DEFAULT_BROWSE_FILTERS,
  pageCount,
} from '../../../utils/lobbyBrowse';

/**
 * One page of public games for the lobby browser, and the filters that pick it.
 * Changing a filter goes back to page 1. `refreshSignal` is anything that changes when the
 * lobby does (the lobby socket's list), so the open page stays current.
 */
export function useLobbyBrowse(refreshSignal: unknown) {
  const [filters, setFiltersState] = useState<BrowseFilters>(
    DEFAULT_BROWSE_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<LobbyBrowsePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An older reply still in flight must not replace a newer page.
  const requestSeq = useRef(0);

  const setFilters = (next: BrowseFilters) => {
    setFiltersState(next);
    setPage(1);
  };

  // refreshSignal is not read here: a new lobby list is what makes this re-run.
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    fetch(`/api/games/browse?${browseQuery(filters, page)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        const data: LobbyBrowsePage = await res.json();
        if (seq !== requestSeq.current) return;
        // Games left since the last look: step back to the new last page.
        if (data.games.length === 0 && page > 1 && data.total > 0) {
          setPage(pageCount(data.total, data.page_size));
          return;
        }
        setResult(data);
        setError(null);
      })
      .catch((err: Error) => {
        if (seq === requestSeq.current) {
          setError(err.message || 'Could not load games.');
        }
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [filters, page, refreshSignal]);

  return { filters, setFilters, page, setPage, result, loading, error };
}
