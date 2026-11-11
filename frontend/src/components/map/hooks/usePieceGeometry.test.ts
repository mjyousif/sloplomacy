// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EUROPE_PROVINCE_GEOMETRY } from '../../../data/europeMapGeometry';
import { getMapLayout } from '../../../data/mapLayouts';
import { FRANCE_PROVINCES, unitAt } from '../../../test/mapFixtures';
import type { ProvinceInfo, Unit } from '../../../types/diplomacy';
import type { PieceStyle } from '../../../utils/displayPrefs';
import { getPieceArrowScale, getPieceFrame } from '../../MapPiece';
import { usePieceGeometry } from './usePieceGeometry';

const PROVINCES: Record<string, ProvinceInfo> = {
  ...FRANCE_PROVINCES,
  STP: {
    ...FRANCE_PROVINCES.BRE,
    id: 'STP',
    name: 'St. Petersburg',
    coasts: ['NC', 'SC'],
  },
};

function geometry(units: Unit[], pieceStyle: PieceStyle = 'classic') {
  return renderHook(() =>
    usePieceGeometry({
      units,
      provinces: PROVINCES,
      pieceStyle,
      activePower: 'FRANCE',
    }),
  ).result.current;
}

const A_PAR = unitAt('FRANCE', 'A', 'PAR');
const A_MAR = unitAt('FRANCE', 'A', 'MAR');
const A_BUR_GER = unitAt('GERMANY', 'A', 'BUR');
const A_BUR_OUT = unitAt('FRANCE', 'A', 'BUR', { is_dislodged: true });

describe('usePieceGeometry', () => {
  it('indexes units by id, and by province apart from dislodged ones', () => {
    const g = geometry([A_PAR, A_BUR_GER, A_BUR_OUT]);
    expect(g.unitsById).toEqual({
      [A_PAR.id]: A_PAR,
      [A_BUR_GER.id]: A_BUR_GER,
      [A_BUR_OUT.id]: A_BUR_OUT,
    });
    expect(g.unitsByProv).toEqual({ PAR: A_PAR, BUR: A_BUR_GER });
    expect(g.dislodgedByProv).toEqual({ BUR: A_BUR_OUT });
  });

  it("puts a piece where the active style's layout says", () => {
    for (const style of ['classic', 'seated', 'flags'] as const) {
      const g = geometry([], style);
      const layout = getMapLayout(style);
      expect(g.getProvincePoint('PAR')).toEqual(
        layout.PAR?.unit ?? EUROPE_PROVINCE_GEOMETRY.PAR.unitPos,
      );
      expect(g.arrowScale).toBe(getPieceArrowScale(style));
      expect(g.pieceRingScale).toBe(getPieceFrame(style).ringScale);
    }
  });

  it("puts a fleet on its coast's own point, and an unknown province mid-map", () => {
    const g = geometry([]);
    expect(g.getProvincePoint('STP', 'NC')).toEqual(
      EUROPE_PROVINCE_GEOMETRY.STP.coastPositions?.NC,
    );
    expect(g.getProvincePoint('XYZ')).toEqual({ x: 760, y: 680 });
  });

  it('steps a dislodged unit aside, but only while another unit holds its province', () => {
    const shared = geometry([A_BUR_GER, A_BUR_OUT]);
    const base = shared.getProvincePoint('BUR');
    const { dislodgeOffset } = shared.describePiece('BUR', null, false).frame;
    expect(shared.getUnitPoint(A_BUR_OUT)).toEqual({
      x: base.x + dislodgeOffset.x,
      y: base.y + dislodgeOffset.y,
    });
    expect(shared.getUnitPoint(A_BUR_GER)).toEqual(base);

    const alone = geometry([A_BUR_OUT]);
    expect(alone.getUnitPoint(A_BUR_OUT)).toEqual(base);
  });

  it('names a Name as piece pill after its province, with the coast for a fleet', () => {
    const g = geometry([], 'nameplate');
    expect(g.describePiece('PAR', null, false).frame.pill?.name).toBe('Paris');
    expect(g.describePiece('STP', 'NC', false).frame.pill?.name).toBe(
      'St. Petersburg NC',
    );
    expect(g.describePiece('PAR', null, true).frame.pill?.hasStar).toBe(true);
    expect(
      geometry([], 'classic').describePiece('PAR', null, false).frame.pill,
    ).toBeNull();
  });

  it("centres a phone's camera on the player's own units", () => {
    const g = geometry([A_PAR, A_MAR, A_BUR_GER]);
    const par = g.getProvincePoint('PAR');
    const mar = g.getProvincePoint('MAR');
    expect(g.ownUnitsCentre).toEqual({
      x: (par.x + mar.x) / 2,
      y: (par.y + mar.y) / 2,
    });
    expect(geometry([A_BUR_GER]).ownUnitsCentre).toBeNull();
  });

  it('lists the occupied provinces sorted, dislodged units included', () => {
    expect(geometry([A_PAR, A_MAR, A_BUR_OUT]).occupiedProvinces).toBe(
      'BUR,MAR,PAR',
    );
  });
});
