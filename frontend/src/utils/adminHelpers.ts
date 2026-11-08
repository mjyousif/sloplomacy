import {
  AuthUser,
  MultiplayerGameSummary,
  Power,
  ProvinceInfo,
  ProvinceType,
  Unit,
  UnitType,
} from '../types/diplomacy';

/**
 * The power this browser is playing. In multiplayer that is the seat the player claimed:
 * the server's active_power is one field shared by everyone in the game, so it cannot say.
 */
export function resolvePlayerPower(
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
  lockedPower: Power | null,
  serverActivePower: Power | undefined,
): Power {
  if (viewMode === 'multiplayer' && lockedPower) {
    return lockedPower;
  }
  return serverActivePower ?? 'FRANCE';
}

export function checkIsGameCreator(
  gameSummary: MultiplayerGameSummary | null,
  user: AuthUser | null,
  viewMode: 'lobby' | 'sandbox' | 'multiplayer',
): boolean {
  if (viewMode === 'sandbox') {
    return true;
  }
  if (!gameSummary) {
    return true;
  }
  if (gameSummary.is_sandbox) {
    return true;
  }
  if (user) {
    if (gameSummary.creator_id && gameSummary.creator_id === user.id) {
      return true;
    }
    if (
      gameSummary.created_by &&
      gameSummary.created_by.toLowerCase() === user.email.toLowerCase()
    ) {
      return true;
    }
  } else {
    if (gameSummary.created_by && gameSummary.created_by.includes('guest')) {
      return true;
    }
  }
  return false;
}

export function canPlaceUnitTypeInProvince(
  unitType: UnitType,
  provinceType: ProvinceType,
): boolean {
  if (provinceType === 'IMPASSABLE') {
    return false;
  }
  if (unitType === 'A') {
    return provinceType === 'LAND' || provinceType === 'COAST';
  }
  if (unitType === 'F') {
    return provinceType === 'SEA' || provinceType === 'COAST';
  }
  return false;
}

export function getAvailableCoasts(
  provinceInfo: ProvinceInfo | undefined,
  unitType: UnitType,
): string[] {
  if (!provinceInfo || unitType !== 'F') {
    return [];
  }
  return provinceInfo.coasts || [];
}

export function filterUnitsForDisband(
  units: Unit[],
  powerFilter: string,
): Unit[] {
  if (!powerFilter || powerFilter === 'ALL') {
    return units;
  }
  return units.filter((u) => u.power === powerFilter);
}
