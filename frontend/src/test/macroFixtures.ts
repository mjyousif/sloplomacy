/**
 * Fixtures for the order panel's tests: France with a fleet in the Channel, so there is an army
 * to move, a fleet to convoy it and a coast to land on, plus the props a card or list needs.
 */
import type {
  GameParticipant,
  Order,
  Power,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
  ValidationIssue,
} from '../types/diplomacy';
import {
  computeOrderProgress,
  type OrderProgress,
} from '../utils/orderProgress';
import { FRANCE_PROVINCES, orderFor, unitAt } from './mapFixtures';

export const MACRO_PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  ENG: {
    id: 'ENG',
    name: 'English Channel',
    type: 'SEA',
    is_supply_center: false,
    home_power: null,
    coasts: [],
    army_adj: [],
    fleet_adj: { '': ['BRE', 'PIC', 'LON'] },
  },
  LON: {
    id: 'LON',
    name: 'London',
    type: 'COAST',
    is_supply_center: true,
    home_power: 'ENGLAND',
    coasts: [],
    army_adj: [],
    fleet_adj: { '': ['ENG'] },
  },
};

export const A_PAR = unitAt('FRANCE', 'A', 'PAR');
export const A_BRE = unitAt('FRANCE', 'A', 'BRE');
export const F_ENG = unitAt('FRANCE', 'F', 'ENG');
export const A_PIC_ENGLISH = unitAt('ENGLAND', 'A', 'PIC');

export const FRENCH_UNITS: Unit[] = [A_PAR, A_BRE, F_ENG];
export const ALL_UNITS: Unit[] = [...FRENCH_UNITS, A_PIC_ENGLISH];

export const unitsByProvince = (units: Unit[]): Record<string, Unit> =>
  Object.fromEntries(
    units.filter((u) => !u.is_dislodged).map((u) => [u.province, u]),
  );

/** Every French unit holding, as the server fills in orders nobody gave. */
export const HOLD_ORDERS: Record<string, Order> = Object.fromEntries(
  FRENCH_UNITS.map((u) => [u.id, orderFor(u, 'HOLD', { is_explicit: false })]),
);

export const OPTIONS_A_BRE: UnitMoveOptions = {
  direct_moves: ['PAR', 'PIC', 'GAS'],
  active_convoys: [],
  potential_convoys: ['MAR'],
  convoyable_armies: null,
  convoy_targets: {},
  valid_supports: [],
};

export const issue = (
  unit: Unit,
  severity: ValidationIssue['severity'],
  id = `${unit.id}-${severity}`,
): ValidationIssue => ({
  id,
  severity,
  code: 'SELF_BOUNCE',
  title: `Title ${id}`,
  message: `Message ${id}`,
  unit_ids: [unit.id],
  provinces: [unit.province],
  power: unit.power,
});

export const participant = (
  power: Power,
  extra: Partial<GameParticipant> = {},
): GameParticipant => ({
  user_id: `user-${power}`,
  email: '',
  display_name: power,
  power,
  joined_at: '',
  ...extra,
});

export const participantsFor = (
  powers: Power[],
  extra: Partial<GameParticipant> = {},
): Record<string, GameParticipant> =>
  Object.fromEntries(powers.map((p) => [`user-${p}`, participant(p, extra)]));

export const FRENCH_OWNERSHIP: Record<string, Power> = {
  PAR: 'FRANCE',
  BRE: 'FRANCE',
  MAR: 'FRANCE',
  LON: 'ENGLAND',
};

/** France's progress through a movement turn, unless the overrides say otherwise. */
export const progressFor = (
  over: Partial<Parameters<typeof computeOrderProgress>[0]> = {},
): OrderProgress =>
  computeOrderProgress({
    units: ALL_UNITS,
    orders: HOLD_ORDERS,
    ownership: FRENCH_OWNERSHIP,
    provinces: MACRO_PROVINCES,
    activePower: 'FRANCE',
    issues: [],
    builds: null,
    isAdjustmentPhase: false,
    isRetreatPhase: false,
    ...over,
  });
