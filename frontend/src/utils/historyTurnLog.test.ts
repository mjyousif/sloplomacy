import { describe, expect, it } from 'vitest';
import type { ProvinceInfo, TurnRecord } from '../types/diplomacy';
import { buildHistoryTurnLog } from './historyTurnLog';

const PROVINCES: Record<string, ProvinceInfo> = {
  PAR: { name: 'Paris' } as ProvinceInfo,
  BUR: { name: 'Burgundy' } as ProvinceInfo,
  MUN: { name: 'Munich' } as ProvinceInfo,
  RUH: { name: 'Ruhr' } as ProvinceInfo,
  LON: { name: 'London' } as ProvinceInfo,
  NTH: { name: 'North Sea' } as ProvinceInfo,
  KIE: { name: 'Kiel' } as ProvinceInfo,
  BEL: { name: 'Belgium' } as ProvinceInfo,
};

describe('buildHistoryTurnLog', () => {
  it('groups Movement orders by power with resolved statuses and reasons, respecting multi-nation filter', () => {
    const turn = {
      index: 0,
      season: 'Spring',
      year: 1901,
      phase: 'Movement',
      ownership: { PAR: 'FRANCE', MUN: 'GERMANY', LON: 'ENGLAND' },
      units: [
        {
          id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          province: 'PAR',
          is_dislodged: false,
        },
        {
          id: 'GER_A_MUN',
          power: 'GERMANY',
          unit_type: 'A',
          province: 'MUN',
          is_dislodged: false,
        },
        {
          id: 'GER_A_RUH',
          power: 'GERMANY',
          unit_type: 'A',
          province: 'RUH',
          is_dislodged: false,
        },
        {
          id: 'ENG_F_LON',
          power: 'ENGLAND',
          unit_type: 'F',
          province: 'LON',
          is_dislodged: false,
        },
      ],
      orders: {
        FRA_A_PAR: {
          unit_id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'MOVE',
          target: 'BUR',
          via_convoy: false,
          is_explicit: true,
        },
        GER_A_MUN: {
          unit_id: 'GER_A_MUN',
          power: 'GERMANY',
          unit_type: 'A',
          origin: 'MUN',
          order_type: 'MOVE',
          target: 'BUR',
          via_convoy: false,
          is_explicit: true,
        },
        GER_A_RUH: {
          unit_id: 'GER_A_RUH',
          power: 'GERMANY',
          unit_type: 'A',
          origin: 'RUH',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: true,
        },
        ENG_F_LON: {
          unit_id: 'ENG_F_LON',
          power: 'ENGLAND',
          unit_type: 'F',
          origin: 'LON',
          order_type: 'MOVE',
          target: 'NTH',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: {},
        resolutions: {
          FRA_A_PAR: {
            unit_id: 'FRA_A_PAR',
            origin: 'PAR',
            order_type: 'MOVE',
            target: 'BUR',
            succeeded: false,
            bounced: true,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Bounced attempting to move to Burgundy (strength 1).',
          },
          GER_A_MUN: {
            unit_id: 'GER_A_MUN',
            origin: 'MUN',
            order_type: 'MOVE',
            target: 'BUR',
            succeeded: false,
            bounced: true,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Bounced attempting to move to Burgundy (strength 1).',
          },
          GER_A_RUH: {
            unit_id: 'GER_A_RUH',
            origin: 'RUH',
            order_type: 'HOLD',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Held position.',
          },
          ENG_F_LON: {
            unit_id: 'ENG_F_LON',
            origin: 'LON',
            order_type: 'MOVE',
            target: 'NTH',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Moved cleanly to North Sea.',
          },
        },
      },
    } as unknown as TurnRecord;

    const all = buildHistoryTurnLog(turn, PROVINCES, []);
    expect(all.phaseKind).toBe('Movement');
    expect(all.totalCount).toBe(4);
    expect(all.groups.map((g) => g.power)).toEqual([
      'FRANCE',
      'ENGLAND',
      'GERMANY',
    ]);
    expect(all.groups[1].entries[0]).toMatchObject({
      unitType: 'F',
      locationLabel: 'London',
      verb: 'MOVE',
      detail: '→ North Sea',
      outcomeLabel: 'Succeeded',
      outcomeTone: 'success',
      reason: undefined,
      highlightUnitId: 'ENG_F_LON',
      highlightProvinces: ['LON', 'NTH'],
    });
    expect(all.groups[2].entries[0]).toMatchObject({
      unitType: 'A',
      locationLabel: 'Munich',
      outcomeLabel: 'Bounced',
      outcomeTone: 'danger',
      reason: 'Bounced attempting to move to Burgundy (strength 1).',
    });
    expect(all.groups[2].entries[1]).toMatchObject({
      unitType: 'A',
      locationLabel: 'Ruhr',
      verb: 'HOLD',
      outcomeLabel: 'Held',
      outcomeTone: 'neutral',
    });

    const multi = buildHistoryTurnLog(turn, PROVINCES, ['FRANCE', 'ENGLAND']);
    expect(multi.totalCount).toBe(2);
    expect(multi.groups.map((g) => g.power)).toEqual(['FRANCE', 'ENGLAND']);

    const onlyHold = buildHistoryTurnLog(turn, PROVINCES, [], ['HOLD']);
    expect(onlyHold.totalCount).toBe(1);
    expect(onlyHold.groups.map((g) => g.power)).toEqual(['GERMANY']);
    expect(onlyHold.groups[0].entries.map((e) => e.id)).toEqual(['GER_A_RUH']);

    const gerMoveOrHold = buildHistoryTurnLog(
      turn,
      PROVINCES,
      ['GERMANY'],
      ['MOVE'],
    );
    expect(gerMoveOrHold.groups[0].entries.map((e) => e.id)).toEqual([
      'GER_A_MUN',
    ]);
  });

  it('shows only retreats/disbands in Retreats phase', () => {
    const turn = {
      index: 1,
      season: 'Fall',
      year: 1901,
      phase: 'Retreats',
      ownership: {},
      units: [
        {
          id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          province: 'PAR',
          is_dislodged: false,
        },
        {
          id: 'GER_A_BUR',
          power: 'GERMANY',
          unit_type: 'A',
          province: 'BUR',
          is_dislodged: true,
        },
      ],
      orders: {
        GER_A_BUR: {
          unit_id: 'GER_A_BUR',
          power: 'GERMANY',
          unit_type: 'A',
          origin: 'BUR',
          order_type: 'RETREAT',
          target: 'RUH',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: {},
        resolutions: {
          FRA_A_PAR: {
            unit_id: 'FRA_A_PAR',
            origin: 'PAR',
            order_type: 'HOLD',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Held position during retreats phase.',
          },
          GER_A_BUR: {
            unit_id: 'GER_A_BUR',
            origin: 'BUR',
            order_type: 'RETREAT',
            target: 'RUH',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Retreated safely to Ruhr.',
          },
        },
      },
    } as unknown as TurnRecord;

    const log = buildHistoryTurnLog(turn, PROVINCES, []);
    expect(log.phaseKind).toBe('Retreats');
    expect(log.totalCount).toBe(1);
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0].power).toBe('GERMANY');
    expect(log.groups[0].entries[0]).toMatchObject({
      unitType: 'A',
      locationLabel: 'Burgundy',
      verb: 'RETREAT',
      detail: 'Retreat → Ruhr',
      outcomeLabel: 'Retreated',
      outcomeTone: 'success',
      highlightUnitId: 'GER_A_BUR',
      highlightProvinces: ['BUR', 'RUH'],
    });
  });

  it('captures builds, waives, explicit disbands and auto-disbands in Winter Adjustments', () => {
    const turn = {
      index: 2,
      season: 'Winter',
      year: 1901,
      phase: 'Adjustments',
      ownership: {},
      units: [
        {
          id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          province: 'PAR',
          is_dislodged: false,
        },
        {
          id: 'GER_A_MUN',
          power: 'GERMANY',
          unit_type: 'A',
          province: 'MUN',
          is_dislodged: false,
        },
      ],
      orders: {
        BUILD_FRANCE_PAR: {
          unit_id: 'BUILD_FRANCE_PAR',
          power: 'FRANCE',
          unit_type: 'F',
          origin: 'PAR',
          order_type: 'BUILD',
          via_convoy: false,
          is_explicit: true,
        },
        BUILD_ENGLAND_LON: {
          unit_id: 'BUILD_ENGLAND_LON',
          power: 'ENGLAND',
          unit_type: 'A',
          origin: 'LON',
          order_type: 'WAIVE',
          via_convoy: false,
          is_explicit: true,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: {},
        resolutions: {
          FRA_A_PAR: {
            unit_id: 'FRA_A_PAR',
            origin: 'PAR',
            order_type: 'HOLD',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Retained A in Paris.',
          },
          GER_A_MUN: {
            unit_id: 'GER_A_MUN',
            origin: 'MUN',
            order_type: 'DISBAND',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Auto-disbanded A in Munich (civil disorder deficit).',
          },
          BUILD_FRANCE_PAR: {
            unit_id: 'BUILD_FRANCE_PAR',
            origin: 'PAR',
            order_type: 'BUILD',
            succeeded: true,
            bounced: false,
            cut: false,
            dislodged: false,
            attack_strength: 1,
            defense_strength: 1,
            reason: 'Built Fleet in Paris.',
          },
        },
      },
    } as unknown as TurnRecord;

    const log = buildHistoryTurnLog(turn, PROVINCES, []);
    expect(log.phaseKind).toBe('Adjustments');
    expect(log.totalCount).toBe(3);
    expect(log.groups.map((g) => g.power)).toEqual([
      'FRANCE',
      'ENGLAND',
      'GERMANY',
    ]);
    expect(log.groups[0].entries[0].outcomeLabel).toBe('Built');
    expect(log.groups[1].entries[0].outcomeLabel).toBe('Waived');
    expect(log.groups[2].entries[0]).toMatchObject({
      outcomeLabel: 'Auto-disband',
      outcomeTone: 'danger',
      reason: 'Auto-disbanded A in Munich (civil disorder deficit).',
    });

    const buildsOnly = buildHistoryTurnLog(turn, PROVINCES, [], ['BUILD']);
    expect(buildsOnly.totalCount).toBe(1);
    expect(buildsOnly.groups.map((g) => g.power)).toEqual(['FRANCE']);

    const disbandAndWaive = buildHistoryTurnLog(
      turn,
      PROVINCES,
      [],
      ['DISBAND', 'WAIVE'],
    );
    expect(disbandAndWaive.totalCount).toBe(2);
    expect(disbandAndWaive.groups.map((g) => g.power)).toEqual([
      'ENGLAND',
      'GERMANY',
    ]);
  });

  it('captures unit overrides and territory ownership changes in Admin phase', () => {
    const turn = {
      index: 3,
      season: 'Spring',
      year: 1901,
      phase: 'Admin',
      ownership: { BEL: 'FRANCE', KIE: 'GERMANY' },
      units: [],
      orders: {
        BUILD_GERMANY_KIE: {
          unit_id: 'BUILD_GERMANY_KIE',
          power: 'GERMANY',
          unit_type: 'F',
          origin: 'KIE',
          order_type: 'BUILD',
          via_convoy: false,
          is_explicit: true,
        },
        FRA_A_PAR_HOLD: {
          unit_id: 'FRA_A_PAR',
          power: 'FRANCE',
          unit_type: 'A',
          origin: 'PAR',
          order_type: 'HOLD',
          via_convoy: false,
          is_explicit: false,
        },
      },
      resolution: {
        summary: [],
        new_units: [],
        new_ownership: { BEL: 'GERMANY', KIE: 'GERMANY' },
        resolutions: {},
      },
    } as unknown as TurnRecord;

    const log = buildHistoryTurnLog(turn, PROVINCES, []);
    expect(log.phaseKind).toBe('Admin');
    expect(log.groups).toHaveLength(1);
    expect(log.groups[0].entries[0].verb).toBe('SPAWN');
    expect(log.ownershipChanges).toEqual([
      {
        province: 'BEL',
        provinceName: 'Belgium',
        prevPower: 'FRANCE',
        nextPower: 'GERMANY',
        isSupplyCenter: false,
      },
    ]);

    const onlyFrance = buildHistoryTurnLog(turn, PROVINCES, ['FRANCE']);
    expect(onlyFrance.groups).toHaveLength(0);
    expect(onlyFrance.ownershipChanges).toHaveLength(1);

    const onlyEngland = buildHistoryTurnLog(turn, PROVINCES, ['ENGLAND']);
    expect(onlyEngland.totalCount).toBe(0);
  });

  it('captures Movement territorial & SC changes while ignoring non-SC home territory occupation by its home power', () => {
    const richProvs: Record<string, ProvinceInfo> = {
      ...PROVINCES,
      PIC: {
        name: 'Picardy',
        is_supply_center: false,
        home_power: 'FRANCE',
        type: 'COAST',
      } as ProvinceInfo,
      BUR: {
        name: 'Burgundy',
        is_supply_center: false,
        home_power: 'FRANCE',
        type: 'LAND',
      } as ProvinceInfo,
      BEL: {
        name: 'Belgium',
        is_supply_center: true,
        home_power: null,
        type: 'COAST',
      } as ProvinceInfo,
    };
    const fallTurn = {
      index: 1,
      season: 'Fall',
      year: 1901,
      phase: 'Movement',
      ownership: { PAR: 'FRANCE', MUN: 'GERMANY' },
      units: [],
      orders: {},
      resolution: {
        summary: [],
        new_units: [],
        // PIC claimed by its home power FRANCE (no real change); BUR claimed by GERMANY; BEL captured by GERMANY
        new_ownership: {
          PAR: 'FRANCE',
          MUN: 'GERMANY',
          PIC: 'FRANCE',
          BUR: 'GERMANY',
          BEL: 'GERMANY',
        },
        resolutions: {},
      },
    } as unknown as TurnRecord;

    const log = buildHistoryTurnLog(fallTurn, richProvs, []);
    expect(log.ownershipChanges).toEqual([
      {
        province: 'BEL',
        provinceName: 'Belgium',
        prevPower: null,
        nextPower: 'GERMANY',
        isSupplyCenter: true,
      },
      {
        province: 'BUR',
        provinceName: 'Burgundy',
        prevPower: 'FRANCE',
        nextPower: 'GERMANY',
        isSupplyCenter: false,
      },
    ]);

    expect(
      buildHistoryTurnLog(fallTurn, richProvs, ['FRANCE']).ownershipChanges.map(
        (c) => c.province,
      ),
    ).toEqual(['BUR']);
    expect(
      buildHistoryTurnLog(fallTurn, richProvs, ['ITALY']).ownershipChanges,
    ).toEqual([]);
  });
});
