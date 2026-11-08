import { describe, expect, it } from 'vitest';
import {
  canPlaceUnitTypeInProvince,
  checkIsGameCreator,
  filterUnitsForDisband,
  getAvailableCoasts,
  resolvePlayerPower,
} from './adminHelpers';
import {
  AuthUser,
  MultiplayerGameSummary,
  ProvinceInfo,
  Unit,
} from '../types/diplomacy';

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
