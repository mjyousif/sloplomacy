import { describe, expect, it } from 'vitest';
import type { ProvinceInfo, Unit } from '../types/diplomacy';
import { holdOrder } from './orderBuilders';
import {
  provinceName,
  sameTurn,
  turnLabel,
  turnMiddotLabel,
  unitTypeName,
} from './turnFormat';

describe('turnFormat', () => {
  it('compares turns by season, year, and phase', () => {
    const a = { season: 'Spring', year: 1901, phase: 'Movement' };
    expect(
      sameTurn(a, { season: 'Spring', year: 1901, phase: 'Movement' }),
    ).toBe(true);
    expect(sameTurn(a, { season: 'Fall', year: 1901, phase: 'Movement' })).toBe(
      false,
    );
    expect(
      sameTurn(a, { season: 'Spring', year: 1902, phase: 'Movement' }),
    ).toBe(false);
    expect(
      sameTurn(a, { season: 'Spring', year: 1901, phase: 'Retreats' }),
    ).toBe(false);
  });

  it('formats standard and Admin turn labels', () => {
    expect(turnLabel({ season: 'Spring', year: 1901, phase: 'Movement' })).toBe(
      'Spring 1901 Movement',
    );
    expect(turnLabel({ season: 'Fall', year: 1902, phase: 'Admin' })).toBe(
      'Fall 1902 — Admin Edit',
    );
  });

  it('formats middot turn labels', () => {
    expect(
      turnMiddotLabel({ season: 'Winter', year: 1901, phase: 'Adjustments' }),
    ).toBe('Winter 1901 · Adjustments');
  });

  it('resolves province names with safe fallbacks', () => {
    const provinces = {
      PAR: { name: 'Paris' },
      BRE: { name: 'Brest' },
    } as unknown as Record<string, ProvinceInfo>;
    expect(provinceName(provinces, 'PAR')).toBe('Paris');
    expect(provinceName(provinces, 'UNK')).toBe('UNK');
    expect(provinceName(provinces, '')).toBe('');
    expect(provinceName(provinces, null)).toBe('');
    expect(provinceName(provinces, undefined)).toBe('');
    expect(provinceName(undefined, 'PAR')).toBe('PAR');
  });

  it('formats unit types as Army or Fleet', () => {
    expect(unitTypeName('A')).toBe('Army');
    expect(unitTypeName('F')).toBe('Fleet');
  });
});

describe('holdOrder isExplicit parameter', () => {
  const unit: Unit = {
    id: 'FRA_A_PAR',
    power: 'FRANCE',
    unit_type: 'A',
    province: 'PAR',
    coast: null,
  };

  it('defaults is_explicit to true and allows explicit false', () => {
    expect(holdOrder(unit).is_explicit).toBe(true);
    expect(holdOrder(unit, false)).toEqual({
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      origin_coast: null,
      order_type: 'HOLD',
      target: null,
      target_coast: null,
      aux_unit_origin: null,
      via_convoy: false,
      is_explicit: false,
    });
  });
});
