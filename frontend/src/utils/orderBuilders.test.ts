import { describe, expect, it } from 'vitest';
import { FRANCE_PROVINCES, unitAt } from '../test/mapFixtures';
import type { ProvinceInfo, Unit } from '../types/diplomacy';
import {
  buildDefaultOrderForType,
  buildOrder,
  convoyOrder,
  disbandOrder,
  holdOrder,
  moveOrder,
  retreatOrder,
  supportOrder,
  waiveOrder,
} from './orderBuilders';

const FLEET: Unit = {
  id: 'RUS_F_STP',
  power: 'RUSSIA',
  unit_type: 'F',
  province: 'STP',
  coast: 'SC',
};
const FROM_FLEET = {
  unit_id: 'RUS_F_STP',
  power: 'RUSSIA',
  unit_type: 'F',
  origin: 'STP',
  origin_coast: 'SC',
};

// Field order is checked too: these bodies go to POST /api/order exactly as built.
describe('order builders', () => {
  it('holds', () => {
    const o = holdOrder(FLEET);
    expect(Object.entries(o)).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'HOLD',
        target: null,
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('moves, by convoy only when asked', () => {
    expect(Object.entries(moveOrder(FLEET, 'BOT', null, false))).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'MOVE',
        target: 'BOT',
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      }),
    );
    expect(moveOrder(FLEET, 'BOT', null, true).via_convoy).toBe(true);
  });

  it('retreats, to a coast where one is named', () => {
    expect(Object.entries(retreatOrder(FLEET, 'BUL', 'EC'))).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'RETREAT',
        target: 'BUL',
        target_coast: 'EC',
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('supports, with no target coast', () => {
    expect(Object.entries(supportOrder(FLEET, 'FIN', 'BOT'))).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'SUPPORT',
        aux_unit_origin: 'FIN',
        target: 'BOT',
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('convoys, with no target coast', () => {
    expect(Object.entries(convoyOrder(FLEET, 'FIN', 'SWE'))).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'CONVOY',
        aux_unit_origin: 'FIN',
        target: 'SWE',
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('disbands', () => {
    expect(Object.entries(disbandOrder(FLEET))).toEqual(
      Object.entries({
        ...FROM_FLEET,
        order_type: 'DISBAND',
        target: null,
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('builds in a slot, on a coast where one is named', () => {
    expect(
      Object.entries(
        buildOrder('BUILD_RUSSIA_STP', 'RUSSIA', 'STP', 'F', 'NC'),
      ),
    ).toEqual(
      Object.entries({
        unit_id: 'BUILD_RUSSIA_STP',
        power: 'RUSSIA',
        unit_type: 'F',
        origin: 'STP',
        origin_coast: 'NC',
        order_type: 'BUILD',
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('waives a slot as an army with no coast', () => {
    expect(
      Object.entries(waiveOrder('BUILD_FRANCE_PAR', 'FRANCE', 'PAR')),
    ).toEqual(
      Object.entries({
        unit_id: 'BUILD_FRANCE_PAR',
        power: 'FRANCE',
        unit_type: 'A',
        origin: 'PAR',
        origin_coast: null,
        order_type: 'WAIVE',
        via_convoy: false,
        is_explicit: true,
      }),
    );
  });

  it('keeps a unit with no coast field the way the literals did', () => {
    const army: Unit = {
      id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      province: 'PAR',
    };
    expect(JSON.stringify(holdOrder(army))).toBe(
      '{"unit_id":"FRA_A_PAR","power":"FRANCE","unit_type":"A","origin":"PAR","order_type":"HOLD","target":null,"target_coast":null,"aux_unit_origin":null,"via_convoy":false,"is_explicit":true}',
    );
  });

  it('picks a coastal army and a different coastal target when switching a fleet to CONVOY', () => {
    const mao: ProvinceInfo = {
      ...FRANCE_PROVINCES.BRE,
      id: 'MAO',
      name: 'Mid-Atlantic Ocean',
      type: 'SEA',
      is_supply_center: false,
      home_power: null,
    };
    const provinces: Record<string, ProvinceInfo> = {
      ...FRANCE_PROVINCES,
      MAO: mao,
    };
    const fMao = unitAt('FRANCE', 'F', 'MAO');
    const aPar = unitAt('FRANCE', 'A', 'PAR'); // inland — must be skipped
    const aBre = unitAt('FRANCE', 'A', 'BRE'); // coastal
    const order = buildDefaultOrderForType({
      unit: fMao,
      newType: 'CONVOY',
      provinces,
      units: [fMao, aPar, aBre],
      orders: {},
    });
    expect(order?.aux_unit_origin).toBe('BRE');
    expect(order?.target).not.toBe('BRE');
    expect(provinces[order?.target ?? '']?.type).toBe('COAST');
  });
});
