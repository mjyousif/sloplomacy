import { describe, it, expect } from 'vitest';
import {
  splitProvinceCode,
  getReachableDestinations,
  canUnitSupportInto,
  formatOrderSummary,
} from './orderHelpers';
import { Order, ProvinceInfo, Unit } from '../types/diplomacy';

describe('splitProvinceCode', () => {
  it('parses base province without coast', () => {
    expect(splitProvinceCode('bur')).toEqual({ base: 'BUR', coast: null });
    expect(splitProvinceCode('PAR')).toEqual({ base: 'PAR', coast: null });
  });

  it('parses province with coast', () => {
    expect(splitProvinceCode('spa/nc')).toEqual({ base: 'SPA', coast: 'NC' });
    expect(splitProvinceCode('STP/SC')).toEqual({ base: 'STP', coast: 'SC' });
    expect(splitProvinceCode('bul/ec')).toEqual({ base: 'BUL', coast: 'EC' });
  });
});

describe('getReachableDestinations and canUnitSupportInto', () => {
  const mockProvinces: Record<string, ProvinceInfo> = {
    PAR: {
      id: 'PAR',
      name: 'Paris',
      type: 'LAND',
      is_supply_center: true,
      home_power: 'FRANCE',
      coasts: [],
      army_adj: ['BRE', 'BUR', 'GAS', 'PIC'],
      fleet_adj: {},
    },
    BRE: {
      id: 'BRE',
      name: 'Brest',
      type: 'COAST',
      is_supply_center: true,
      home_power: 'FRANCE',
      coasts: [],
      army_adj: ['ENG', 'GAS', 'PAR', 'PIC'],
      fleet_adj: {
        '': ['ENG', 'GAS', 'MAO', 'PIC'],
      },
    },
    SPA: {
      id: 'SPA',
      name: 'Spain',
      type: 'COAST',
      is_supply_center: true,
      home_power: null,
      coasts: ['NC', 'SC'],
      army_adj: ['GAS', 'MAR', 'POR'],
      fleet_adj: {
        NC: ['GAS', 'MAO', 'POR'],
        SC: ['GOL', 'LYO', 'MAO', 'MAR', 'POR', 'WES'],
      },
    },
    MAO: {
      id: 'MAO',
      name: 'Mid-Atlantic Ocean',
      type: 'SEA',
      is_supply_center: false,
      home_power: null,
      coasts: [],
      army_adj: [],
      fleet_adj: {
        '': ['BRE', 'ENG', 'GAS', 'IRI', 'NAO', 'POR', 'SPA/NC', 'SPA/SC', 'WES'],
      },
    },
  };

  it('calculates reachable destinations for an army', () => {
    const army: Unit = {
      id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      province: 'PAR',
      coast: null,
    };
    const reachable = getReachableDestinations(army, mockProvinces);
    expect(reachable.map((r) => r.province).sort()).toEqual(['BRE', 'BUR', 'GAS', 'PIC'].sort());
    expect(canUnitSupportInto(army, 'BUR', mockProvinces)).toBe(true);
    expect(canUnitSupportInto(army, 'MAO', mockProvinces)).toBe(false);
  });

  it('calculates reachable destinations for a coastal fleet', () => {
    const fleet: Unit = {
      id: 'FRA_F_BRE',
      power: 'FRANCE',
      unit_type: 'F',
      province: 'BRE',
      coast: null,
    };
    const reachable = getReachableDestinations(fleet, mockProvinces);
    expect(reachable.map((r) => r.province).sort()).toEqual(['ENG', 'GAS', 'MAO', 'PIC'].sort());
    expect(canUnitSupportInto(fleet, 'MAO', mockProvinces)).toBe(true);
    expect(canUnitSupportInto(fleet, 'PAR', mockProvinces)).toBe(false);
  });

  it('calculates split coast destinations for fleet in MAO moving to Spain', () => {
    const fleetMao: Unit = {
      id: 'FRA_F_MAO',
      power: 'FRANCE',
      unit_type: 'F',
      province: 'MAO',
      coast: null,
    };
    const reachable = getReachableDestinations(fleetMao, mockProvinces);
    const spaEntry = reachable.find((r) => r.province === 'SPA');
    expect(spaEntry).toBeDefined();
    expect(spaEntry?.coasts.sort()).toEqual(['NC', 'SC']);
  });
});

describe('formatOrderSummary', () => {
  const mockProvinces: Record<string, ProvinceInfo> = {
    PAR: { id: 'PAR', name: 'Paris', type: 'LAND', is_supply_center: true, home_power: 'FRANCE', coasts: [], army_adj: [], fleet_adj: {} },
    BUR: { id: 'BUR', name: 'Burgundy', type: 'LAND', is_supply_center: false, home_power: null, coasts: [], army_adj: [], fleet_adj: {} },
    MAR: { id: 'MAR', name: 'Marseilles', type: 'COAST', is_supply_center: true, home_power: 'FRANCE', coasts: [], army_adj: [], fleet_adj: {} },
    SPA: { id: 'SPA', name: 'Spain', type: 'COAST', is_supply_center: true, home_power: null, coasts: ['NC', 'SC'], army_adj: [], fleet_adj: {} },
    MAO: { id: 'MAO', name: 'Mid-Atlantic Ocean', type: 'SEA', is_supply_center: false, home_power: null, coasts: [], army_adj: [], fleet_adj: {} },
  };

  const unitsByProv: Record<string, Unit> = {
    PAR: { id: 'FRA_A_PAR', power: 'FRANCE', unit_type: 'A', province: 'PAR', coast: null },
    MAR: { id: 'FRA_A_MAR', power: 'FRANCE', unit_type: 'A', province: 'MAR', coast: null },
  };

  it('formats HOLD order', () => {
    const order: Order = {
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'HOLD',
      via_convoy: false,
      is_explicit: true,
    };
    const summary = formatOrderSummary(order, mockProvinces, unitsByProv);
    expect(summary.verb).toBe('HOLD');
    expect(summary.targetText).toContain('Defending Paris');
    expect(summary.badgeColor).toBe('#64748b');
  });

  it('formats MOVE order with coast and convoy flag', () => {
    const order: Order = {
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'MOVE',
      target: 'SPA',
      target_coast: 'SC',
      via_convoy: true,
      is_explicit: true,
    };
    const summary = formatOrderSummary(order, mockProvinces, unitsByProv);
    expect(summary.verb).toBe('MOVE');
    expect(summary.targetText).toBe('→ Spain (SC) [via Convoy]');
    expect(summary.fullSymbolic).toContain('PAR ──► SPA (SC)');
  });

  it('formats SUPPORT HOLD order', () => {
    const order: Order = {
      unit_id: 'FRA_A_MAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'MAR',
      order_type: 'SUPPORT',
      aux_unit_origin: 'PAR',
      target: 'PAR',
      via_convoy: false,
      is_explicit: true,
    };
    const summary = formatOrderSummary(order, mockProvinces, unitsByProv);
    expect(summary.verb).toBe('SUPPORT HOLD');
    expect(summary.targetText).toBe('Supports A Paris (Hold)');
  });

  it('formats SUPPORT MOVE order', () => {
    const order: Order = {
      unit_id: 'FRA_A_MAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'MAR',
      order_type: 'SUPPORT',
      aux_unit_origin: 'PAR',
      target: 'BUR',
      via_convoy: false,
      is_explicit: true,
    };
    const summary = formatOrderSummary(order, mockProvinces, unitsByProv);
    expect(summary.verb).toBe('SUPPORT MOVE');
    expect(summary.targetText).toBe('Supports A Paris → Burgundy');
  });

  it('formats CONVOY order', () => {
    const order: Order = {
      unit_id: 'FRA_F_MAO',
      power: 'FRANCE',
      unit_type: 'F',
      origin: 'MAO',
      order_type: 'CONVOY',
      aux_unit_origin: 'PAR',
      target: 'SPA',
      via_convoy: false,
      is_explicit: true,
    };
    const summary = formatOrderSummary(order, mockProvinces, unitsByProv);
    expect(summary.verb).toBe('CONVOY');
    expect(summary.targetText).toBe('Convoys A Paris → Spain');
  });

  it('formats BUILD, DISBAND, WAIVE, and RETREAT orders', () => {
    const buildOrder: Order = {
      unit_id: 'BUILD_FRANCE_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'BUILD',
      via_convoy: false,
      is_explicit: true,
    };
    expect(formatOrderSummary(buildOrder, mockProvinces, unitsByProv).verb).toBe('BUILD');

    const disbandOrder: Order = {
      unit_id: 'DISBAND_FRANCE_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'DISBAND',
      via_convoy: false,
      is_explicit: true,
    };
    expect(formatOrderSummary(disbandOrder, mockProvinces, unitsByProv).verb).toBe('DISBAND');

    const waiveOrder: Order = {
      unit_id: 'WAIVE_FRANCE_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'WAIVE',
      via_convoy: false,
      is_explicit: true,
    };
    expect(formatOrderSummary(waiveOrder, mockProvinces, unitsByProv).verb).toBe('WAIVE');

    const retreatOrder: Order = {
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      order_type: 'RETREAT',
      target: 'BUR',
      via_convoy: false,
      is_explicit: true,
    };
    expect(formatOrderSummary(retreatOrder, mockProvinces, unitsByProv).verb).toBe('RETREAT');
  });
});
