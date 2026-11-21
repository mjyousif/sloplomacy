import { describe, expect, it } from 'vitest';
import type { Order, TurnHistoryEntry } from '../types/diplomacy';
import {
  ALL_ADJUSTMENT_ACTIONS,
  adjustmentOrdersFor,
  matchesHistoryActions,
  matchesHistoryPowers,
  sameTurn,
  stepTurn,
  toggleHistoryAction,
  toggleHistoryPower,
} from './historyHelpers';

const entries: TurnHistoryEntry[] = [
  { index: 0, season: 'Spring', year: 1901, phase: 'Movement' },
  { index: 1, season: 'Fall', year: 1901, phase: 'Movement' },
  { index: 2, season: 'Winter', year: 1901, phase: 'Adjustments' },
];

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
    expect(adjustmentOrdersFor(orders, []).map((o) => o.origin)).toEqual([
      'PAR',
      'MUN',
    ]);
  });

  it('filters to one or multiple nations', () => {
    expect(
      adjustmentOrdersFor(orders, ['GERMANY']).map((o) => o.origin),
    ).toEqual(['MUN']);
    expect(
      adjustmentOrdersFor(orders, ['FRANCE', 'GERMANY']).map((o) => o.origin),
    ).toEqual(['PAR', 'MUN']);
  });
});

describe('multi-nation history filters', () => {
  it('matches every nation when empty and selected nations otherwise', () => {
    expect(matchesHistoryPowers('FRANCE', [])).toBe(true);
    expect(matchesHistoryPowers('FRANCE', ['FRANCE', 'GERMANY'])).toBe(true);
    expect(matchesHistoryPowers('ITALY', ['FRANCE', 'GERMANY'])).toBe(false);
  });

  it('toggles nations in canonical order and collapses selecting all 7 back to []', () => {
    let powers = toggleHistoryPower([], 'GERMANY');
    expect(powers).toEqual(['GERMANY']);
    powers = toggleHistoryPower(powers, 'FRANCE');
    expect(powers).toEqual(['FRANCE', 'GERMANY']);
    powers = toggleHistoryPower(powers, 'GERMANY');
    expect(powers).toEqual(['FRANCE']);
    powers = toggleHistoryPower(powers, 'FRANCE');
    expect(powers).toEqual([]);

    const six = [
      'AUSTRIA',
      'ENGLAND',
      'FRANCE',
      'GERMANY',
      'ITALY',
      'RUSSIA',
    ] as const;
    expect(toggleHistoryPower(six, 'TURKEY')).toEqual([]);
  });

  it('matches and toggles movement action filters', () => {
    expect(matchesHistoryActions('MOVE', [])).toBe(true);
    expect(matchesHistoryActions(undefined, ['HOLD'])).toBe(true);
    expect(matchesHistoryActions('HOLD', ['MOVE', 'SUPPORT'])).toBe(false);
    expect(matchesHistoryActions('MOVE', ['MOVE', 'SUPPORT'])).toBe(true);

    let actions = toggleHistoryAction([], 'MOVE');
    expect(actions).toEqual(['MOVE']);
    actions = toggleHistoryAction(actions, 'HOLD');
    expect(actions).toEqual(['HOLD', 'MOVE']);
    actions = toggleHistoryAction(actions, 'SUPPORT');
    actions = toggleHistoryAction(actions, 'CONVOY');
    expect(actions).toEqual([]);

    let adjActions = toggleHistoryAction([], 'BUILD', ALL_ADJUSTMENT_ACTIONS);
    expect(adjActions).toEqual(['BUILD']);
    adjActions = toggleHistoryAction(
      adjActions,
      'DISBAND',
      ALL_ADJUSTMENT_ACTIONS,
    );
    expect(adjActions).toEqual(['BUILD', 'DISBAND']);
    adjActions = toggleHistoryAction(
      adjActions,
      'WAIVE',
      ALL_ADJUSTMENT_ACTIONS,
    );
    expect(adjActions).toEqual([]);
  });
});
