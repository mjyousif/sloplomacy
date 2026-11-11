import type {
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../../types/diplomacy';

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
