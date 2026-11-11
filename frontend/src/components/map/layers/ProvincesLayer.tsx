import { useMemo } from 'react';
import { ALL_PROVINCE_GEOMETRIES } from '../../../data/europeMapGeometry';
import type { MapLayout } from '../../../data/mapLayouts';
import type {
  Power,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
  ValidationIssue,
} from '../../../types/diplomacy';
import type { MapInteractionMode } from '../hooks/useMapInteraction';
import { ProvincePolygon } from './ProvincePolygon';
import { getModeTargetHighlights } from './targetHighlight';

interface ProvincesLayerProps {
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  layout: MapLayout;
  isAdjustmentPhase: boolean;
  /** Home centres with a build slot drawn this winter. */
  buildHomes: Record<string, Power>;
  selectedUnit: Unit | null;
  selectedUnitOptions?: UnitMoveOptions | null;
  selectedBuildProv: string | null;
  /** Where the selected unit can go, with the coasts a fleet can land on. */
  reachableMap: Record<string, string[]>;
  interactionMode: MapInteractionMode;
  units?: Unit[];
  pendingAuxOrigin?: string | null;
  hoveredProv: string | null;
  highlightedProvinces: string[];
  issuesByProvince: Record<string, ValidationIssue[]>;
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  onHoverProvince: (provId: string | null) => void;
}

/** Every province as a clickable polygon, lit where the selected unit can go or target. */
export function ProvincesLayer({
  provinces,
  ownership,
  layout,
  isAdjustmentPhase,
  buildHomes,
  selectedUnit,
  selectedUnitOptions = null,
  selectedBuildProv,
  reachableMap,
  interactionMode,
  units = [],
  pendingAuxOrigin = null,
  hoveredProv,
  highlightedProvinces,
  issuesByProvince,
  onClickProvince,
  onHoverProvince,
}: ProvincesLayerProps) {
  const modeTargets = useMemo(
    () =>
      getModeTargetHighlights({
        interactionMode,
        selectedUnit,
        selectedUnitOptions,
        pendingAuxOrigin,
        reachableMap,
        provinces,
        units,
      }),
    [
      interactionMode,
      selectedUnit,
      selectedUnitOptions,
      pendingAuxOrigin,
      reachableMap,
      provinces,
      units,
    ],
  );

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
        const isDirectMove = Boolean(
          selectedUnit && reachableMap[geom.id] && interactionMode === 'MOVE',
        );
        const isGreen = modeTargets.green.has(geom.id) || isBuildableHome;
        const isBlue = !isGreen && modeTargets.blue.has(geom.id);
        const isReachable = isGreen || isBlue;
        const reachableColor: 'green' | 'blue' = isBlue ? 'blue' : 'green';
        const showMoveReticle = modeTargets.reticles.has(geom.id);
        const allowedCoastsStr = isDirectMove
          ? (reachableMap[geom.id] || []).join(',')
          : '';
        const showFleetCoasts = Boolean(
          isDirectMove && selectedUnit?.unit_type === 'F',
        );
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
            reachableColor={reachableColor}
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
