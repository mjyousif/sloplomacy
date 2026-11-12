import { useMemo, useState } from 'react';
import { ALL_POWERS, type Power, type Unit } from '../../types/diplomacy';
import { rankPowers } from '../../utils/powerHelpers';

export type StandingsSortMode = 'score' | 'default';

/**
 * The standings table: Supply Centers and units per power, and its sort mode (Score / Victory
 * Points vs Default standard order), which is remembered in `localStorage`.
 */
export function useStandingsSort(
  ownership: Record<string, Power>,
  units: Unit[],
) {
  // Compute Supply Centers per power
  const scCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const [, pwr] of Object.entries(ownership)) {
    if (scCountByPower[pwr] !== undefined) scCountByPower[pwr]++;
  }

  // Compute unit counts per power
  const unitCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const u of units) {
    if (!u.is_dislodged && unitCountByPower[u.power] !== undefined) {
      unitCountByPower[u.power]++;
    }
  }

  // Standings sort mode (Score / Victory Points vs Default standard order)
  const [sortMode, setSortMode] = useState<StandingsSortMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sloplomacy_standings_sort');
        if (saved === 'default' || saved === 'score') return saved;
      } catch {
        // Ignore storage errors in sandbox/incognito
      }
    }
    return 'score';
  });

  const handleSetSortMode = (mode: StandingsSortMode) => {
    setSortMode(mode);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sloplomacy_standings_sort', mode);
      } catch {
        // Ignore storage errors
      }
    }
  };

  const displayedPowers = useMemo(() => {
    if (sortMode === 'score') {
      return rankPowers(scCountByPower, unitCountByPower);
    }
    return ALL_POWERS.map((pwr) => ({
      power: pwr,
      rank: null,
      scCount: scCountByPower[pwr] || 0,
      unitCount: unitCountByPower[pwr] || 0,
    }));
  }, [sortMode, scCountByPower, unitCountByPower]);

  return { sortMode, setSortMode: handleSetSortMode, displayedPowers };
}
