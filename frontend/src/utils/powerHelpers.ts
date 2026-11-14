import { ALL_POWERS, type Power, type ProvinceInfo } from '../types/diplomacy';

/**
 * Only the supply centers in `ownership`. The server also records who last stood in each land
 * province that is not a supply center (it only colours the map), and those never count.
 */
export function supplyCenterOwners(
  ownership: Record<string, Power>,
  provinces: Record<string, ProvinceInfo>,
): Record<string, Power> {
  const centers: Record<string, Power> = {};
  for (const [prov, power] of Object.entries(ownership)) {
    if (provinces[prov]?.is_supply_center) centers[prov] = power;
  }
  return centers;
}

export interface RankedPower {
  power: Power;
  scCount: number;
  unitCount: number;
  rank: number;
}

/**
 * Ranks powers based on supply centers (SC) descending, using unit count descending as tie-breaker.
 * Powers that are still tied receive the same numeric rank (1-7).
 */
export function rankPowers(
  scCountByPower: Record<Power, number>,
  unitCountByPower: Record<Power, number>,
): RankedPower[] {
  const sorted = [...ALL_POWERS].sort((a, b) => {
    const scDiff = (scCountByPower[b] || 0) - (scCountByPower[a] || 0);
    if (scDiff !== 0) return scDiff;
    const unitDiff = (unitCountByPower[b] || 0) - (unitCountByPower[a] || 0);
    if (unitDiff !== 0) return unitDiff;
    return ALL_POWERS.indexOf(a) - ALL_POWERS.indexOf(b);
  });

  const result: RankedPower[] = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const pwr = sorted[i];
    const sc = scCountByPower[pwr] || 0;
    const units = unitCountByPower[pwr] || 0;

    if (i > 0) {
      const prev = result[i - 1];
      if (sc === prev.scCount && units === prev.unitCount) {
        result.push({
          power: pwr,
          scCount: sc,
          unitCount: units,
          rank: prev.rank,
        });
        continue;
      }
      currentRank = i + 1;
    }

    result.push({
      power: pwr,
      scCount: sc,
      unitCount: units,
      rank: currentRank,
    });
  }

  return result;
}
