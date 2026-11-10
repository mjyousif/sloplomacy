/**
 * A small corner of the board for map tests: France and its neighbours, with real province
 * codes so the map draws them from its geometry.
 */
import type {
  Order,
  OrderType,
  Power,
  ProvinceInfo,
  Unit,
} from '../types/diplomacy';

const province = (
  id: string,
  name: string,
  type: ProvinceInfo['type'],
  army_adj: string[],
  extra: Partial<ProvinceInfo> = {},
): ProvinceInfo => ({
  id,
  name,
  type,
  is_supply_center: false,
  home_power: null,
  coasts: [],
  army_adj,
  fleet_adj: {},
  ...extra,
});

export const FRANCE_PROVINCES: Record<string, ProvinceInfo> = {
  PAR: province('PAR', 'Paris', 'LAND', ['BRE', 'PIC', 'BUR', 'GAS'], {
    is_supply_center: true,
    home_power: 'FRANCE',
  }),
  BRE: province('BRE', 'Brest', 'COAST', ['PAR', 'PIC', 'GAS'], {
    is_supply_center: true,
    home_power: 'FRANCE',
    fleet_adj: { '': ['PIC', 'GAS'] },
  }),
  PIC: province('PIC', 'Picardy', 'COAST', ['PAR', 'BRE', 'BUR'], {
    fleet_adj: { '': ['BRE'] },
  }),
  BUR: province('BUR', 'Burgundy', 'LAND', ['PAR', 'PIC', 'GAS', 'MAR']),
  GAS: province('GAS', 'Gascony', 'COAST', ['PAR', 'BRE', 'BUR', 'MAR'], {
    fleet_adj: { '': ['BRE'] },
  }),
  MAR: province('MAR', 'Marseilles', 'COAST', ['BUR', 'GAS'], {
    is_supply_center: true,
    home_power: 'FRANCE',
  }),
};

export const unitAt = (
  power: Power,
  unit_type: Unit['unit_type'],
  provinceId: string,
  extra: Partial<Unit> = {},
): Unit => ({
  id: `${power}_${unit_type}_${provinceId}`,
  power,
  unit_type,
  province: provinceId,
  coast: null,
  is_dislodged: false,
  ...extra,
});

/** The order a player would have given the unit, explicit unless said otherwise. */
export const orderFor = (
  unit: Unit,
  order_type: OrderType,
  extra: Partial<Order> = {},
): Order => ({
  unit_id: unit.id,
  power: unit.power,
  unit_type: unit.unit_type,
  origin: unit.province,
  origin_coast: unit.coast ?? null,
  order_type,
  target: null,
  target_coast: null,
  aux_unit_origin: null,
  via_convoy: false,
  is_explicit: true,
  ...extra,
});
