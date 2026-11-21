import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../../lib/api';
import { getAuthHeaders } from '../../lib/supabase';
import type {
  CampaignStatsResponse,
  GameState,
  MultiplayerGameSummary,
  ProvinceInfo,
} from '../../types/diplomacy';
import { buildFallbackCampaignStats } from '../../utils/gameOverHelpers';

interface CachedStats {
  key: string;
  data: CampaignStatsResponse;
}

export function useCampaignStats(
  gameState: GameState,
  provinces: Record<string, ProvinceInfo>,
  summary: MultiplayerGameSummary | null,
  isOpen: boolean,
  initialStats?: CampaignStatsResponse | null,
  passcode?: string | null,
) {
  const fallback = useMemo(
    () => buildFallbackCampaignStats(gameState, provinces, summary),
    [gameState, provinces, summary],
  );

  const fetchKey = `${gameState.game_id}:${gameState.state_revision ?? 0}:${gameState.season}:${gameState.year}:${gameState.phase}:${gameState.winner ?? ''}`;
  const [cached, setCached] = useState<CachedStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !isOpen ||
      !gameState.game_id ||
      initialStats ||
      typeof fetch !== 'function'
    ) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const headers: Record<string, string> = { ...(await getAuthHeaders()) };
        if (passcode) {
          headers['X-Passcode'] = passcode;
        }
        const res = await fetch(
          `${API_BASE}/history/stats?game_id=${encodeURIComponent(gameState.game_id)}`,
          { headers },
        );
        if (!cancelled && res && res.ok) {
          const data = (await res.json()) as CampaignStatsResponse;
          if (!cancelled && data && data.powers) {
            setCached({ key: fetchKey, data });
          }
        }
      } catch {
        // Offline or unit-test environment without a mock server keeps fallback stats.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, gameState.game_id, fetchKey, initialStats, passcode]);

  const fetchedStats = cached?.key === fetchKey ? cached.data : null;

  return {
    stats: initialStats ?? fetchedStats ?? fallback,
    loading,
  };
}
