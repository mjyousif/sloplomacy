import type React from 'react';
import type {
  Order,
  Power,
  ProvinceInfo,
  Unit,
} from '../../../types/diplomacy';
import type { MapGestures } from './useMapGestures';
import type { MapSelection } from './useMapSelection';

export type MapInteractionMode =
  | 'MOVE'
  | 'SUPPORT_PICK_UNIT'
  | 'SUPPORT_PICK_TARGET'
  | 'CONVOY_PICK_ARMY'
  | 'CONVOY_PICK_TARGET';

export interface PendingCoastChoice {
  target: string;
  coasts: string[];
}

export interface UseMapInteractionOptions {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  builds: Record<Power, { count: number; homes: string[] }> | null;
  selectedUnitId: string | null;
  /** The selected unit's saved order: an unfinished support or convoy resumes at its next step. */
  selectedOrder?: Order;
  onSelectUnit: (unitId: string | null) => void;
  onUpdateOrder: (order: Order) => void;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  unitsByProv: Record<string, Unit>;
  dislodgedByProv: Record<string, Unit>;
  /** Home centres the player may build in this winter, with the power that would build. */
  controllableBuildHomes: Record<string, Power>;
  selection: MapSelection;
  gestures: Pick<MapGestures, 'isPanningRef' | 'dragMovedRef'>;
}

export interface MapInteraction {
  interactionMode: MapInteractionMode;
  /** True once the player presses Move on this selection, which replaces a saved Hold's highlight. */
  moveModeChosen: boolean;
  /** The unit a support or convoy is for, once it has been picked. */
  pendingAuxOrigin: string | null;
  /** A fleet's move to a split-coast province, waiting for the player to pick the coast. */
  pendingCoastChoice: PendingCoastChoice | null;
  hoveredProv: string | null;
  clearSelection: () => void;
  handleSelectUnitOnMap: (u: Unit, e?: React.MouseEvent) => void;
  commitMoveOrRetreatOrder: (
    unit: Unit,
    targetProv: string,
    targetCoast?: string | null,
  ) => void;
  /** Stable, so the memoized province polygons don't re-render for it. */
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  /** Stable, and ignored while the map is being panned. */
  onHoverProvince: (provId: string | null) => void;
  /** The unit menu's buttons. */
  chooseMove: () => void;
  chooseRetreat: () => void;
  chooseSupport: () => void;
  chooseConvoy: () => void;
  cancelCoastChoice: () => void;
}
