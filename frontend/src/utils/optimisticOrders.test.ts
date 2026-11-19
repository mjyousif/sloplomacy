import { describe, expect, it } from 'vitest';
import type { GameState, Order, Unit } from '../types/diplomacy';
import {
  applyOptimisticOrder,
  isStaleServerState,
  type PendingOrder,
  rebasePendingOrders,
} from './optimisticOrders';

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'FRA_A_PAR',
  power: 'FRANCE',
  unit_type: 'A',
  province: 'PAR',
  coast: null,
  is_dislodged: false,
  ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
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
  is_explicit: true,
  ...over,
});

const state = (over: Partial<GameState> = {}): GameState =>
  ({
    game_id: 'mp_1',
    season: 'Spring',
    year: 1901,
    phase: 'Movement',
    scenario_id: 'standard_1901',
    active_power: 'FRANCE',
    units: [unit()],
    orders: { FRA_A_PAR: order({ is_explicit: false }) },
    ownership: {},
    finalized_powers: [],
    issues: [],
    turn_history: [],
    state_revision: 1,
    ...over,
  }) as GameState;

describe('applyOptimisticOrder', () => {
  it('applies the unit order, normalizes from the unit, and clears finalization', () => {
    const base = state({
      units: [
        unit({
          id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          province: 'PAR',
        }),
      ],
      finalized_powers: ['FRANCE', 'GERMANY'],
    });
    const next = applyOptimisticOrder(
      base,
      order({
        unit_id: 'FRA_A_PAR',
        power: 'GERMANY',
        origin: 'WRONG',
        order_type: 'MOVE',
        target: 'BUR',
        target_coast: 'NC',
      }),
    );

    expect(next.orders.FRA_A_PAR).toMatchObject({
      unit_id: 'FRA_A_PAR',
      power: 'FRANCE',
      unit_type: 'A',
      origin: 'PAR',
      origin_coast: null,
      order_type: 'MOVE',
      target: 'BUR',
      target_coast: null,
    });
    expect(next.finalized_powers).toEqual(['GERMANY']);
    // Original state stays untouched.
    expect(base.orders.FRA_A_PAR.order_type).toBe('HOLD');
    expect(base.finalized_powers).toEqual(['FRANCE', 'GERMANY']);
  });

  it('auto-waives an excess Winter BUILD slot (non-explicit first)', () => {
    const base = state({
      season: 'Winter',
      phase: 'Adjustments',
      builds: {
        FRANCE: { count: 1, homes: ['PAR', 'MAR', 'BRE'] },
      } as unknown as GameState['builds'],
      orders: {
        BUILD_FRANCE_PAR: order({
          unit_id: 'BUILD_FRANCE_PAR',
          origin: 'PAR',
          order_type: 'BUILD',
          is_explicit: false,
        }),
        BUILD_FRANCE_MAR: order({
          unit_id: 'BUILD_FRANCE_MAR',
          origin: 'MAR',
          order_type: 'WAIVE',
          is_explicit: false,
        }),
      },
    });

    const next = applyOptimisticOrder(
      base,
      order({
        unit_id: 'BUILD_FRANCE_MAR',
        origin: 'MAR',
        origin_coast: 'SC',
        unit_type: 'A',
        order_type: 'BUILD',
        is_explicit: true,
      }),
    );

    expect(next.orders.BUILD_FRANCE_MAR.order_type).toBe('BUILD');
    expect(next.orders.BUILD_FRANCE_MAR.origin_coast).toBeNull();
    expect(next.orders.BUILD_FRANCE_PAR.order_type).toBe('WAIVE');
  });

  it('auto-holds an excess Winter DISBAND order when disband cap is reached', () => {
    const base = state({
      season: 'Winter',
      phase: 'Adjustments',
      units: [
        unit({ id: 'FRA_A_PAR', province: 'PAR' }),
        unit({ id: 'FRA_A_MAR', province: 'MAR' }),
      ],
      builds: {
        FRANCE: { count: -1, homes: [] },
      } as unknown as GameState['builds'],
      orders: {
        FRA_A_PAR: order({
          unit_id: 'FRA_A_PAR',
          origin: 'PAR',
          order_type: 'DISBAND',
        }),
        FRA_A_MAR: order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          order_type: 'HOLD',
        }),
      },
    });

    const next = applyOptimisticOrder(
      base,
      order({ unit_id: 'FRA_A_MAR', origin: 'MAR', order_type: 'DISBAND' }),
    );

    expect(next.orders.FRA_A_MAR.order_type).toBe('DISBAND');
    expect(next.orders.FRA_A_PAR.order_type).toBe('HOLD');
  });
});

describe('rebasePendingOrders', () => {
  it('returns the exact serverState reference when no pending orders match', () => {
    const server = state();
    const otherGame: PendingOrder = {
      seq: 1,
      gameId: 'other',
      turn: 'Spring 1901 Movement',
      order: order({ order_type: 'MOVE', target: 'BUR' }),
    };
    const otherTurn: PendingOrder = {
      seq: 2,
      gameId: 'mp_1',
      turn: 'Fall 1901 Movement',
      order: order({ order_type: 'MOVE', target: 'PIC' }),
    };

    expect(rebasePendingOrders(server, [])).toBe(server);
    expect(rebasePendingOrders(server, [otherGame, otherTurn])).toBe(server);
  });

  it('re-applies matching pending orders in sequence order', () => {
    const server = state({
      units: [
        unit({ id: 'FRA_A_PAR', province: 'PAR' }),
        unit({ id: 'FRA_A_MAR', province: 'MAR' }),
      ],
      orders: {
        FRA_A_PAR: order({ order_type: 'MOVE', target: 'BUR' }),
        FRA_A_MAR: order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          order_type: 'HOLD',
        }),
      },
      state_revision: 2,
    });
    const pending: PendingOrder[] = [
      {
        seq: 3,
        gameId: 'mp_1',
        turn: 'Spring 1901 Movement',
        order: order({
          unit_id: 'FRA_A_MAR',
          origin: 'MAR',
          order_type: 'MOVE',
          target: 'PIE',
        }),
      },
      {
        seq: 4,
        gameId: 'mp_1',
        turn: 'Spring 1901 Movement',
        order: order({
          unit_id: 'FRA_A_PAR',
          origin: 'PAR',
          order_type: 'MOVE',
          target: 'PIC',
        }),
      },
    ];

    const rebased = rebasePendingOrders(server, pending);
    expect(rebased.orders.FRA_A_MAR.target).toBe('PIE');
    expect(rebased.orders.FRA_A_PAR.target).toBe('PIC');
  });
});

describe('isStaleServerState', () => {
  it('returns true only for lower state_revision on the same game and turn', () => {
    const current = state({ state_revision: 5 });
    expect(isStaleServerState(current, state({ state_revision: 4 }))).toBe(
      true,
    );
    expect(isStaleServerState(current, state({ state_revision: 5 }))).toBe(
      false,
    );
    expect(isStaleServerState(current, state({ state_revision: 6 }))).toBe(
      false,
    );
    expect(
      isStaleServerState(
        current,
        state({ game_id: 'mp_2', state_revision: 1 }),
      ),
    ).toBe(false);
    expect(
      isStaleServerState(current, state({ season: 'Fall', state_revision: 1 })),
    ).toBe(false);
    expect(isStaleServerState(null, state({ state_revision: 1 }))).toBe(false);
    expect(
      isStaleServerState(current, state({ state_revision: undefined })),
    ).toBe(false);
  });
});
