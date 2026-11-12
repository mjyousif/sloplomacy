import { describe, expect, it } from 'vitest';
import {
  A_BRE,
  A_PAR,
  ALL_UNITS,
  F_ENG,
  FRENCH_UNITS,
  HOLD_ORDERS,
  issue,
  MACRO_PROVINCES,
  participantsFor,
} from '../test/macroFixtures';
import { orderFor, unitAt } from '../test/mapFixtures';
import type { Power } from '../types/diplomacy';
import { computeOrderProgress, getRequiredPowers } from './orderProgress';

const OWNERSHIP: Record<string, Power> = {
  PAR: 'FRANCE',
  BRE: 'FRANCE',
  MAR: 'FRANCE',
  LON: 'ENGLAND',
};

const progress = (
  over: Partial<Parameters<typeof computeOrderProgress>[0]> = {},
) =>
  computeOrderProgress({
    units: ALL_UNITS,
    orders: HOLD_ORDERS,
    ownership: OWNERSHIP,
    provinces: MACRO_PROVINCES,
    activePower: 'FRANCE',
    issues: [],
    builds: null,
    isAdjustmentPhase: false,
    isRetreatPhase: false,
    ...over,
  });

const required = (
  over: Partial<Parameters<typeof getRequiredPowers>[0]> = {},
) =>
  getRequiredPowers({
    isMultiplayer: true,
    participants: participantsFor(['FRANCE', 'ENGLAND', 'GERMANY']),
    surrenderedPowers: [],
    isAdjustmentPhase: false,
    isRetreatPhase: false,
    builds: null,
    retreats: null,
    units: ALL_UNITS,
    ...over,
  });

describe('getRequiredPowers', () => {
  it('is empty outside multiplayer or without participants', () => {
    expect(required({ isMultiplayer: false })).toEqual([]);
    expect(required({ participants: undefined })).toEqual([]);
    expect(required({ participants: {} })).toEqual([]);
  });

  it('asks every player with units in a movement phase', () => {
    // Germany holds a seat but no units.
    expect(required()).toEqual(['FRANCE', 'ENGLAND']);
  });

  it('leaves out surrendered players, by flag or by the match list', () => {
    expect(
      required({
        participants: {
          ...participantsFor(['FRANCE']),
          ...participantsFor(['ENGLAND'], { surrendered: true }),
        },
      }),
    ).toEqual(['FRANCE']);
    expect(required({ surrenderedPowers: ['ENGLAND'] })).toEqual(['FRANCE']);
  });

  it('asks only powers with a dislodged unit or a retreat option in a retreat phase', () => {
    const dislodged = unitAt('ENGLAND', 'A', 'LON', { is_dislodged: true });
    expect(
      required({ isRetreatPhase: true, units: [A_PAR, dislodged] }),
    ).toEqual(['ENGLAND']);
    expect(
      required({
        isRetreatPhase: true,
        units: [A_PAR],
        retreats: {
          FRANCE: { PAR: ['BUR'] },
          ENGLAND: {},
        } as unknown as Record<Power, Record<string, string[]>>,
      }),
    ).toEqual(['FRANCE']);
  });

  it('asks every player in winter when no build table was sent', () => {
    expect(required({ isAdjustmentPhase: true, builds: null })).toEqual([
      'FRANCE',
      'ENGLAND',
      'GERMANY',
    ]);
  });

  it('asks only powers owed disbands, or builds with a free home, in winter', () => {
    const builds = {
      FRANCE: { count: -1, homes: [] },
      ENGLAND: { count: 1, homes: [] }, // owed a build but every home is occupied
      GERMANY: { count: 1, homes: ['BER'] },
    } as unknown as Record<Power, { count: number; homes: string[] }>;
    expect(required({ isAdjustmentPhase: true, builds })).toEqual([
      'FRANCE',
      'GERMANY',
    ]);
  });
});

describe('computeOrderProgress', () => {
  it('indexes the units standing on the board by province', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const p = progress({ units: [...ALL_UNITS, dislodged] });
    expect(Object.keys(p.unitsByProv).sort()).toEqual(
      ['BRE', 'ENG', 'PAR', 'PIC'].sort(),
    );
  });

  it('counts supply centers by owner and ignores unknown powers', () => {
    const p = progress({
      ownership: { ...OWNERSHIP, XXX: 'NOBODY' as Power },
    });
    expect(p.scCountByPower.FRANCE).toBe(3);
    expect(p.scCountByPower.ENGLAND).toBe(1);
    expect(p.scCountByPower.GERMANY).toBe(0);
    expect('NOBODY' in p.scCountByPower).toBe(false);
  });

  it("lists only the power's units and puts the dislodged first in a retreat phase", () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const units = [A_PAR, dislodged, F_ENG, A_BRE];
    expect(progress({ units }).myUnits.map((u) => u.id)).toEqual(
      units.map((u) => u.id),
    );
    const retreat = progress({ units, isRetreatPhase: true });
    expect(retreat.myUnits[0].id).toBe(dislodged.id);
    expect(retreat.myDislodgedUnits).toEqual([dislodged]);
    expect(retreat.myActiveFieldUnits.map((u) => u.id)).toEqual([
      A_PAR.id,
      F_ENG.id,
      A_BRE.id,
    ]);
  });

  it("keeps the power's issues, the blocking ones and the issues by unit", () => {
    const warn = issue(A_PAR, 'warning');
    const info = issue(A_PAR, 'info');
    const theirs = issue(unitAt('ENGLAND', 'A', 'PIC'), 'error');
    const p = progress({ issues: [warn, info, theirs] });
    expect(p.myIssues).toEqual([warn, info]);
    expect(p.myBlockingIssues).toEqual([warn]);
    expect(p.issuesByUnit[A_PAR.id]).toEqual([warn, info]);
    expect(p.issuesByUnit[theirs.unit_ids[0]]).toBeUndefined();
  });

  it("counts a movement phase's explicit orders as confirmed", () => {
    const p = progress({
      orders: {
        ...HOLD_ORDERS,
        [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'BUR' }),
      },
    });
    expect(p.totalActionableCount).toBe(3);
    expect(p.confirmedCount).toBe(1);
    expect(p.unconfirmedCount).toBe(2);
  });

  it('counts only the dislodged units in a retreat phase', () => {
    const dislodged = unitAt('FRANCE', 'A', 'MAR', { is_dislodged: true });
    const p = progress({
      units: [A_PAR, dislodged],
      orders: {
        [dislodged.id]: orderFor(dislodged, 'RETREAT', { target: 'GAS' }),
      },
      isRetreatPhase: true,
    });
    expect(p.totalActionableCount).toBe(1);
    expect(p.confirmedCount).toBe(1);
    expect(p.unconfirmedCount).toBe(0);
  });

  describe('in winter', () => {
    it('works out builds from supply centers when no table was sent', () => {
      // 3 centers, 3 units standing; PAR and BRE hold units, MAR is free.
      const p = progress({
        units: [A_PAR, A_BRE],
        isAdjustmentPhase: true,
      });
      expect(p.buildCount).toBe(1);
      expect(p.buildHomes).toEqual(['MAR']);
      expect(p.maxAllowedBuilds).toBe(1);
      expect(p.totalActionableCount).toBe(1);
      expect(p.unconfirmedCount).toBe(1);
    });

    it("uses the server's build table when there is one, capped by the free homes", () => {
      const p = progress({
        builds: {
          FRANCE: { count: 3, homes: ['MAR', 'BRE'] },
        } as unknown as Record<Power, { count: number; homes: string[] }>,
        orders: {
          BUILD_FRANCE_MAR: orderFor(A_PAR, 'BUILD', {
            unit_id: 'BUILD_FRANCE_MAR',
          }),
          BUILD_FRANCE_BRE: orderFor(A_PAR, 'WAIVE', {
            unit_id: 'BUILD_FRANCE_BRE',
            is_explicit: false,
          }),
        },
        isAdjustmentPhase: true,
      });
      expect(p.buildCount).toBe(3);
      expect(p.maxAllowedBuilds).toBe(2);
      expect(p.assignedBuildsCount).toBe(1);
      expect(p.totalActionableCount).toBe(2);
      // The waived slot was filled in by the server, not chosen by the player.
      expect(p.confirmedCount).toBe(1);
    });

    it('counts a slot as assigned only when it is a build, not a waive', () => {
      const builds = {
        FRANCE: { count: 2, homes: ['MAR', 'BRE'] },
      } as unknown as Record<Power, { count: number; homes: string[] }>;
      const slot = (home: string, type: 'BUILD' | 'WAIVE') => [
        `BUILD_FRANCE_${home}`,
        orderFor(A_PAR, type, { unit_id: `BUILD_FRANCE_${home}` }),
      ];
      const both = progress({
        builds,
        orders: Object.fromEntries([
          slot('MAR', 'BUILD'),
          slot('BRE', 'BUILD'),
        ]),
        isAdjustmentPhase: true,
      });
      expect(both.assignedBuildsCount).toBe(2);
      const waived = progress({
        builds,
        orders: Object.fromEntries([
          slot('MAR', 'WAIVE'),
          slot('BRE', 'WAIVE'),
        ]),
        isAdjustmentPhase: true,
      });
      expect(waived.assignedBuildsCount).toBe(0);
    });

    it('counts the disbands owed and chosen when a power is over strength', () => {
      const p = progress({
        builds: {
          FRANCE: { count: -2, homes: [] },
        } as unknown as Record<Power, { count: number; homes: string[] }>,
        orders: { [A_PAR.id]: orderFor(A_PAR, 'DISBAND') },
        isAdjustmentPhase: true,
      });
      expect(p.neededDisbands).toBe(2);
      expect(p.assignedDisbandsCount).toBe(1);
      expect(p.totalActionableCount).toBe(2);
      expect(p.confirmedCount).toBe(1);
      expect(p.unconfirmedCount).toBe(1);
    });

    it('has nothing to confirm when the units match the centers, or no home is free', () => {
      const even = progress({
        units: FRENCH_UNITS,
        isAdjustmentPhase: true,
      });
      expect(even.buildCount).toBe(0);
      expect(even.totalActionableCount).toBe(0);
      expect(even.unconfirmedCount).toBe(0);

      const blocked = progress({
        builds: {
          FRANCE: { count: 1, homes: [] },
        } as unknown as Record<Power, { count: number; homes: string[] }>,
        isAdjustmentPhase: true,
      });
      expect(blocked.maxAllowedBuilds).toBe(0);
      expect(blocked.totalActionableCount).toBe(0);
    });
  });
});
