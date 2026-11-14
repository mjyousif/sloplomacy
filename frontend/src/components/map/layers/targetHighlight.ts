import type {
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import { getReachableDestinations } from '../../../utils/orderHelpers';
import type { MapInteractionMode } from '../hooks/useMapInteraction';

export interface ModeTargetResult {
  green: Set<string>;
  blue: Set<string>;
  /** Convoy-only destinations that need another power's fleet: drawn as an outline, not filled. */
  outline: Set<string>;
  reticles: Set<string>;
}

/**
 * Compute which province IDs highlight in solid green (direct / ready), ocean blue
 * (potential / multi-ship chain), and carry target reticles for `interactionMode`.
 *
 * With a Hold chosen (`holdActive`), the unit is not going anywhere, so MOVE mode lights no
 * convoy destinations. A potential convoy outside `own_fleet_convoys` needs another power's
 * fleet to carry the army, so it only gets an outline.
 *
 * Uses backend-authoritative `selectedUnitOptions` when present, falling back to
 * local `reachableMap` + `provinces` inspection when `selectedUnitOptions` is null.
 */
export function getModeTargetHighlights({
  interactionMode,
  selectedUnit,
  selectedUnitOptions = null,
  pendingAuxOrigin,
  reachableMap,
  provinces,
  units,
  holdActive = false,
}: {
  interactionMode: MapInteractionMode;
  selectedUnit: Unit | null;
  selectedUnitOptions?: UnitMoveOptions | null;
  pendingAuxOrigin: string | null;
  reachableMap: Record<string, string[]>;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  holdActive?: boolean;
}): ModeTargetResult {
  const green = new Set<string>();
  const blue = new Set<string>();
  const outline = new Set<string>();
  const reticles = new Set<string>();
  if (!selectedUnit) return { green, blue, outline, reticles };

  if (interactionMode === 'MOVE') {
    for (const pid of Object.keys(reachableMap)) {
      green.add(pid);
      reticles.add(pid);
    }
    if (selectedUnitOptions && !holdActive) {
      for (const pid of selectedUnitOptions.active_convoys) {
        green.add(pid);
        reticles.add(pid);
      }
      // Servers that predate `own_fleet_convoys` leave it out: fill every potential convoy.
      const own = selectedUnitOptions.own_fleet_convoys;
      for (const pid of selectedUnitOptions.potential_convoys) {
        if (green.has(pid)) continue;
        if (!own || own.includes(pid)) blue.add(pid);
        else outline.add(pid);
      }
    }
    return { green, blue, outline, reticles };
  }

  if (interactionMode === 'CONVOY_PICK_ARMY') {
    if (selectedUnitOptions) {
      const reach = selectedUnitOptions.convoyable_armies;
      for (const pid of reach?.direct ?? []) green.add(pid);
      for (const pid of reach?.chained ?? []) {
        if (!green.has(pid)) blue.add(pid);
      }
      return { green, blue, outline, reticles };
    }
    if (
      selectedUnit.unit_type !== 'F' ||
      provinces[selectedUnit.province]?.type !== 'SEA'
    ) {
      return { green, blue, outline, reticles };
    }
    for (const u of units) {
      if (
        u.unit_type === 'A' &&
        !u.is_dislodged &&
        reachableMap[u.province] &&
        provinces[u.province]?.type === 'COAST'
      ) {
        green.add(u.province);
      }
    }
    return { green, blue, outline, reticles };
  }

  if (interactionMode === 'CONVOY_PICK_TARGET') {
    if (!pendingAuxOrigin) return { green, blue, outline, reticles };
    if (selectedUnitOptions) {
      const reach = selectedUnitOptions.convoy_targets[pendingAuxOrigin];
      for (const pid of reach?.direct ?? []) {
        green.add(pid);
        reticles.add(pid);
      }
      for (const pid of reach?.chained ?? []) {
        if (!green.has(pid)) blue.add(pid);
      }
      return { green, blue, outline, reticles };
    }
    if (
      selectedUnit.unit_type !== 'F' ||
      provinces[selectedUnit.province]?.type !== 'SEA'
    ) {
      return { green, blue, outline, reticles };
    }
    for (const provId of Object.keys(reachableMap)) {
      if (provId !== pendingAuxOrigin && provinces[provId]?.type === 'COAST') {
        green.add(provId);
        reticles.add(provId);
      }
    }
    return { green, blue, outline, reticles };
  }

  if (interactionMode === 'SUPPORT_PICK_UNIT') {
    if (selectedUnitOptions) {
      for (const sup of selectedUnitOptions.valid_supports) {
        green.add(sup.province);
      }
      return { green, blue, outline, reticles };
    }
    for (const u of units) {
      if (u.is_dislodged || u.id === selectedUnit.id) continue;
      if (
        reachableMap[u.province] ||
        getReachableDestinations(u, provinces).some((d) =>
          Boolean(reachableMap[d.province]),
        )
      ) {
        green.add(u.province);
      }
    }
    return { green, blue, outline, reticles };
  }

  if (interactionMode === 'SUPPORT_PICK_TARGET') {
    if (!pendingAuxOrigin) return { green, blue, outline, reticles };
    if (selectedUnitOptions) {
      const supOpt = selectedUnitOptions.valid_supports.find(
        (s) => s.province === pendingAuxOrigin,
      );
      if (supOpt) {
        if (supOpt.hold) {
          green.add(pendingAuxOrigin);
          reticles.add(pendingAuxOrigin);
        }
        for (const pid of supOpt.moves) {
          green.add(pid);
          reticles.add(pid);
        }
      }
      return { green, blue, outline, reticles };
    }
    const auxUnit = units.find(
      (u) => !u.is_dislodged && u.province === pendingAuxOrigin,
    );
    if (!auxUnit) return { green, blue, outline, reticles };
    const auxDirect = new Set(
      getReachableDestinations(auxUnit, provinces).map((d) => d.province),
    );
    for (const provId of Object.keys(reachableMap)) {
      if (provId === pendingAuxOrigin || auxDirect.has(provId)) {
        green.add(provId);
        reticles.add(provId);
      }
    }
    return { green, blue, outline, reticles };
  }

  return { green, blue, outline, reticles };
}
