import { useId, useMemo } from 'react';
import type {
  Power,
  ProvinceInfo,
  SimulationResult,
} from '../../../types/diplomacy';
import {
  buildTerritoryShiftPatterns,
  type TerritoryShiftPattern,
} from '../../../utils/historyOwnershipChanges';

interface UseTerritoryShiftPatternsParams {
  historyView: boolean;
  phase: string;
  ownership: Record<string, Power>;
  simulationResult?: SimulationResult | null;
  provinces: Record<string, ProvinceInfo>;
  historyPowers: readonly Power[];
}

/**
 * Derive deduplicated diagonal stripe patterns and per-province pattern IDs
 * for territories whose ownership changed on a viewed past turn.
 */
export function useTerritoryShiftPatterns({
  historyView,
  phase,
  ownership,
  simulationResult,
  provinces,
  historyPowers,
}: UseTerritoryShiftPatternsParams): {
  territoryPatterns: TerritoryShiftPattern[];
  territoryPatternByProv: Record<string, string>;
} {
  const patternPrefix = useId().replace(/:/g, '');
  return useMemo(() => {
    if (!historyView || !simulationResult?.new_ownership) {
      return {
        territoryPatterns: [],
        territoryPatternByProv: {} as Record<string, string>,
      };
    }
    return buildTerritoryShiftPatterns(
      { phase, ownership, resolution: simulationResult },
      provinces,
      historyPowers,
      patternPrefix,
    );
  }, [
    historyView,
    phase,
    ownership,
    simulationResult,
    provinces,
    historyPowers,
    patternPrefix,
  ]);
}
