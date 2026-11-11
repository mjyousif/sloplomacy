import {
  type IssueSeverity,
  POWER_METADATA,
  type Unit,
} from '../../../../types/diplomacy';
import {
  MapPiece,
  PieceHitArea,
  PieceHoldOutline,
  PieceOutline,
} from '../../../MapPiece';
import type { UnitLayerContext } from './unitLayerContext';

/**
 * One unit on the board: its piece in the player's style with rings for selection, hover, the
 * player's own units, holding, dislodgement and disbanding, plus badges for supports to hold
 * and issues, and DISLODGED! or DISBAND banners.
 */
export function UnitToken({
  unit,
  ctx,
}: {
  unit: Unit;
  ctx: UnitLayerContext;
}) {
  const {
    orders,
    provinces,
    ownership,
    unitsByProv,
    controlPower,
    canEditAnyPower,
    activePower,
    selectedUnit,
    hoveredUnitId,
    isUnitOrderVisible,
    issuesByUnit,
    supportCountByUnitId,
    showSimulationOverlay,
    sandboxMode,
    simulationResult,
    pieceStyle,
    unitMark,
    getUnitPoint,
    describePiece,
    touchHitRadius,
    handleSelectUnitOnMap,
    onHoverUnit,
  } = ctx;
  const getStarOwnerColor = (province: string): string | undefined => {
    const owner = ownership[province] || provinces[province]?.home_power;
    return owner ? POWER_METADATA[owner].color : undefined;
  };

  const pt = getUnitPoint(unit);
  const meta = POWER_METADATA[unit.power];
  const order = orders[unit.id];
  const isControllable = unit.power === controlPower || canEditAnyPower;
  const isSelected = Boolean(selectedUnit && unit.id === selectedUnit.id);
  const isHovered = unit.id === hoveredUnitId && isControllable;
  const unitIssues = isUnitOrderVisible(unit)
    ? issuesByUnit[unit.id] || []
    : [];
  const topSeverity: IssueSeverity | null = unitIssues.some(
    (i) => i.severity === 'error',
  )
    ? 'error'
    : unitIssues.some((i) => i.severity === 'warning')
      ? 'warning'
      : null;

  const isHold = !order || order.order_type === 'HOLD';
  const isDisbanding = order?.order_type === 'DISBAND';
  const isExplicitHold = Boolean(
    isUnitOrderVisible(unit) &&
      order &&
      order.order_type === 'HOLD' &&
      order.is_explicit,
  );
  const holdSupCount = isHold ? supportCountByUnitId[unit.id] || 0 : 0;

  const simActive = showSimulationOverlay || sandboxMode;
  const simRes =
    simActive && isUnitOrderVisible(unit)
      ? simulationResult?.resolutions[unit.id]
      : null;
  const isAdvancingInSim = Boolean(
    simActive &&
      isUnitOrderVisible(unit) &&
      order?.order_type === 'MOVE' &&
      simRes?.succeeded,
  );

  // A dislodged unit stepped aside, so the star stays with the unit holding the province
  const carriesStar =
    (pieceStyle === 'seated' || pieceStyle === 'nameplate') &&
    Boolean(provinces[unit.province]?.is_supply_center) &&
    !(unit.is_dislodged && unitsByProv[unit.province]);
  const { frame, flagDirection } = describePiece(
    unit.province,
    unit.coast,
    carriesStar,
  );
  const steppedAside = Boolean(unit.is_dislodged && unitsByProv[unit.province]);
  const bannerY = steppedAside ? frame.steppedAsideBannerY : frame.bannerY;

  return (
    <g
      transform={`translate(${pt.x}, ${pt.y})`}
      className={`map-unit-token ${isSelected ? 'selected' : ''} ${
        isHovered ? 'hovered' : ''
      } ${!isControllable ? 'foreign-locked' : ''}`}
      data-testid="unit-token"
      data-unit-id={unit.id}
      data-unit-power={unit.power}
      data-unit-type={unit.unit_type}
      data-province={unit.province}
      data-controllable={isControllable ? 'true' : 'false'}
      opacity={isAdvancingInSim && !isSelected ? 0.62 : 1}
      onClick={(e) => handleSelectUnitOnMap(unit, e)}
      onPointerEnter={(e) => {
        if (isControllable && e.pointerType !== 'touch') onHoverUnit(unit.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') onHoverUnit(null);
      }}
    >
      <PieceHitArea frame={frame} minRadius={touchHitRadius(unit.id, frame)} />

      {(isSelected || isHovered) && (
        <PieceOutline
          frame={frame}
          radius={27}
          fill="rgba(245, 158, 11, 0.22)"
          stroke="#f59e0b"
          strokeWidth="3.5"
          strokeDasharray={isSelected ? undefined : '5 3'}
        />
      )}

      {unit.is_dislodged && (
        <g data-testid="dislodged-unit-indicator" data-unit-id={unit.id}>
          <PieceOutline
            frame={frame}
            radius={24}
            fill="rgba(234, 88, 12, 0.28)"
            stroke="#ea580c"
            strokeWidth="3"
            strokeDasharray="5 3"
          />
        </g>
      )}

      {isDisbanding && (
        <PieceOutline
          frame={frame}
          radius={24}
          fill="rgba(220, 38, 38, 0.28)"
          stroke="#dc2626"
          strokeWidth="3"
          strokeDasharray="4 3"
        />
      )}

      {/* Active Power Subtle Ring so your own units stand out clearly */}
      {unit.power === activePower && !isSelected && !unit.is_dislodged && (
        <PieceOutline
          frame={frame}
          radius={21}
          fill="none"
          stroke="#fef08a"
          strokeWidth="2"
          opacity="0.75"
        />
      )}

      {isHold && !unit.is_dislodged && isUnitOrderVisible(unit) && (
        <PieceHoldOutline
          frame={frame}
          fill="none"
          stroke={isExplicitHold ? '#eab308' : '#1e293b'}
          strokeWidth={isExplicitHold ? '2.8' : '1.6'}
          strokeDasharray={isExplicitHold ? undefined : '4 3'}
          opacity={isExplicitHold ? 0.95 : 0.65}
        />
      )}

      <MapPiece
        style={pieceStyle}
        mark={unitMark}
        unitType={unit.unit_type}
        color={meta.color}
        rim={
          unit.is_dislodged ? '#fdba74' : isDisbanding ? '#fca5a5' : '#fef3c7'
        }
        frame={frame}
        flagDirection={flagDirection}
        hasStar={Boolean(provinces[unit.province]?.is_supply_center)}
        showStar={carriesStar}
        starOwnerColor={getStarOwnerColor(unit.province)}
      />

      {holdSupCount > 0 && (
        <g transform={`translate(${frame.badgeLeft.x}, ${frame.badgeLeft.y})`}>
          <circle r="9" fill="#0f766e" stroke="#fef3c7" strokeWidth="1.5" />
          <text
            y="3.5"
            textAnchor="middle"
            fill="#fff"
            fontSize="10"
            fontWeight="800"
          >
            +{holdSupCount}
          </text>
        </g>
      )}

      {topSeverity && (
        <g
          transform={`translate(${frame.badgeRight.x}, ${frame.badgeRight.y})`}
        >
          <circle
            r="10.5"
            fill={topSeverity === 'error' ? '#dc2626' : '#f59e0b'}
            stroke="#1e293b"
            strokeWidth="1.8"
          />
          <text
            y="4"
            textAnchor="middle"
            fill="#1e293b"
            fontSize="13"
            fontWeight="900"
          >
            !
          </text>
        </g>
      )}

      {(unit.is_dislodged || (simActive && simRes?.dislodged)) &&
        !isDisbanding && (
          <g transform={`translate(0, ${bannerY})`}>
            <rect
              x="-38"
              y="-8"
              width="76"
              height="16"
              rx="4"
              fill="#ea580c"
              stroke="#fff"
              strokeWidth="1.2"
            />
            <text
              y="3.5"
              textAnchor="middle"
              fill="#fff"
              fontSize="8.5"
              fontWeight="800"
            >
              DISLODGED!
            </text>
          </g>
        )}

      {isDisbanding && (
        <g transform={`translate(0, ${bannerY})`}>
          <rect
            x="-36"
            y="-8"
            width="72"
            height="16"
            rx="4"
            fill="#dc2626"
            stroke="#fff"
            strokeWidth="1.2"
          />
          <text
            y="3.5"
            textAnchor="middle"
            fill="#fff"
            fontSize="8.5"
            fontWeight="800"
          >
            ✕ DISBAND
          </text>
        </g>
      )}
    </g>
  );
}
