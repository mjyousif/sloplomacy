import { describe, expect, it } from 'vitest';
import type { Power, ProvinceInfo } from '../types/diplomacy';
import { rankPowers, supplyCenterOwners } from './powerHelpers';

describe('rankPowers', () => {
  const baseCounts = (): Record<Power, number> => ({
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  });

  it('ranks all 7 powers identically when all SCs and units are equal', () => {
    const scs = {
      ...baseCounts(),
      AUSTRIA: 3,
      ENGLAND: 3,
      FRANCE: 3,
      GERMANY: 3,
      ITALY: 3,
      RUSSIA: 3,
      TURKEY: 3,
    };
    const units = {
      ...baseCounts(),
      AUSTRIA: 3,
      ENGLAND: 3,
      FRANCE: 3,
      GERMANY: 3,
      ITALY: 3,
      RUSSIA: 3,
      TURKEY: 3,
    };

    const ranked = rankPowers(scs, units);
    expect(ranked).toHaveLength(7);
    for (const item of ranked) {
      expect(item.rank).toBe(1);
    }
  });

  it('sorts by SC descending, giving higher rank to powers with more SCs', () => {
    const scs = {
      ...baseCounts(),
      AUSTRIA: 8,
      ENGLAND: 4,
      FRANCE: 6,
      GERMANY: 5,
      ITALY: 2,
      RUSSIA: 5,
      TURKEY: 4,
    };
    const units = {
      ...baseCounts(),
      AUSTRIA: 8,
      ENGLAND: 4,
      FRANCE: 6,
      GERMANY: 5,
      ITALY: 2,
      RUSSIA: 5,
      TURKEY: 4,
    };

    const ranked = rankPowers(scs, units);
    expect(ranked[0].power).toBe('AUSTRIA');
    expect(ranked[0].rank).toBe(1);

    expect(ranked[1].power).toBe('FRANCE');
    expect(ranked[1].rank).toBe(2);

    // GERMANY and RUSSIA tied at 5 SC and 5 units -> rank 3
    expect(ranked[2].rank).toBe(3);
    expect(ranked[3].rank).toBe(3);
    expect(['GERMANY', 'RUSSIA']).toContain(ranked[2].power);
    expect(['GERMANY', 'RUSSIA']).toContain(ranked[3].power);

    // ENGLAND and TURKEY tied at 4 SC and 4 units -> rank 5
    expect(ranked[4].rank).toBe(5);
    expect(ranked[5].rank).toBe(5);

    // ITALY at 2 SC -> rank 7
    expect(ranked[6].power).toBe('ITALY');
    expect(ranked[6].rank).toBe(7);
  });

  it('breaks SC ties using unit counts descending', () => {
    const scs = {
      ...baseCounts(),
      FRANCE: 5,
      GERMANY: 5,
    };
    const units = {
      ...baseCounts(),
      FRANCE: 5,
      GERMANY: 4, // Germany has 1 fewer unit
    };

    const ranked = rankPowers(scs, units);
    const franceIndex = ranked.findIndex((r) => r.power === 'FRANCE');
    const germanyIndex = ranked.findIndex((r) => r.power === 'GERMANY');

    expect(franceIndex).toBeLessThan(germanyIndex);
    expect(ranked[franceIndex].rank).toBe(1);
    expect(ranked[germanyIndex].rank).toBe(2);
  });

  it('handles standard 1901 start of game where Russia has 4 SCs / 4 units and others have 3', () => {
    const scs = {
      AUSTRIA: 3,
      ENGLAND: 3,
      FRANCE: 3,
      GERMANY: 3,
      ITALY: 3,
      RUSSIA: 4,
      TURKEY: 3,
    };
    const units = {
      AUSTRIA: 3,
      ENGLAND: 3,
      FRANCE: 3,
      GERMANY: 3,
      ITALY: 3,
      RUSSIA: 4,
      TURKEY: 3,
    };

    const ranked = rankPowers(scs, units);
    expect(ranked[0].power).toBe('RUSSIA');
    expect(ranked[0].rank).toBe(1);

    // All remaining 6 powers tied for rank 2
    for (let i = 1; i < 7; i++) {
      expect(ranked[i].rank).toBe(2);
      expect(ranked[i].scCount).toBe(3);
      expect(ranked[i].unitCount).toBe(3);
    }
  });
});

describe('supplyCenterOwners', () => {
  it('drops claimed land that is not a supply center (#258)', () => {
    const provinces = {
      VIE: { is_supply_center: true },
      TYR: { is_supply_center: false },
    } as unknown as Record<string, ProvinceInfo>;
    const ownership: Record<string, Power> = { VIE: 'AUSTRIA', TYR: 'ITALY' };
    expect(supplyCenterOwners(ownership, provinces)).toEqual({
      VIE: 'AUSTRIA',
    });
  });
});
