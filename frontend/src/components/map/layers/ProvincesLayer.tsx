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
import { canPlaceUnitTypeInProvince } from '../../../utils/adminHelpers';
import type { MapInteractionMode } from '../hooks/useMapInteraction';
import { ProvincePolygon } from './ProvincePolygon';
import styles from './ProvincesLayer.module.css';
import { getModeTargetHighlights } from './targetHighlight';

interface ProvincesLayerProps {
  provinces: Record<string, ProvinceInfo>;
  ownership: Record<string, Power>;
  layout: MapLayout;
  isAdjustmentPhase: boolean;
  directEditActive?: boolean;
  relocatingUnit?: Unit | null;
  /** Home centres with a build slot drawn this winter. */
  buildHomes: Record<string, Power>;
  selectedUnit: Unit | null;
  selectedUnitOptions?: UnitMoveOptions | null;
  selectedBuildProv: string | null;
  /** Where the selected unit can go, with the coasts a fleet can land on. */
  reachableMap: Record<string, string[]>;
  interactionMode: MapInteractionMode;
  units?: Unit[];
  /** A Hold is the unit's chosen order, so no convoy destination is lit. */
  holdActive?: boolean;
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
  directEditActive = false,
  relocatingUnit = null,
  buildHomes,
  selectedUnit,
  selectedUnitOptions = null,
  selectedBuildProv,
  reachableMap,
  interactionMode,
  units = [],
  holdActive = false,
  pendingAuxOrigin = null,
  hoveredProv,
  highlightedProvinces,
  issuesByProvince,
  onClickProvince,
  onHoverProvince,
}: ProvincesLayerProps) {
  const modeTargets = useMemo(
    () =>
      directEditActive
        ? {
            green: new Set<string>(),
            blue: new Set<string>(),
            outline: new Set<string>(),
            reticles: new Set<string>(),
          }
        : getModeTargetHighlights({
            interactionMode,
            selectedUnit,
            selectedUnitOptions,
            pendingAuxOrigin,
            reachableMap,
            provinces,
            units,
            holdActive,
          }),
    [
      directEditActive,
      interactionMode,
      selectedUnit,
      selectedUnitOptions,
      pendingAuxOrigin,
      reachableMap,
      provinces,
      units,
      holdActive,
    ],
  );

  const hasOwnershipData = Object.keys(ownership).length > 0;

  return (
    <g className={styles.interactiveProvincesLayer}>
      {ALL_PROVINCE_GEOMETRIES.map((geom) => {
        const pInfo = provinces[geom.id];
        if (!pInfo || geom.id === 'SWI') return null;

        const isSea = pInfo.type === 'SEA';
        const owner =
          ownership[geom.id] ||
          (pInfo.is_supply_center && hasOwnershipData
            ? null
            : pInfo.home_power) ||
          null;
        const isBuildableHome = Boolean(
          !directEditActive && isAdjustmentPhase && buildHomes[geom.id],
        );
        const isDirectMove = Boolean(
          !directEditActive &&
            selectedUnit &&
            reachableMap[geom.id] &&
            interactionMode === 'MOVE',
        );
        const isGreen = modeTargets.green.has(geom.id) || isBuildableHome;
        const isBlue = !isGreen && modeTargets.blue.has(geom.id);
        const isOutline =
          !isGreen && !isBlue && modeTargets.outline.has(geom.id);
        const isReachable = isGreen || isBlue || isOutline;
        const reachableColor: 'green' | 'blue' | 'outline' = isOutline
          ? 'outline'
          : isBlue
            ? 'blue'
            : 'green';
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
        const movingUnit = directEditActive
          ? relocatingUnit
          : interactionMode === 'MOVE'
            ? selectedUnit
            : null;
        const isMoveIncompatible = movingUnit
          ? !canPlaceUnitTypeInProvince(movingUnit.unit_type, pInfo.type) ||
            Boolean(
              directEditActive &&
                units.some((u) => !u.is_dislodged && u.province === geom.id),
            )
          : false;
        const isMoveCompatible = Boolean(
          directEditActive && relocatingUnit && !isMoveIncompatible,
        );
        const suppressIncompatibleHover = Boolean(
          directEditActive && relocatingUnit && isMoveIncompatible,
        );

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
            isHovered={isHovered && !suppressIncompatibleHover}
            isHighlighted={isHighlighted}
            hasWarning={hasWarning}
            isMoveIncompatible={isMoveIncompatible}
            isMoveCompatible={isMoveCompatible}
            onClickProvince={onClickProvince}
            onHoverProvince={onHoverProvince}
          />
        );
      })}
    </g>
  );
}
