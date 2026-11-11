import type React from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  SimulationResult,
  Unit,
  ValidationIssue,
} from '../../../../types/diplomacy';
import type { PieceStyle, UnitMark } from '../../../../utils/displayPrefs';
import type { PieceFrame } from '../../../MapPiece';
import type { MapInteractionMode } from '../../hooks/useMapInteraction';
import type { PieceGeometry } from '../../hooks/usePieceGeometry';

/** Everything a unit token reads from the map, handed down in one object. */
export interface UnitLayerContext {
  orders: Record<string, Order>;
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  unitsByProv: Record<string, Unit>;
  /** The power the player commands, or null on a past turn. */
  controlPower: Power | null;
  canEditAnyPower: boolean;
  activePower: Power;
  selectedUnit: Unit | null;
  interactionMode?: MapInteractionMode;
  hoveredUnitId: string | null;
  isUnitOrderVisible: (u: Unit) => boolean;
  issuesByUnit: Record<string, ValidationIssue[]>;
  supportCountByUnitId: Record<string, number>;
  showSimulationOverlay: boolean;
  sandboxMode: boolean;
  simulationResult: SimulationResult | null;
  pieceStyle: PieceStyle;
  unitMark: UnitMark;
  getUnitPoint: PieceGeometry['getUnitPoint'];
  describePiece: PieceGeometry['describePiece'];
  touchHitRadius: (pieceId: string, frame: PieceFrame) => number;
  handleSelectUnitOnMap: (u: Unit, e?: React.MouseEvent) => void;
  onHoverUnit: (unitId: string | null) => void;
}
