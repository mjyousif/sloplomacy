import type { ProvinceInfo, Unit } from '../../../types/diplomacy';
import { getReachableDestinations } from '../../../utils/orderHelpers';
import type { MapInteractionMode } from '../hooks/useMapInteraction';

/**
 * Compute which province IDs should highlight green as valid direct targets
 * for the current `interactionMode` (Move/Retreat, Support, or Convoy).
 */
export function getModeTargetProvinces({
  interactionMode,
  selectedUnit,
  pendingAuxOrigin,
  reachableMap,
  provinces,
  units,
}: {
  interactionMode: MapInteractionMode;
  selectedUnit: Unit | null;
  pendingAuxOrigin: string | null;
  reachableMap: Record<string, string[]>;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
}): Set<string> {
  if (!selectedUnit) return new Set();

  if (interactionMode === 'MOVE') {
    return new Set(Object.keys(reachableMap));
  }

  if (interactionMode === 'CONVOY_PICK_ARMY') {
    if (
      selectedUnit.unit_type !== 'F' ||
      provinces[selectedUnit.province]?.type !== 'SEA'
    ) {
      return new Set();
    }
    const armyOrigins = new Set<string>();
    for (const u of units) {
      if (
        u.unit_type === 'A' &&
        !u.is_dislodged &&
        reachableMap[u.province] &&
        provinces[u.province]?.type === 'COAST'
      ) {
        armyOrigins.add(u.province);
      }
    }
    return armyOrigins;
  }

  if (interactionMode === 'CONVOY_PICK_TARGET') {
    if (
      selectedUnit.unit_type !== 'F' ||
      provinces[selectedUnit.province]?.type !== 'SEA' ||
      !pendingAuxOrigin
    ) {
      return new Set();
    }
    const targets = new Set<string>();
    for (const provId of Object.keys(reachableMap)) {
      if (provId !== pendingAuxOrigin && provinces[provId]?.type === 'COAST') {
        targets.add(provId);
      }
    }
    return targets;
  }

  if (interactionMode === 'SUPPORT_PICK_UNIT') {
    const supportableUnits = new Set<string>();
    for (const u of units) {
      if (u.is_dislodged || u.id === selectedUnit.id) continue;
      if (
        reachableMap[u.province] ||
        getReachableDestinations(u, provinces).some((d) =>
          Boolean(reachableMap[d.province]),
        )
      ) {
        supportableUnits.add(u.province);
      }
    }
    return supportableUnits;
  }

  if (interactionMode === 'SUPPORT_PICK_TARGET') {
    if (!pendingAuxOrigin) return new Set();
    const auxUnit = units.find(
      (u) => !u.is_dislodged && u.province === pendingAuxOrigin,
    );
    if (!auxUnit) return new Set();

    const auxDirect = new Set(
      getReachableDestinations(auxUnit, provinces).map((d) => d.province),
    );
    const validTargets = new Set<string>();
    for (const provId of Object.keys(reachableMap)) {
      if (provId === pendingAuxOrigin || auxDirect.has(provId)) {
        validTargets.add(provId);
      }
    }
    return validTargets;
  }

  return new Set();
}
