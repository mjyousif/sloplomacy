import { describe, expect, it } from 'vitest';
import type {
  AuthUser,
  MultiplayerGameSummary,
  ProvinceInfo,
  Unit,
} from '../types/diplomacy';
import {
  applyUndoStagedChange,
  canPlaceUnitTypeInProvince,
  checkIsGameCreator,
  computeStagedChanges,
  computeStagedDiffLines,
  filterUnitsForDisband,
  getAvailableCoasts,
  getUnacknowledgedAdminEntries,
  resolvePlayerPower,
} from './adminHelpers';

describe('adminHelpers', () => {
  describe('checkIsGameCreator', () => {
    const creatorUser: AuthUser = {
      id: 'usr_bismarck',
      email: 'bismarck@diplomacy.eu',
      displayName: 'Bismarck',
    };

    const regularPlayer: AuthUser = {
      id: 'usr_romanov',
      email: 'tsar@diplomacy.eu',
      displayName: 'Nicholas',
    };

    const mpGame: MultiplayerGameSummary = {
      game_id: 'mp_concert_104',
      name: 'Concert of Europe',
      status: 'active',
      season: 'Spring',
      year: 1901,
      phase: 'Movement',
      created_by: 'bismarck@diplomacy.eu',
      creator_id: 'usr_bismarck',
      created_at: '2026-01-01T00:00:00Z',
      participants: {},
      finalized_powers: [],
      is_sandbox: false,
    };

    it('returns true when in solo sandbox mode', () => {
      expect(checkIsGameCreator(mpGame, regularPlayer, 'sandbox')).toBe(true);
    });

    it('returns true for game creator in multiplayer match', () => {
      expect(checkIsGameCreator(mpGame, creatorUser, 'multiplayer')).toBe(true);
    });

    it('returns false for joined non-creator player in multiplayer match', () => {
      expect(checkIsGameCreator(mpGame, regularPlayer, 'multiplayer')).toBe(
        false,
      );
    });

    it('returns true for saved sandbox sessions', () => {
      const savedSandbox: MultiplayerGameSummary = {
        ...mpGame,
        is_sandbox: true,
      };
      expect(
        checkIsGameCreator(savedSandbox, regularPlayer, 'multiplayer'),
      ).toBe(true);
    });
  });

  describe('canPlaceUnitTypeInProvince', () => {
    it('allows army on land and coast, but forbids on sea and impassable', () => {
      expect(canPlaceUnitTypeInProvince('A', 'LAND')).toBe(true);
      expect(canPlaceUnitTypeInProvince('A', 'COAST')).toBe(true);
      expect(canPlaceUnitTypeInProvince('A', 'SEA')).toBe(false);
      expect(canPlaceUnitTypeInProvince('A', 'IMPASSABLE')).toBe(false);
    });

    it('allows fleet on sea and coast, but forbids on inland and impassable', () => {
      expect(canPlaceUnitTypeInProvince('F', 'SEA')).toBe(true);
      expect(canPlaceUnitTypeInProvince('F', 'COAST')).toBe(true);
      expect(canPlaceUnitTypeInProvince('F', 'LAND')).toBe(false);
      expect(canPlaceUnitTypeInProvince('F', 'IMPASSABLE')).toBe(false);
    });
  });

  describe('getAvailableCoasts', () => {
    const spain: ProvinceInfo = {
      id: 'SPA',
      name: 'Spain',
      type: 'COAST',
      is_supply_center: true,
      home_power: null,
      coasts: ['NC', 'SC'],
      army_adj: [],
      fleet_adj: {},
    };

    it('returns multiple coasts for fleet in bicoastal province', () => {
      expect(getAvailableCoasts(spain, 'F')).toEqual(['NC', 'SC']);
    });

    it('returns empty array for armies', () => {
      expect(getAvailableCoasts(spain, 'A')).toEqual([]);
    });
  });

  describe('filterUnitsForDisband', () => {
    const sampleUnits: Unit[] = [
      { id: 'FRA_A_PAR', power: 'FRANCE', unit_type: 'A', province: 'PAR' },
      { id: 'GER_A_BER', power: 'GERMANY', unit_type: 'A', province: 'BER' },
      { id: 'GER_F_KIE', power: 'GERMANY', unit_type: 'F', province: 'KIE' },
    ];

    it('returns all units when filter is ALL', () => {
      expect(filterUnitsForDisband(sampleUnits, 'ALL')).toHaveLength(3);
    });

    it('filters units by Great Power', () => {
      const germanUnits = filterUnitsForDisband(sampleUnits, 'GERMANY');
      expect(germanUnits).toHaveLength(2);
      expect(germanUnits.every((u) => u.power === 'GERMANY')).toBe(true);
    });
  });
});

describe('resolvePlayerPower', () => {
  it('uses the claimed seat in multiplayer, whatever the shared game says', () => {
    expect(resolvePlayerPower('multiplayer', 'ENGLAND', 'RUSSIA')).toBe(
      'ENGLAND',
    );
  });

  it('follows the game in the sandbox, where the player can switch powers', () => {
    expect(resolvePlayerPower('sandbox', null, 'TURKEY')).toBe('TURKEY');
  });

  it('ignores a seat left over from a multiplayer game', () => {
    expect(resolvePlayerPower('sandbox', 'ENGLAND', 'TURKEY')).toBe('TURKEY');
    expect(resolvePlayerPower('lobby', 'ENGLAND', 'TURKEY')).toBe('TURKEY');
  });

  it('falls back to the game when multiplayer has no seat yet', () => {
    expect(resolvePlayerPower('multiplayer', null, 'ITALY')).toBe('ITALY');
  });

  it('has a default before any game has loaded', () => {
    expect(resolvePlayerPower('lobby', null, undefined)).toBe('FRANCE');
  });
});

describe('computeStagedDiffLines & getUnacknowledgedAdminEntries', () => {
  it('computes diff lines for unit relocations, spawns, destroys, and ownership changes', () => {
    const baseState = {
      units: [
        { id: 'GER_A_BER', power: 'GERMANY', unit_type: 'A', province: 'BER' },
        { id: 'FRA_A_PAR', power: 'FRANCE', unit_type: 'A', province: 'PAR' },
      ] as Unit[],
      ownership: { BER: 'GERMANY', PAR: 'FRANCE' } as const,
      orders: {},
    };
    const stagedUnits: Unit[] = [
      { id: 'GER_A_BER', power: 'GERMANY', unit_type: 'A', province: 'SYR' },
      { id: 'ENG_F_LON', power: 'ENGLAND', unit_type: 'F', province: 'LON' },
    ];
    const stagedOwnership = {
      BER: 'GERMANY' as const,
      BEL: 'FRANCE' as const,
    };
    const testProvinces: Record<string, ProvinceInfo> = {
      BER: {
        id: 'BER',
        name: 'Berlin',
        type: 'COAST',
        is_supply_center: true,
        home_power: 'GERMANY',
        coasts: [],
        army_adj: [],
        fleet_adj: {},
      },
      PAR: {
        id: 'PAR',
        name: 'Paris',
        type: 'LAND',
        is_supply_center: true,
        home_power: 'FRANCE',
        coasts: [],
        army_adj: [],
        fleet_adj: {},
      },
      SYR: {
        id: 'SYR',
        name: 'Syria',
        type: 'COAST',
        is_supply_center: false,
        home_power: null,
        coasts: [],
        army_adj: [],
        fleet_adj: {},
      },
      LON: {
        id: 'LON',
        name: 'London',
        type: 'COAST',
        is_supply_center: true,
        home_power: 'ENGLAND',
        coasts: [],
        army_adj: [],
        fleet_adj: {},
      },
      BEL: {
        id: 'BEL',
        name: 'Belgium',
        type: 'COAST',
        is_supply_center: true,
        home_power: null,
        coasts: [],
        army_adj: [],
        fleet_adj: {},
      },
    };
    const lines = computeStagedDiffLines(
      baseState,
      stagedUnits,
      stagedOwnership,
      {},
      testProvinces,
    );
    expect(lines).toEqual([
      'Destroyed France Army in Paris',
      'Relocated Germany Army from Berlin to Syria',
      'Spawned England Fleet at London',
      'Set ownership of Belgium to France',
      'Reset ownership of Paris to Neutral',
    ]);
  });

  it('filters unacknowledged admin log entries for the viewer', () => {
    const entries = [
      {
        id: 'a1',
        timestamp: '2026-11-12T00:00:00Z',
        actor: 'bismarck',
        season: 'Spring',
        year: 1901,
        phase: 'Movement',
        summary_lines: ['Relocated GER A BER to SYR'],
        acknowledged_by: ['usr_1'],
      },
    ];
    expect(
      getUnacknowledgedAdminEntries(
        entries,
        { id: 'usr_1', email: 'a@b.com', displayName: 'A' },
        'GERMANY',
        'multiplayer',
      ),
    ).toHaveLength(0);
    expect(
      getUnacknowledgedAdminEntries(
        entries,
        { id: 'usr_2', email: 'c@d.com', displayName: 'C' },
        'FRANCE',
        'multiplayer',
      ),
    ).toHaveLength(1);
    expect(
      getUnacknowledgedAdminEntries(entries, null, 'FRANCE', 'lobby'),
    ).toHaveLength(0);
  });

  it('computes structured staged changes and undoes individual changes cleanly', () => {
    const baseState = {
      units: [
        {
          id: 'FRA_A_PAR',
          power: 'FRANCE' as const,
          unit_type: 'A' as const,
          province: 'PAR',
        },
        {
          id: 'GER_A_BER',
          power: 'GERMANY' as const,
          unit_type: 'A' as const,
          province: 'BER',
        },
      ],
      ownership: { PAR: 'FRANCE' as const },
      orders: {
        FRA_A_PAR: {
          unit_id: 'FRA_A_PAR',
          power: 'FRANCE' as const,
          unit_type: 'A' as const,
          origin: 'PAR',
          origin_coast: null,
          order_type: 'HOLD' as const,
          via_convoy: false,
          is_explicit: false,
        },
      },
    };
    const stagedUnits: Unit[] = [
      { id: 'GER_A_BER', power: 'GERMANY', unit_type: 'A', province: 'SYR' },
      { id: 'ENG_F_LON', power: 'ENGLAND', unit_type: 'F', province: 'LON' },
    ];
    const stagedOwnership = { PAR: 'FRANCE' as const, BEL: 'FRANCE' as const };
    const stagedOrders = {};

    const changes = computeStagedChanges(
      baseState,
      stagedUnits,
      stagedOwnership,
      stagedOrders,
    );
    expect(changes.map((c) => c.id)).toEqual([
      'destroy:FRA_A_PAR',
      'relocate:GER_A_BER',
      'spawn:ENG_F_LON',
      'ownership:BEL',
    ]);

    // Undo only the relocate change
    const afterUndoRelocate = applyUndoStagedChange(
      baseState,
      stagedUnits,
      stagedOwnership,
      stagedOrders,
      'relocate:GER_A_BER',
    );
    expect(
      afterUndoRelocate.units.find((u) => u.id === 'GER_A_BER')?.province,
    ).toBe('BER');
    expect(afterUndoRelocate.units.some((u) => u.id === 'ENG_F_LON')).toBe(
      true,
    );
    expect(afterUndoRelocate.ownership.BEL).toBe('FRANCE');

    // Undo the spawn change
    const afterUndoSpawn = applyUndoStagedChange(
      baseState,
      afterUndoRelocate.units,
      afterUndoRelocate.ownership,
      afterUndoRelocate.orders,
      'spawn:ENG_F_LON',
    );
    expect(afterUndoSpawn.units.some((u) => u.id === 'ENG_F_LON')).toBe(false);

    // Undo the destroy change restores FRA_A_PAR and its base HOLD order
    const afterUndoDestroy = applyUndoStagedChange(
      baseState,
      afterUndoSpawn.units,
      afterUndoSpawn.ownership,
      afterUndoSpawn.orders,
      'destroy:FRA_A_PAR',
    );
    expect(afterUndoDestroy.units.some((u) => u.id === 'FRA_A_PAR')).toBe(true);
    expect(afterUndoDestroy.orders.FRA_A_PAR?.order_type).toBe('HOLD');

    // Undo the ownership change leaves no remaining staged changes
    const afterUndoOwnership = applyUndoStagedChange(
      baseState,
      afterUndoDestroy.units,
      afterUndoDestroy.ownership,
      afterUndoDestroy.orders,
      'ownership:BEL',
    );
    expect(
      computeStagedChanges(
        baseState,
        afterUndoOwnership.units,
        afterUndoOwnership.ownership,
        afterUndoOwnership.orders,
      ),
    ).toEqual([]);
  });
});
