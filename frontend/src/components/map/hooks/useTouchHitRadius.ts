import { useMemo } from 'react';
import type { Point } from '../../../data/europeMapGeometry';
import type { Power, Unit } from '../../../types/diplomacy';
import {
  compactHitRadius,
  halfNearestDistances,
} from '../../../utils/mapCameraHelpers';
import type { PieceFrame } from '../../MapPiece';

export interface UseTouchHitRadiusOptions {
  compact: boolean;
  units: Unit[];
  controllableBuildHomes: Record<string, Power>;
  getUnitPoint: (unit: Unit) => Point;
  getProvincePoint: (provCode: string, coast?: string | null) => Point;
  /** Screen pixels per board unit once the zoom settles (the camera's `touchPxPerUnit`). */
  touchPxPerUnit: number;
}

/**
 * How big each piece's tap target is on a phone: at least a finger's width on screen, but never
 * reaching a neighbour's. Returns 0 on a wide screen, where pieces keep their own hit areas.
 */
export function useTouchHitRadius({
  compact,
  units,
  controllableBuildHomes,
  getUnitPoint,
  getProvincePoint,
  touchPxPerUnit,
}: UseTouchHitRadiusOptions): (pieceId: string, frame: PieceFrame) => number {
  // Phone: how far each piece's tap target may grow before it would reach a neighbour's.
  const touchHitCaps = useMemo(() => {
    if (!compact) return null;
    const points: Record<string, Point> = {};
    for (const u of units) points[u.id] = getUnitPoint(u);
    for (const [homeProv, pwr] of Object.entries(controllableBuildHomes)) {
      points[`BUILD_${pwr}_${homeProv}`] = getProvincePoint(homeProv);
    }
    return halfNearestDistances(points);
  }, [compact, units, controllableBuildHomes, getUnitPoint, getProvincePoint]);

  // The extra tap radius a piece gets on a phone, or 0 on a wide screen.
  return (pieceId: string, frame: PieceFrame): number =>
    touchHitCaps
      ? compactHitRadius(
          frame.hitRadius,
          touchPxPerUnit,
          touchHitCaps[pieceId] ?? Infinity,
        )
      : 0;
}
