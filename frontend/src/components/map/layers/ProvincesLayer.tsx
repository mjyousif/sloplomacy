import { ALL_PROVINCE_GEOMETRIES } from '../../../data/europeMapGeometry';
import type { MapLayout } from '../../../data/mapLayouts';
import type {
  Power,
  ProvinceInfo,
  Unit,
  ValidationIssue,
} from '../../../types/diplomacy';
import type { MapInteractionMode } from '../hooks/useMapInteraction';
import { ProvincePolygon } from './ProvincePolygon';

interface ProvincesLayerProps {
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  layout: MapLayout;
  isAdjustmentPhase: boolean;
  /** Home centres with a build slot drawn this winter. */
  buildHomes: Record<string, Power>;
  selectedUnit: Unit | null;
  selectedBuildProv: string | null;
  /** Where the selected unit can go, with the coasts a fleet can land on. */
  reachableMap: Record<string, string[]>;
  interactionMode: MapInteractionMode;
  hoveredProv: string | null;
  highlightedProvinces: string[];
  issuesByProvince: Record<string, ValidationIssue[]>;
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  onHoverProvince: (provId: string | null) => void;
}

/** Every province as a clickable polygon, lit where the selected unit can go. */
export function ProvincesLayer({
  provinces,
  ownership,
  layout,
  isAdjustmentPhase,
  buildHomes,
  selectedUnit,
  selectedBuildProv,
  reachableMap,
  interactionMode,
  hoveredProv,
  highlightedProvinces,
  issuesByProvince,
  onClickProvince,
  onHoverProvince,
}: ProvincesLayerProps) {
  return (
    <g className="interactive-provinces-layer">
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const pInfo = provinces[geom.id];
        if (!pInfo || geom.id === 'SWI') return null;

        const isSea = pInfo.type === 'SEA';
        const owner = ownership[geom.id] || pInfo.home_power || null;
        const isBuildableHome = Boolean(
          isAdjustmentPhase && buildHomes[geom.id],
        );
        const isMoveReachable = Boolean(
          selectedUnit && reachableMap[geom.id] && interactionMode === 'MOVE',
        );
        const isReachable = isMoveReachable || isBuildableHome;
        const allowedCoastsStr = isMoveReachable
          ? (reachableMap[geom.id] || []).join(',')
          : '';
        const showFleetCoasts = Boolean(
          isMoveReachable && selectedUnit?.unit_type === 'F',
        );
        const showMoveReticle = isMoveReachable;
        const isHovered = hoveredProv === geom.id;
        const isHighlighted =
          highlightedProvinces.includes(geom.id) ||
          selectedBuildProv === geom.id;
        const hasWarning = Boolean(issuesByProvince[geom.id]?.length);

        return (
          <ProvincePolygon
            key={geom.id}
            geom={geom}
            isSea={isSea}
            owner={owner}
            isReachable={isReachable}
            allowedCoastsStr={allowedCoastsStr}
            showFleetCoasts={showFleetCoasts}
            showMoveReticle={showMoveReticle}
            reticlePoint={layout[geom.id]?.unit ?? geom.unitPos}
            isHovered={isHovered}
            isHighlighted={isHighlighted}
            hasWarning={hasWarning}
            onClickProvince={onClickProvince}
            onHoverProvince={onHoverProvince}
          />
        );
      })}
    </g>
  );
}
