import type { Point } from '../../../../data/europeMapGeometry';
import type { FlagDirection } from '../../../../data/mapLayouts';
import type {
  Order,
  ProvinceInfo,
  SimulationResult,
  Unit,
  ValidationIssue,
} from '../../../../types/diplomacy';
import type { PieceStyle, UnitMark } from '../../../../utils/displayPrefs';
import type { PieceFrame } from '../../../MapPiece';

/** Everything the order arrows read from the map, handed down in one object. */
export interface OrderLayerContext {
  orders: Record<string, Order>;
  provinces: Record<string, ProvinceInfo>;
  /** Whose orders are drawn. */
  isUnitOrderVisible: (u: Unit) => boolean;
  issuesByUnit: Record<string, ValidationIssue[]>;
  supportCountByUnitId: Record<string, number>;
  moveMidpointsByOrigin: Record<string, Point>;
  getUnitPoint: (unit: Unit) => Point;
  getProvincePoint: (provCode: string, coast?: string | null) => Point;
  /** How a piece standing in a province is drawn in the active style (for a move's ghost). */
  describePiece: (
    province: string,
    coast: string | null | undefined,
    showStar: boolean,
  ) => { flagDirection: FlagDirection; frame: PieceFrame };
  pieceStyle: PieceStyle;
  unitMark: UnitMark;
  /** How big rings around pieces are in the active style. */
  pieceRingScale: number;
  /** How far the active style pushes arrows off a piece. */
  arrowScale: number;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  showSimulationOverlay: boolean;
  sandboxMode: boolean;
  simulationResult: SimulationResult | null;
}
