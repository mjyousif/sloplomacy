import { describe, expect, it } from 'vitest';
import { OPENING_APPROACHES, OPENINGS } from '../data/openings';
import { ALL_POWERS, type Power, type Unit } from '../types/diplomacy';
import {
  isOpeningTurn,
  openingOrders,
  openingsFor,
  parseOpeningOrder,
} from './openings';

const START: [Power, string][] = [
  ['AUSTRIA', 'A BUD'],
  ['AUSTRIA', 'A VIE'],
  ['AUSTRIA', 'F TRI'],
  ['ENGLAND', 'F EDI'],
  ['ENGLAND', 'F LON'],
  ['ENGLAND', 'A LVP'],
  ['FRANCE', 'F BRE'],
  ['FRANCE', 'A MAR'],
  ['FRANCE', 'A PAR'],
  ['GERMANY', 'A BER'],
  ['GERMANY', 'F KIE'],
  ['GERMANY', 'A MUN'],
  ['ITALY', 'F NAP'],
  ['ITALY', 'A ROM'],
  ['ITALY', 'A VEN'],
  ['RUSSIA', 'A MOS'],
  ['RUSSIA', 'F SEV'],
  ['RUSSIA', 'F STP/SC'],
  ['RUSSIA', 'A WAR'],
  ['TURKEY', 'F ANK'],
  ['TURKEY', 'A CON'],
  ['TURKEY', 'A SMY'],
];

const startUnits = (): Unit[] =>
  START.map(([power, text]) => {
    const [type, loc] = text.split(' ');
    const [province, coast] = loc.split('/');
    return {
      id: `${power.slice(0, 3)}_${type}_${province}`,
      power,
      unit_type: type as Unit['unit_type'],
      province,
      coast: coast ?? null,
    };
  });

describe('isOpeningTurn', () => {
  it('is only Spring 1901 Movement', () => {
    expect(
      isOpeningTurn({ season: 'Spring', year: 1901, phase: 'Movement' }),
    ).toBe(true);
    expect(
      isOpeningTurn({ season: 'Spring', year: 1901, phase: 'Retreats' }),
    ).toBe(false);
    expect(
      isOpeningTurn({ season: 'Fall', year: 1901, phase: 'Movement' }),
    ).toBe(false);
    expect(
      isOpeningTurn({ season: 'Spring', year: 1902, phase: 'Movement' }),
    ).toBe(false);
  });
});

describe('openings data', () => {
  it('gives every power at least three openings', () => {
    for (const power of ALL_POWERS) {
      expect(openingsFor(power).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('fits every opening to the starting position', () => {
    const units = startUnits();
    for (const opening of OPENINGS) {
      const orders = openingOrders(opening, units);
      expect(orders, opening.id).not.toBeNull();
      expect(orders?.every((o) => o.power === opening.power)).toBe(true);
      // One order per unit.
      expect(new Set(orders?.map((o) => o.unit_id)).size).toBe(orders?.length);
    }
  });

  it('has unique ids, 2-3 strengths and weaknesses, and a source for each', () => {
    expect(new Set(OPENINGS.map((o) => o.id)).size).toBe(OPENINGS.length);
    for (const o of OPENINGS) {
      expect(o.strengths.length, o.id).toBeGreaterThanOrEqual(2);
      expect(o.strengths.length, o.id).toBeLessThanOrEqual(3);
      expect(o.weaknesses.length, o.id).toBeGreaterThanOrEqual(2);
      expect(o.weaknesses.length, o.id).toBeLessThanOrEqual(3);
      expect(o.sources.length, o.id).toBeGreaterThan(0);
      for (const s of o.sources) {
        expect(s.url).toMatch(
          /^https:\/\/(diplomacyzines\.co\.uk\/\?page_id=\d+|diplom\.org\/Online\/Openings\/textversion\/\w+\.html)$/,
        );
      }
    }
  });

  it('uses every approach tag at least three times', () => {
    for (const approach of OPENING_APPROACHES) {
      const count = OPENINGS.filter((o) => o.approach === approach).length;
      expect(count, approach).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives the openings of each power distinct names', () => {
    for (const power of ALL_POWERS) {
      const names = openingsFor(power).map((o) => o.name);
      expect(new Set(names).size, power).toBe(names.length);
    }
  });

  it('relates an opening only to other powers, each at most once', () => {
    for (const o of OPENINGS) {
      const powers = o.relations.map((r) => r.power);
      expect(powers, o.id).not.toContain(o.power);
      expect(new Set(powers).size, o.id).toBe(powers.length);
    }
  });

  it('lists the most played first and those with no figure last', () => {
    const italy = openingsFor('ITALY');
    expect(italy[0].name).toBe('Tyrolian Attack');
    const figures = italy.map((o) => o.popularity);
    const firstNull = figures.indexOf(null);
    expect(figures.slice(firstNull).every((p) => p === null)).toBe(true);
    const known = figures.slice(0, firstNull) as number[];
    expect([...known].sort((a, b) => b - a)).toEqual(known);
  });
});

describe('parseOpeningOrder', () => {
  const units = startUnits();

  it('reads a move, with a coast', () => {
    expect(parseOpeningOrder('F STP/SC - BOT', 'RUSSIA', units)).toMatchObject({
      unit_id: 'RUS_F_STP',
      order_type: 'MOVE',
      origin: 'STP',
      origin_coast: 'SC',
      target: 'BOT',
      target_coast: null,
      via_convoy: false,
      is_explicit: true,
    });
  });

  it('reads a hold', () => {
    expect(parseOpeningOrder('A VEN H', 'ITALY', units)).toMatchObject({
      unit_id: 'ITA_A_VEN',
      order_type: 'HOLD',
    });
  });

  it('reads a support to move and a support to hold', () => {
    expect(
      parseOpeningOrder('A MAR S A PAR - BUR', 'FRANCE', units),
    ).toMatchObject({
      order_type: 'SUPPORT',
      aux_unit_origin: 'PAR',
      target: 'BUR',
    });
    expect(parseOpeningOrder('A MAR S A PAR', 'FRANCE', units)).toMatchObject({
      order_type: 'SUPPORT',
      aux_unit_origin: 'PAR',
      target: 'PAR',
    });
  });

  it('finds no unit of another power, a moved unit, or the wrong type', () => {
    expect(parseOpeningOrder('A VEN H', 'AUSTRIA', units)).toBeNull();
    expect(parseOpeningOrder('F VEN H', 'ITALY', units)).toBeNull();
    const moved = units.map((u) =>
      u.id === 'ITA_A_VEN' ? { ...u, province: 'TYR' } : u,
    );
    expect(parseOpeningOrder('A VEN H', 'ITALY', moved)).toBeNull();
    const lepanto = OPENINGS.find((o) => o.id === 'ita-lepanto');
    expect(lepanto && openingOrders(lepanto, moved)).toBeNull();
  });
});
