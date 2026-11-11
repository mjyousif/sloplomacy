// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Point } from '../../../data/europeMapGeometry';
import { unitAt } from '../../../test/mapFixtures';
import type { Power } from '../../../types/diplomacy';
import { MIN_TOUCH_RADIUS_PX } from '../../../utils/mapCameraHelpers';
import { getPieceFrame } from '../../MapPiece';
import {
  type UseTouchHitRadiusOptions,
  useTouchHitRadius,
} from './useTouchHitRadius';

const POINTS: Record<string, Point> = {
  PAR: { x: 500, y: 500 },
  BUR: { x: 540, y: 500 },
  MAR: { x: 500, y: 900 },
};
const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_BUR = unitAt('FRANCE', 'A', 'BUR');
const FRAME = getPieceFrame('classic');

const radius = (opts: Partial<UseTouchHitRadiusOptions>) =>
  renderHook(() =>
    useTouchHitRadius({
      compact: true,
      units: [A_PAR, A_BUR],
      controllableBuildHomes: {},
      getUnitPoint: (u) => POINTS[u.province],
      getProvincePoint: (p) => POINTS[p],
      touchPxPerUnit: 0.5,
      ...opts,
    }),
  ).result.current;

describe('useTouchHitRadius', () => {
  it('adds nothing on a wide screen', () => {
    expect(radius({ compact: false })(A_PAR.id, FRAME)).toBe(0);
  });

  it("grows a phone's tap target to a finger's width, short of its neighbour", () => {
    // 40 board units apart: each target may reach halfway, 20.
    expect(radius({})(A_PAR.id, FRAME)).toBe(
      Math.max(FRAME.hitRadius, Math.min(MIN_TOUCH_RADIUS_PX / 0.5, 20)),
    );
  });

  it('lets a lone piece grow to the full finger width', () => {
    const lone = unitAt('FRANCE', 'A', 'MAR');
    expect(radius({ units: [lone] })(lone.id, FRAME)).toBe(
      Math.max(FRAME.hitRadius, MIN_TOUCH_RADIUS_PX / 0.5),
    );
  });

  it('counts build slots as neighbours', () => {
    const lone = unitAt('FRANCE', 'A', 'PAR');
    const withSlot = radius({
      units: [lone],
      controllableBuildHomes: { BUR: 'FRANCE' as Power },
    });
    expect(withSlot(lone.id, FRAME)).toBe(
      Math.max(FRAME.hitRadius, Math.min(MIN_TOUCH_RADIUS_PX / 0.5, 20)),
    );
    expect(withSlot('BUILD_FRANCE_BUR', FRAME)).toBe(withSlot(lone.id, FRAME));
  });

  it("keeps a piece's own hit area until the zoom has settled", () => {
    expect(radius({ touchPxPerUnit: 0 })(A_PAR.id, FRAME)).toBe(
      FRAME.hitRadius,
    );
  });
});
