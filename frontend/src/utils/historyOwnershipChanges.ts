import type { Power, ProvinceInfo, TurnRecord } from '../types/diplomacy';

export interface TerritoryShiftPattern {
  id: string;
  prevPower: Power | null;
  nextPower: Power | null;
}

export interface HistoryOwnershipChange {
  province: string;
  provinceName: string;
  prevPower: Power | null;
  nextPower: Power | null;
  isSupplyCenter: boolean;
}

function displayedOwner(
  prov: string,
  ownership: Record<string, Power>,
  hasOwnershipData: boolean,
  provinces: Record<string, ProvinceInfo>,
): Power | null {
  if (ownership[prov]) return ownership[prov];
  const info = provinces[prov];
  if (info?.home_power && !info.is_supply_center) {
    return info.home_power;
  }
  if (!hasOwnershipData && info?.home_power) {
    return info.home_power;
  }
  return null;
}

/**
 * Diff territory and supply center ownership before vs after a resolved turn,
 * matching the map's home-territory fallback for unclaimed non-SC land and filtering
 * to `selectedPowers`.
 */
export function collectOwnershipChanges(
  turn: Pick<TurnRecord, 'phase' | 'ownership' | 'resolution'>,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
): HistoryOwnershipChange[] {
  const afterOwnership = turn.resolution?.new_ownership;
  if (!afterOwnership) return [];
  const beforeHasData = Object.keys(turn.ownership).length > 0;
  const afterHasData = Object.keys(afterOwnership).length > 0;
  if (turn.phase !== 'Admin' && !afterHasData) return [];

  const allProvs = Array.from(
    new Set([...Object.keys(turn.ownership), ...Object.keys(afterOwnership)]),
  );
  const changes: HistoryOwnershipChange[] = [];

  for (const prov of allProvs) {
    const info = provinces[prov];
    if (info && (info.type === 'SEA' || info.type === 'IMPASSABLE')) continue;
    const prevPower = displayedOwner(
      prov,
      turn.ownership,
      beforeHasData,
      provinces,
    );
    const nextPower = displayedOwner(
      prov,
      afterOwnership,
      afterHasData,
      provinces,
    );
    if (prevPower === nextPower) continue;
    if (
      selectedPowers.length > 0 &&
      !(prevPower && selectedPowers.includes(prevPower)) &&
      !(nextPower && selectedPowers.includes(nextPower))
    ) {
      continue;
    }
    changes.push({
      province: prov,
      provinceName: info?.name ?? prov,
      prevPower,
      nextPower,
      isSupplyCenter: Boolean(info?.is_supply_center),
    });
  }

  changes.sort((a, b) => {
    if (a.isSupplyCenter !== b.isSupplyCenter) {
      return a.isSupplyCenter ? -1 : 1;
    }
    return a.provinceName.localeCompare(b.provinceName);
  });
  return changes;
}

/**
 * Deduplicate alternating diagonal stripe SVG pattern specs for territories
 * that changed hands on a past turn and map each changed province to its pattern id.
 */
export function buildTerritoryShiftPatterns(
  turn: Pick<TurnRecord, 'phase' | 'ownership' | 'resolution'>,
  provinces: Record<string, ProvinceInfo>,
  selectedPowers: readonly Power[],
  patternPrefix: string,
): {
  territoryPatterns: TerritoryShiftPattern[];
  territoryPatternByProv: Record<string, string>;
} {
  const changes = collectOwnershipChanges(turn, provinces, selectedPowers);
  const patternsMap = new Map<string, TerritoryShiftPattern>();
  const territoryPatternByProv: Record<string, string> = {};
  for (const change of changes) {
    const key = `${change.prevPower ?? 'NEUTRAL'}_TO_${change.nextPower ?? 'NEUTRAL'}`;
    let pattern = patternsMap.get(key);
    if (!pattern) {
      pattern = {
        id: `territory-shift-${patternPrefix}-${key}`,
        prevPower: change.prevPower,
        nextPower: change.nextPower,
      };
      patternsMap.set(key, pattern);
    }
    territoryPatternByProv[change.province] = pattern.id;
  }
  return {
    territoryPatterns: Array.from(patternsMap.values()),
    territoryPatternByProv,
  };
}
