import { memo } from 'react';
import type { Point, ProvinceGeometry } from '../../../data/europeMapGeometry';
import { POWER_METADATA, type Power } from '../../../types/diplomacy';

export interface ProvincePolygonProps {
  geom: ProvinceGeometry;
  isSea: boolean;
  owner: Power | null;
  isReachable: boolean;
  reachableColor?: 'green' | 'blue';
  allowedCoastsStr: string;
  showFleetCoasts: boolean;
  showMoveReticle: boolean;
  reticlePoint: Point;
  isHovered: boolean;
  isHighlighted: boolean;
  hasWarning: boolean;
  onClickProvince: (provId: string, explicitCoast?: string | null) => void;
  onHoverProvince: (provId: string | null) => void;
}

export const ProvincePolygon = memo<ProvincePolygonProps>(
  ({
    geom,
    isSea,
    owner,
    isReachable,
    reachableColor = 'green',
    allowedCoastsStr,
    showFleetCoasts,
    showMoveReticle,
    reticlePoint,
    isHovered,
    isHighlighted,
    hasWarning,
    onClickProvince,
    onHoverProvince,
  }) => {
    let fill = 'transparent';
    let fillOpacity = 0;

    const isBlueReachable = isReachable && reachableColor === 'blue';

    if (isSea) {
      if (isHighlighted) {
        fill = '#fde047';
        fillOpacity = 0.45;
      } else if (isReachable && isHovered) {
        fill = '#22c55e';
        fillOpacity = 0.42;
      } else if (isReachable) {
        fill = '#4ade80';
        fillOpacity = 0.25;
      } else if (isHovered) {
        fill = '#ffffff';
        fillOpacity = 0.22;
      } else {
        fill = '#9ec5d6';
        fillOpacity = 0.28;
      }
    } else {
      if (owner && POWER_METADATA[owner]) {
        fill = POWER_METADATA[owner].fillColor;
        const baseOpacity = owner === 'ENGLAND' ? 0.65 : 0.48;
        const hoverOpacity = owner === 'ENGLAND' ? 0.8 : 0.68;
        fillOpacity = isHovered ? hoverOpacity : baseOpacity;
      } else {
        fill = isHovered ? '#fffbeb' : '#f4d7b5';
        fillOpacity = isHovered ? 0.55 : 0.15;
      }

      if (isHighlighted) {
        fill = '#facc15';
        fillOpacity = 0.58;
      } else if (isBlueReachable && isHovered) {
        fill = '#0ea5e9';
        fillOpacity = 0.54;
      } else if (isBlueReachable) {
        fill = '#38bdf8';
        fillOpacity = 0.34;
      } else if (isReachable && isHovered) {
        fill = '#22c55e';
        fillOpacity = 0.55;
      } else if (isReachable) {
        fill = '#4ade80';
        fillOpacity = 0.32;
      }
    }

    const allowedCoasts = allowedCoastsStr ? allowedCoastsStr.split(',') : [];
    const strokeColor = isHighlighted
      ? '#eab308'
      : isBlueReachable
        ? '#0284c7'
        : isReachable
          ? '#15803d'
          : hasWarning
            ? '#d97706'
            : 'none';

    return (
      <g>
        <path
          d={geom.path}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={strokeColor}
          strokeWidth={isHighlighted || isReachable || hasWarning ? 3.5 : 0}
          strokeDasharray={isBlueReachable ? '6 3' : undefined}
          className="province-interactive-path"
          data-testid="province-path"
          data-province-id={geom.id}
          data-reachable-color={isReachable ? reachableColor : undefined}
          onClick={() => onClickProvince(geom.id)}
          onPointerEnter={(e) => {
            if (e.pointerType !== 'touch') onHoverProvince(geom.id);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== 'touch') onHoverProvince(null);
          }}
        />

        {/* Split-coast interactive sub-polygons for Fleets */}
        {showFleetCoasts &&
          isReachable &&
          geom.coastPaths &&
          Object.entries(geom.coastPaths).map(([coastKey, cPath]) => {
            if (!allowedCoasts.includes(coastKey)) return null;
            return (
              <path
                key={`${geom.id}/${coastKey}`}
                d={cPath}
                fill="#22c55e"
                fillOpacity={0.42}
                stroke="#15803d"
                strokeWidth="3"
                className="coast-interactive-path"
                data-testid="province-coast-selector"
                data-province-id={geom.id}
                data-coast={coastKey}
                onClick={(e) => {
                  e.stopPropagation();
                  onClickProvince(geom.id, coastKey);
                }}
              />
            );
          })}

        {/* Reachable Target Reticle */}
        {showMoveReticle && (
          <g
            className="reachable-target-reticle"
            data-testid="reachable-reticle"
            data-province-id={geom.id}
            onClick={(e) => {
              e.stopPropagation();
              onClickProvince(geom.id);
            }}
          >
            <circle
              cx={reticlePoint.x}
              cy={reticlePoint.y}
              r={24}
              fill="rgba(22, 163, 74, 0.22)"
              stroke="#15803d"
              strokeWidth="2.8"
              strokeDasharray="6 3"
            />
          </g>
        )}
      </g>
    );
  },
);
