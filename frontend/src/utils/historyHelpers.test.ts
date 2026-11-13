import { describe, expect, it } from 'vitest';
import type { Order, TurnHistoryEntry } from '../types/diplomacy';
import {
  adjustmentOrdersFor,
  sameTurn,
  shortTurnLabel,
  stepTurn,
} from './historyHelpers';

const entries: TurnHistoryEntry[] = [
  { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
  { index: 1, season: 'Fall', year: 1901, phase: 'Movement' },
  { index: 2, season: 'Winter', year: 1901, phase: 'Adjustments' },
];

describe('shortTurnLabel', () => {
  it('fits a turn into the phone pill', () => {
    expect(shortTurnLabel(entries[1])).toBe('F1901 M');
    expect(shortTurnLabel(entries[2])).toBe('W1901 A');
    expect(
      shortTurnLabel({ season: 'Spring', year: 1901, phase: 'Admin' }),
    ).toBe('S1901 Adm');
  });
});

describe('sameTurn', () => {
  it('matches on season, year and phase, not on index', () => {
    const moved: TurnHistoryEntry = { ...entries[0], index: 7 };
    expect(sameTurn(entries[0], moved)).toBe(true);
    expect(sameTurn(entries[0], entries[1])).toBe(false);
    expect(sameTurn(entries[0], { ...entries[0], year: 1902 })).toBe(false);
  });
});

describe('stepTurn', () => {
  it('steps back from the live turn to the newest resolved one', () => {
    expect(stepTurn(entries, null, -1)).toBe(2);
  });

  it('steps forward from the newest resolved turn to the live one', () => {
    expect(stepTurn(entries, 2, 1)).toBeNull();
    expect(stepTurn(entries, null, 1)).toBeNull();
  });

  it('stays on the oldest turn', () => {
    expect(stepTurn(entries, 0, -1)).toBe(0);
    expect(stepTurn(entries, 1, -1)).toBe(0);
  });

  it('has nowhere to go without history', () => {
    expect(stepTurn([], null, -1)).toBeNull();
  });
});

describe('adjustmentOrdersFor', () => {
  const orders = {
    BUILD_FRANCE_PAR: { power: 'FRANCE', order_type: 'BUILD', origin: 'PAR' },
    GER_A_MUN: { power: 'GERMANY', order_type: 'DISBAND', origin: 'MUN' },
    BUILD_GERMANY_KIE: { power: 'GERMANY', order_type: 'WAIVE', origin: 'KIE' },
  } as unknown as Record<string, Order>;

  it('keeps builds and disbands, not waived builds', () => {
    expect(adjustmentOrdersFor(orders, null).map((o) => o.origin)).toEqual([
      'PAR',
      'MUN',
    ]);
  });

  it('filters to one nation', () => {
    expect(adjustmentOrdersFor(orders, 'GERMANY').map((o) => o.origin)).toEqual(
      ['MUN'],
    );
  });
});
