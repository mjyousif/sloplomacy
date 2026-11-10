import { describe, expect, it } from 'vitest';
import type { Unit } from '../types/diplomacy';
import {
  convoyOrder,
  holdOrder,
  moveOrder,
  retreatOrder,
  supportOrder,
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
});
