import type { Point } from '../../../../data/europeMapGeometry';
import {
  PieceOutline,
  type PieceUnitType,
  pieceCarriesStar,
} from '../../../MapPiece';
import type { OrderLayerContext } from './orderLayerContext';

/**
 * An order's ring around the piece standing in `province` (a supported unit holding, or a
 * convoying fleet), fitted to that piece's shape in the active style like the units layer's
 * own rings: a circle round a token, a box round a whole flag, the outline of a name plate.
 */
export function PieceRingAt({
  ctx,
  point,
  province,
  coast,
  unitType,
  radius,
  stroke,
  strokeWidth,
  strokeDasharray,
}: {
  ctx: OrderLayerContext;
  point: Point;
  province: string;
  coast?: string | null;
  unitType?: PieceUnitType;
  /** The ring's size around a classic token, as for `PieceOutline`. */
  radius: number;
  stroke: string;
  strokeWidth: string;
  strokeDasharray?: string;
}) {
  // The same frame the units layer draws the piece with, so a plate's ring is as wide as it.
  const { frame } = ctx.describePiece(
    province,
    coast,
    pieceCarriesStar(
      ctx.pieceStyle,
      Boolean(ctx.provinces[province]?.is_supply_center),
    ),
  );
  return (
    <g transform={`translate(${point.x}, ${point.y})`}>
      <PieceOutline
        frame={frame}
        unitType={unitType}
        radius={radius}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
    </g>
  );
}
