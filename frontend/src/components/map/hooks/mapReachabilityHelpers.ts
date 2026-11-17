import type {
  Order,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';
import { convoyOrder, supportOrder } from '../../../utils/orderBuilders';

export type MapInteractionMode =
  | 'MOVE'
  | 'SUPPORT_PICK_UNIT'
  | 'SUPPORT_PICK_TARGET'
  | 'CONVOY_PICK_ARMY'
  | 'CONVOY_PICK_TARGET';

/** Whether `army` can reach `targetProv` via convoy (using authoritative `unitOptions` when present). */
export function canArmyConvoyMoveTo(
  army: Unit,
  targetProv: string,
  provinces: Record<string, ProvinceInfo>,
  units: Unit[],
  unitOptions: UnitMoveOptions | null,
): boolean {
  if (army.unit_type !== 'A') return false;
  if (unitOptions) {
    return (
      unitOptions.active_convoys.includes(targetProv) ||
      unitOptions.potential_convoys.includes(targetProv)
    );
  }
  return (
    provinces[army.province]?.type === 'COAST' &&
    provinces[targetProv]?.type === 'COAST' &&
    units.some(
      (u) =>
        u.unit_type === 'F' &&
        !u.is_dislodged &&
        provinces[u.province]?.type === 'SEA',
    )
  );
}

/** True when a fleet in `CONVOY_PICK_ARMY` may select the army standing in `provId`. */
export function canPickConvoyArmyAt(
  provId: string,
  unitsByProv: Record<string, Unit>,
  provinces: Record<string, ProvinceInfo>,
  unitOptions: UnitMoveOptions | null,
): boolean {
  const occ = unitsByProv[provId];
  if (!occ || occ.unit_type !== 'A' || provinces[provId]?.type !== 'COAST') {
    return false;
  }
  if (!unitOptions) return true;
  const reach = unitOptions.convoyable_armies;
  if (!reach) return false;
  return reach.direct.includes(provId) || reach.chained.includes(provId);
}

/** True when a fleet in `CONVOY_PICK_TARGET` may land `pendingAuxOrigin` on `provId`. */
export function canPickConvoyTargetAt(
  provId: string,
  pendingAuxOrigin: string,
  provinces: Record<string, ProvinceInfo>,
  unitOptions: UnitMoveOptions | null,
): boolean {
  if (provinces[provId]?.type !== 'COAST' || provId === pendingAuxOrigin) {
    return false;
  }
  if (!unitOptions) return true;
  const reach = unitOptions.convoy_targets[pendingAuxOrigin];
  if (!reach) return false;
  return reach.direct.includes(provId) || reach.chained.includes(provId);
}

/** True when `selectedUnit` in `SUPPORT_PICK_UNIT` may pick the unit in `provId`. */
export function canPickSupportUnitAt(
  provId: string,
  selectedUnit: Unit,
  unitsByProv: Record<string, Unit>,
  unitOptions: UnitMoveOptions | null,
): boolean {
  const occ = unitsByProv[provId];
  if (!occ || occ.id === selectedUnit.id) return false;
  if (!unitOptions) return true;
  return unitOptions.valid_supports.some((s) => s.province === provId);
}

/** True when `selectedUnit` in `SUPPORT_PICK_TARGET` may support `pendingAuxOrigin` into `provId`. */
export function canPickSupportTargetAt(
  provId: string,
  pendingAuxOrigin: string,
  unitOptions: UnitMoveOptions | null,
): boolean {
  if (!unitOptions) return true;
  const opt = unitOptions.valid_supports.find(
    (s) => s.province === pendingAuxOrigin,
  );
  if (!opt) return false;
  return provId === pendingAuxOrigin ? opt.hold : opt.moves.includes(provId);
}

/**
 * Derive the effective map interaction mode and pending auxiliary origin. A support or convoy
 * opened from the sidebar (or left unfinished) resumes at the step that picks its unit or target.
 */
export function resolveActiveInteractionState({
  pickedMode,
  moveModeChosen,
  pickedAuxOrigin,
  selectedUnit,
  selectedOrder,
}: {
  pickedMode: MapInteractionMode;
  moveModeChosen: boolean;
  pickedAuxOrigin: string | null;
  selectedUnit: Unit | null;
  selectedOrder?: Order;
}): { interactionMode: MapInteractionMode; pendingAuxOrigin: string | null } {
  let interactionMode = pickedMode;
  let pendingAuxOrigin = pickedAuxOrigin;
  if (
    pickedMode === 'MOVE' &&
    !moveModeChosen &&
    selectedUnit &&
    selectedOrder &&
    selectedOrder.unit_id === selectedUnit.id &&
    (selectedOrder.order_type === 'SUPPORT' ||
      selectedOrder.order_type === 'CONVOY') &&
    !selectedOrder.target
  ) {
    const isSupport = selectedOrder.order_type === 'SUPPORT';
    if (selectedOrder.aux_unit_origin) {
      interactionMode = isSupport
        ? 'SUPPORT_PICK_TARGET'
        : 'CONVOY_PICK_TARGET';
      pendingAuxOrigin = selectedOrder.aux_unit_origin;
    } else {
      interactionMode = isSupport ? 'SUPPORT_PICK_UNIT' : 'CONVOY_PICK_ARMY';
    }
  }
  return { interactionMode, pendingAuxOrigin };
}

/** True when an army move to `targetProv` should be tagged `via_convoy`. */
export function resolveMoveViaConvoy(
  unit: Unit,
  targetProv: string,
  reachableMap: Record<string, string[]>,
  selectedUnitOptions: UnitMoveOptions | null,
): boolean {
  const isDirect = Boolean(reachableMap[targetProv]);
  const isActiveConvoy = Boolean(
    selectedUnitOptions?.active_convoys.includes(targetProv),
  );
  return unit.unit_type === 'A' && (isActiveConvoy || !isDirect);
}

/** Resolve whether a move/retreat click commits immediately or needs a split-coast choice. */
export function resolveCoastDispatch(
  unit: Unit,
  provId: string,
  explicitCoast: string | null,
  reachableMap: Record<string, string[]>,
):
  | { kind: 'commit'; coast: string | null }
  | { kind: 'pick'; target: string; coasts: string[] } {
  const coasts = reachableMap[provId] || [];
  if (
    unit.unit_type === 'F' &&
    explicitCoast &&
    coasts.includes(explicitCoast)
  ) {
    return { kind: 'commit', coast: explicitCoast };
  }
  if (unit.unit_type === 'F' && coasts.length > 1) {
    return { kind: 'pick', target: provId, coasts };
  }
  const singleCoast =
    unit.unit_type === 'F' && coasts.length === 1 ? coasts[0] : null;
  return { kind: 'commit', coast: singleCoast };
}

/** Validate picking the auxiliary unit/army for a support or convoy and return the next mode. */
export function resolveSupportOrConvoyAuxPick({
  interactionMode,
  provId,
  selectedUnit,
  unitsByProv,
  provinces,
  selectedUnitOptions,
}: {
  interactionMode: MapInteractionMode;
  provId: string;
  selectedUnit: Unit;
  unitsByProv: Record<string, Unit>;
  provinces: Record<string, ProvinceInfo>;
  selectedUnitOptions: UnitMoveOptions | null;
}): 'SUPPORT_PICK_TARGET' | 'CONVOY_PICK_TARGET' | null {
  if (interactionMode === 'SUPPORT_PICK_UNIT') {
    return canPickSupportUnitAt(
      provId,
      selectedUnit,
      unitsByProv,
      selectedUnitOptions,
    )
      ? 'SUPPORT_PICK_TARGET'
      : null;
  }
  if (interactionMode === 'CONVOY_PICK_ARMY') {
    return canPickConvoyArmyAt(
      provId,
      unitsByProv,
      provinces,
      selectedUnitOptions,
    )
      ? 'CONVOY_PICK_TARGET'
      : null;
  }
  return null;
}

/** Build the completed support or convoy order when a target province is clicked, or `null`. */
export function resolveSupportOrConvoyTargetOrder({
  interactionMode,
  provId,
  pendingAuxOrigin,
  selectedUnit,
  provinces,
  selectedUnitOptions,
}: {
  interactionMode: MapInteractionMode;
  provId: string;
  pendingAuxOrigin: string;
  selectedUnit: Unit;
  provinces: Record<string, ProvinceInfo>;
  selectedUnitOptions: UnitMoveOptions | null;
}): Order | null {
  if (interactionMode === 'SUPPORT_PICK_TARGET') {
    return canPickSupportTargetAt(provId, pendingAuxOrigin, selectedUnitOptions)
      ? supportOrder(selectedUnit, pendingAuxOrigin, provId)
      : null;
  }
  if (interactionMode === 'CONVOY_PICK_TARGET') {
    return canPickConvoyTargetAt(
      provId,
      pendingAuxOrigin,
      provinces,
      selectedUnitOptions,
    )
      ? convoyOrder(selectedUnit, pendingAuxOrigin, provId)
      : null;
  }
  return null;
}
