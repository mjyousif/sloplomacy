import { useCallback, useMemo } from 'react';
import {
  EUROPE_PROVINCE_GEOMETRY,
  type Point,
} from '../../../data/europeMapGeometry';
import {
  type FlagDirection,
  getMapLayout,
  type MapLayout,
  SEA_SHORT_NAMES,
} from '../../../data/mapLayouts';
import type { Power, ProvinceInfo, Unit } from '../../../types/diplomacy';
import type { PieceStyle } from '../../../utils/displayPrefs';
import {
  getPieceArrowScale,
  getPieceFrame,
  makePiecePill,
  type PieceFrame,
} from '../../MapPiece';

export interface UsePieceGeometryOptions {
  units: Unit[];
  provinces: Record<string, ProvinceInfo>;
  pieceStyle: PieceStyle;
  activePower: Power;
}

export interface PieceGeometry {
  unitsByProv: Record<string, Unit>;
  dislodgedByProv: Record<string, Unit>;
  unitsById: Record<string, Unit>;
  /** Where each province's piece, star and name sit in the active style. */
  layout: MapLayout;
  /** How far the active style pushes arrows off a piece. */
  arrowScale: number;
  /** How big rings around pieces are in the active style. */
  pieceRingScale: number;
  getProvincePoint: (provCode: string, coast?: string | null) => Point;
  /** How a piece standing in this province is drawn in the active style. */
  describePiece: (
    province: string,
    coast: string | null | undefined,
    showStar: boolean,
  ) => { flagDirection: FlagDirection; frame: PieceFrame };
  /** A unit's point, stepped aside if it was dislodged by a unit now in its province. */
  getUnitPoint: (unit: Unit) => Point;
  /** Where a phone's camera starts: the middle of the player's own units, if they have any. */
  ownUnitsCentre: Point | null;
  /** Provinces a unit stands in, sorted and joined, so the static layers can skip re-rendering. */
  occupiedProvinces: string;
}

/** Where pieces stand on the board and how they are drawn, in the player's piece style. */
export function usePieceGeometry({
  units,
  provinces,
  pieceStyle,
  activePower,
}: UsePieceGeometryOptions): PieceGeometry {
  const { unitsByProv, dislodgedByProv, unitsById } = useMemo(() => {
    const byProv: Record<string, Unit> = {};
    const dislodged: Record<string, Unit> = {};
    const byId: Record<string, Unit> = {};
    for (const u of units) {
      if (u.is_dislodged) {
        dislodged[u.province] = u;
      } else {
        byProv[u.province] = u;
      }
      byId[u.id] = u;
    }
    return {
      unitsByProv: byProv,
      dislodgedByProv: dislodged,
      unitsById: byId,
    };
  }, [units]);

  const layout = getMapLayout(pieceStyle);
  const arrowScale = getPieceArrowScale(pieceStyle);
  const pieceRingScale = getPieceFrame(pieceStyle).ringScale;

  const getProvincePoint = useCallback(
    (provCode: string, coast?: string | null): Point => {
      const geom = EUROPE_PROVINCE_GEOMETRY[provCode];
      if (!geom) return { x: 760, y: 680 };
      if (coast && geom.coastPositions && geom.coastPositions[coast]) {
        return geom.coastPositions[coast];
      }
      return layout[provCode]?.unit ?? geom.unitPos;
    },
    [layout],
  );

  /** How a piece standing in this province is drawn in the active style. */
  const describePiece = useCallback(
    (province: string, coast: string | null | undefined, showStar: boolean) => {
      const entry = layout[province];
      const flagDirection = entry?.flagDirection ?? 1;
      if (pieceStyle !== 'nameplate') {
        return {
          flagDirection,
          frame: getPieceFrame(pieceStyle, flagDirection),
        };
      }
      const baseName =
        SEA_SHORT_NAMES[province] ?? provinces[province]?.name ?? province;
      const pill = makePiecePill(
        coast ? `${baseName} ${coast}` : baseName,
        entry?.name?.size ?? 12.5,
        coast ? 0 : (entry?.name?.angle ?? 0),
        showStar,
      );
      return {
        flagDirection,
        frame: getPieceFrame(pieceStyle, flagDirection, pill),
      };
    },
    [layout, pieceStyle, provinces],
  );

  const getUnitPoint = useCallback(
    (unit: Unit): Point => {
      const basePt = getProvincePoint(unit.province, unit.coast);
      if (unit.is_dislodged && unitsByProv[unit.province]) {
        const { dislodgeOffset } = describePiece(
          unit.province,
          unit.coast,
          false,
        ).frame;
        return {
          x: basePt.x + dislodgeOffset.x,
          y: basePt.y + dislodgeOffset.y,
        };
      }
      return basePt;
    },
    [unitsByProv, getProvincePoint, describePiece],
  );

  // Where a phone's camera starts: the middle of the player's own units, if they have any.
  const ownUnitsCentre = useMemo((): Point | null => {
    const own = units.filter((u) => u.power === activePower && !u.is_dislodged);
    if (own.length === 0) return null;
    const pts = own.map((u) => getUnitPoint(u));
    return {
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    };
  }, [units, activePower, getUnitPoint]);

  // Provinces whose star or name a unit is standing on, as a string so the static layers can skip re-rendering
  const occupiedProvinces = Object.keys({
    ...unitsByProv,
    ...dislodgedByProv,
  })
    .sort()
    .join(',');

  return {
    unitsByProv,
    dislodgedByProv,
    unitsById,
    layout,
    arrowScale,
    pieceRingScale,
    getProvincePoint,
    describePiece,
    getUnitPoint,
    ownUnitsCentre,
    occupiedProvinces,
  };
}
