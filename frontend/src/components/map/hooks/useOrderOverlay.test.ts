// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Point } from '../../../data/europeMapGeometry';
import { FRANCE_PROVINCES, orderFor, unitAt } from '../../../test/mapFixtures';
import type {
  IssueCode,
  Order,
  Power,
  Unit,
  ValidationIssue,
} from '../../../types/diplomacy';
import { computeQuadraticCurve } from '../utils/curveGeometry';
import {
  type UseOrderOverlayOptions,
  useOrderOverlay,
} from './useOrderOverlay';

const POINTS: Record<string, Point> = {
  PAR: { x: 560, y: 760 },
  BUR: { x: 640, y: 780 },
  PIC: { x: 560, y: 680 },
  GAS: { x: 480, y: 900 },
  MAR: { x: 620, y: 1000 },
  BRE: { x: 420, y: 720 },
};

const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_BUR = unitAt('FRANCE', 'A', 'BUR');
const A_GAS = unitAt('FRANCE', 'A', 'GAS');
const A_PIC_GER = unitAt('GERMANY', 'A', 'PIC');

const issue = (
  id: string,
  power: Power,
  unit_ids: string[],
  provinces: string[],
): ValidationIssue => ({
  id,
  severity: 'warning',
  code: 'SELF_BOUNCE' as IssueCode,
  title: id,
  message: id,
  unit_ids,
  provinces,
  power,
});

function overlay(opts: Partial<UseOrderOverlayOptions> & { units: Unit[] }) {
  const units = opts.units;
  const unitsByProv: Record<string, Unit> = {};
  for (const u of units) if (!u.is_dislodged) unitsByProv[u.province] = u;
  return renderHook(() =>
    useOrderOverlay({
      orders: {},
      provinces: FRANCE_PROVINCES,
      issues: [],
      unitsByProv,
      activePower: 'FRANCE',
      canEditAnyPower: false,
      historyView: false,
      historyPower: null,
      isRetreatPhase: false,
      isAdjustmentPhase: false,
      getUnitPoint: (u) => POINTS[u.province],
      getProvincePoint: (p) => POINTS[p],
      arrowScale: 1,
      ...opts,
    }),
  ).result.current;
}

describe('useOrderOverlay', () => {
  it("groups the player's own issues by unit and by province", () => {
    const mine = issue('mine', 'FRANCE', [A_PAR.id], ['PAR', 'BUR']);
    const theirs = issue('theirs', 'GERMANY', [A_PIC_GER.id], ['PIC']);
    const { issuesByUnit, issuesByProvince } = overlay({
      units: [A_PAR, A_PIC_GER],
      issues: [mine, theirs],
    });
    expect(issuesByUnit).toEqual({ [A_PAR.id]: [mine] });
    expect(issuesByProvince).toEqual({ PAR: [mine], BUR: [mine] });
  });

  it("shows every power's issues where any power can be edited", () => {
    const theirs = issue('theirs', 'GERMANY', [A_PIC_GER.id], ['PIC']);
    const { issuesByUnit } = overlay({
      units: [A_PIC_GER],
      issues: [theirs],
      canEditAnyPower: true,
    });
    expect(issuesByUnit[A_PIC_GER.id]).toEqual([theirs]);
  });

  it("draws the player's own orders, everyone's in the sandbox, and a past turn's by nation", () => {
    const own = overlay({ units: [A_PAR, A_PIC_GER] }).isUnitOrderVisible;
    expect([own(A_PAR), own(A_PIC_GER)]).toEqual([true, false]);

    const sandbox = overlay({
      units: [],
      canEditAnyPower: true,
    }).isUnitOrderVisible;
    expect(sandbox(A_PIC_GER)).toBe(true);

    const past = overlay({
      units: [],
      historyView: true,
      historyPower: null,
    }).isUnitOrderVisible;
    expect([past(A_PAR), past(A_PIC_GER)]).toEqual([true, true]);
    const pastGermany = overlay({
      units: [],
      historyView: true,
      historyPower: 'GERMANY',
    }).isUnitOrderVisible;
    expect([pastGermany(A_PAR), pastGermany(A_PIC_GER)]).toEqual([false, true]);
  });

  it('counts a support into a move only when the move goes where the support does', () => {
    const orders: Record<string, Order> = {
      [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'PIC' }),
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PIC',
      }),
      [A_GAS.id]: orderFor(A_GAS, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'BRE',
      }),
    };
    const { supportCountByUnitId } = overlay({
      units: [A_PAR, A_BUR, A_GAS],
      orders,
    });
    expect(supportCountByUnitId).toEqual({ [A_PAR.id]: 1 });
  });

  it('counts a support to hold for any unit that is not moving', () => {
    const orders: Record<string, Order> = {
      [A_PAR.id]: orderFor(A_PAR, 'SUPPORT', {
        aux_unit_origin: 'BUR',
        target: 'BUR',
      }),
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PAR',
      }),
    };
    const { supportCountByUnitId } = overlay({
      units: [A_PAR, A_BUR],
      orders,
    });
    expect(supportCountByUnitId).toEqual({ [A_PAR.id]: 1, [A_BUR.id]: 1 });
  });

  it("doesn't count a support to hold for a unit that is moving away", () => {
    const orders: Record<string, Order> = {
      [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'PIC' }),
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PAR',
      }),
    };
    expect(
      overlay({ units: [A_PAR, A_BUR], orders }).supportCountByUnitId,
    ).toEqual({});
  });

  it("doesn't count a support the supporter could not give", () => {
    // Gascony does not border Picardy.
    const orders: Record<string, Order> = {
      [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'PIC' }),
      [A_GAS.id]: orderFor(A_GAS, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PIC',
      }),
    };
    expect(
      overlay({ units: [A_PAR, A_GAS], orders }).supportCountByUnitId,
    ).toEqual({});
  });

  it("doesn't count supports outside movement phases", () => {
    const orders: Record<string, Order> = {
      [A_BUR.id]: orderFor(A_BUR, 'SUPPORT', {
        aux_unit_origin: 'PAR',
        target: 'PAR',
      }),
    };
    for (const phase of ['isRetreatPhase', 'isAdjustmentPhase'] as const) {
      const { supportCountByUnitId } = overlay({
        units: [A_PAR, A_BUR],
        orders,
        [phase]: true,
      });
      expect(supportCountByUnitId).toEqual({});
    }
  });

  it("puts each move arrow's middle under its origin, for supports to point at", () => {
    const orders: Record<string, Order> = {
      [A_PAR.id]: orderFor(A_PAR, 'MOVE', { target: 'BUR' }),
    };
    const { moveMidpointsByOrigin } = overlay({
      units: [A_PAR, A_PIC_GER],
      orders,
      arrowScale: 1.2,
    });
    expect(moveMidpointsByOrigin).toEqual({
      PAR: computeQuadraticCurve(POINTS.PAR, POINTS.BUR, 0.14, 1.2).mid,
    });
  });
});
