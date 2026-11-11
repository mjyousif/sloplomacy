// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Order, Power } from '../../../types/diplomacy';
import { buildOrder, waiveOrder } from '../../../utils/orderBuilders';
import { type UseBuildHomesOptions, useBuildHomes } from './useBuildHomes';

type Builds = Record<Power, { count: number; homes: string[] }>;
const BUILDS = {
  FRANCE: { count: 2, homes: ['PAR', 'BRE'] },
  GERMANY: { count: 1, homes: ['KIE'] },
  ITALY: { count: -1, homes: [] },
} as unknown as Builds;

const homes = (opts: Partial<UseBuildHomesOptions>) =>
  renderHook(() =>
    useBuildHomes({
      orders: {},
      builds: BUILDS,
      activePower: 'FRANCE',
      canEditAnyPower: false,
      historyView: false,
      historyPower: null,
      isAdjustmentPhase: true,
      ...opts,
    }),
  ).result.current;

describe('useBuildHomes', () => {
  it('gives the player their own open homes this winter', () => {
    expect(homes({})).toEqual({ PAR: 'FRANCE', BRE: 'FRANCE' });
  });

  it("gives every power's homes where any power can be edited", () => {
    expect(homes({ canEditAnyPower: true })).toEqual({
      PAR: 'FRANCE',
      BRE: 'FRANCE',
      KIE: 'GERMANY',
    });
  });

  it('gives none outside a winter, or before builds are known', () => {
    expect(homes({ isAdjustmentPhase: false })).toEqual({});
    expect(homes({ builds: null })).toEqual({});
  });

  it("shows a past winter's builds by every power, or the chosen one", () => {
    const orders: Record<string, Order> = {
      BUILD_FRANCE_PAR: buildOrder(
        'BUILD_FRANCE_PAR',
        'FRANCE',
        'PAR',
        'A',
        null,
      ),
      BUILD_FRANCE_BRE: waiveOrder('BUILD_FRANCE_BRE', 'FRANCE', 'BRE'),
      BUILD_GERMANY_KIE: buildOrder(
        'BUILD_GERMANY_KIE',
        'GERMANY',
        'KIE',
        'F',
        null,
      ),
    };
    expect(homes({ historyView: true, orders })).toEqual({
      PAR: 'FRANCE',
      KIE: 'GERMANY',
    });
    expect(
      homes({ historyView: true, orders, historyPower: 'GERMANY' }),
    ).toEqual({ KIE: 'GERMANY' });
    expect(
      homes({ historyView: true, orders, isAdjustmentPhase: false }),
    ).toEqual({});
  });
});
