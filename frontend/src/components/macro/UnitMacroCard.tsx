import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Info,
  Swords,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type {
  Order,
  OrderResolution,
  OrderType,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
  ValidationIssue,
} from '../../types/diplomacy';
import { splitProvinceCode } from '../../utils/orderHelpers';
import { MoveControls } from './controls/MoveControls';
import { OrderParameterControls } from './OrderParameterControls';
import { OrderTypeTabs } from './OrderTypeTabs';

export interface UnitMacroCardProps {
  unit: Unit;
  order: Order | undefined;
  powerMeta: {
    name: string;
    shortName: string;
    color: string;
    textColor?: string;
  };
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitsByProv: Record<string, Unit>;
  orders: Record<string, Order>;
  reachable: { province: string; coasts: string[] }[];
  validRetreats: { province: string; coasts: string[] }[];
  unitOptions?: UnitMoveOptions | null;
  summary: { verb: string; targetText: string; badgeColor: string };
  unitIssues: ValidationIssue[];
  simRes: OrderResolution | null | undefined;
  isSelected: boolean;
  isHovered: boolean;
  hasError: boolean;
  hasWarn: boolean;
  isDisbanding: boolean;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  buildCount: number;
  compact?: boolean;
  useNativeSelect?: boolean;
  onSelectUnit: (id: string | null) => void;
  onHoverUnit: (id: string | null) => void;
  onHighlightProvinces: (provs: string[]) => void;
  onUpdateOrder: (order: Order) => void;
  handleOrderTypeChange: (unit: Unit, type: OrderType) => void;
}

export const UnitMacroCard: React.FC<UnitMacroCardProps> = ({
  unit,
  order,
  powerMeta,
  provinces,
  units,
  unitsByProv,
  orders,
  reachable,
  validRetreats,
  unitOptions = null,
  summary,
  unitIssues,
  simRes,
  isSelected,
  isHovered,
  hasError,
  hasWarn,
  isDisbanding,
  isRetreatPhase,
  isAdjustmentPhase,
  buildCount,
  compact = false,
  useNativeSelect = false,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
  handleOrderTypeChange,
}) => {
  const isCompactRow = compact && !isAdjustmentPhase && !isRetreatPhase;
  const isCardHoveredRef = useRef(false);

  const getCardHighlightedProvinces = useCallback(() => {
    const provs = [unit.province];
    if (order?.target) provs.push(order.target);
    if (order?.aux_unit_origin) provs.push(order.aux_unit_origin);
    return provs;
  }, [unit.province, order?.target, order?.aux_unit_origin]);

  const handleHoverOptionProvince = useCallback(
    (prov: string | null) => {
      if (prov) {
        onHighlightProvinces([splitProvinceCode(prov).base]);
      } else if (isCardHoveredRef.current) {
        onHighlightProvinces(getCardHighlightedProvinces());
      } else {
        onHighlightProvinces([]);
      }
    },
    [onHighlightProvinces, getCardHighlightedProvinces],
  );

  return (
    <div
      key={unit.id}
      className={`unit-macro-card ${isCompactRow ? 'unit-macro-card-compact' : ''} ${
        isSelected ? 'selected' : ''
      } ${isHovered ? 'hovered' : ''} ${
        hasError ? 'card-error' : hasWarn ? 'card-warning' : ''
      }`.trim()}
      data-testid="unit-macro-card"
      data-unit-id={unit.id}
      style={
        unit.is_dislodged
          ? { borderLeft: '4px solid #ea580c' }
          : isDisbanding
            ? { borderLeft: '4px solid #dc2626' }
            : undefined
      }
      onClick={() => onSelectUnit(isSelected ? null : unit.id)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'touch') return;
        isCardHoveredRef.current = true;
        onHoverUnit(unit.id);
        onHighlightProvinces(getCardHighlightedProvinces());
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return;
        isCardHoveredRef.current = false;
        onHoverUnit(null);
        onHighlightProvinces([]);
      }}
    >
      {isCompactRow ? (
        <>
          <div className="unit-compact-row">
            <span
              className={`unit-type-badge compact ${unit.unit_type === 'A' ? 'army' : 'fleet'}`}
              style={{
                backgroundColor: unit.is_dislodged
                  ? '#ea580c'
                  : isDisbanding
                    ? '#dc2626'
                    : powerMeta.color,
              }}
              title={`${unit.unit_type === 'A' ? 'Army' : 'Fleet'} in ${provinces[unit.province]?.name ?? unit.province}`}
            >
              {unit.unit_type === 'A' ? (
                <Swords size={10} />
              ) : (
                <Anchor size={10} />
              )}
              {unit.unit_type}
            </span>
            <span
              className="unit-compact-prov"
              title={`${provinces[unit.province]?.name ?? unit.province} (${unit.province}${unit.coast ? `/${unit.coast}` : ''})`}
            >
              {provinces[unit.province]?.name ?? unit.province}
            </span>
            <div
              className="unit-compact-controls"
              onClick={(e) => e.stopPropagation()}
            >
              <OrderTypeTabs
                unit={unit}
                order={order}
                provinces={provinces}
                validRetreats={validRetreats}
                isDisbanding={isDisbanding}
                isRetreatPhase={isRetreatPhase}
                isAdjustmentPhase={isAdjustmentPhase}
                buildCount={buildCount}
                compact={true}
                handleOrderTypeChange={handleOrderTypeChange}
              />
              {order?.order_type === 'MOVE' ? (
                <MoveControls
                  unit={unit}
                  order={order}
                  provinces={provinces}
                  reachable={reachable}
                  unitOptions={unitOptions}
                  compact={true}
                  useNativeSelect={useNativeSelect}
                  onUpdateOrder={onUpdateOrder}
                  onHoverProvince={handleHoverOptionProvince}
                />
              ) : (
                <span
                  className="unit-compact-target-placeholder"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
          {(order?.order_type === 'SUPPORT' ||
            order?.order_type === 'CONVOY') && (
            <div
              className="unit-compact-subcontrols"
              onClick={(e) => e.stopPropagation()}
            >
              <OrderParameterControls
                unit={unit}
                order={order}
                provinces={provinces}
                units={units}
                unitsByProv={unitsByProv}
                orders={orders}
                reachable={reachable}
                validRetreats={validRetreats}
                unitOptions={unitOptions}
                isRetreatPhase={isRetreatPhase}
                compact={true}
                useNativeSelect={useNativeSelect}
                onUpdateOrder={onUpdateOrder}
                onHoverProvince={handleHoverOptionProvince}
              />
            </div>
          )}
        </>
      ) : (
        <>
          {/* Unit Card Header */}
          <div className="unit-card-header">
            <div className="unit-identity">
              <span
                className={`unit-type-badge ${unit.unit_type === 'A' ? 'army' : 'fleet'}`}
                style={{
                  backgroundColor: unit.is_dislodged
                    ? '#ea580c'
                    : isDisbanding
                      ? '#dc2626'
                      : powerMeta.color,
                }}
              >
                {unit.unit_type === 'A' ? (
                  <Swords size={11} />
                ) : (
                  <Anchor size={11} />
                )}
                {unit.unit_type}
              </span>
              <div>
                <div className="unit-prov-title">
                  {provinces[unit.province]?.name}
                  <span className="unit-prov-code">
                    {unit.province}
                    {unit.coast ? `/${unit.coast}` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="unit-status-pill-wrap">
              {unit.is_dislodged ? (
                <span className="unit-mini-pill error">
                  <AlertTriangle size={11} /> Dislodged
                </span>
              ) : isDisbanding ? (
                <span className="unit-mini-pill error">
                  <Trash2 size={11} /> Disbanding
                </span>
              ) : hasError ? (
                <span className="unit-mini-pill error">
                  <AlertCircle size={11} /> Illegal
                </span>
              ) : hasWarn ? (
                <span className="unit-mini-pill warning">
                  <AlertTriangle size={11} /> Warning
                </span>
              ) : isAdjustmentPhase ||
                (isRetreatPhase && !unit.is_dislodged) ? (
                <span className="unit-mini-pill confirmed">
                  <CheckCircle2 size={11} /> Retained
                </span>
              ) : order?.is_explicit ? (
                <span className="unit-mini-pill confirmed">
                  <CheckCircle2 size={11} /> Ready
                </span>
              ) : (
                <span className="unit-mini-pill unconfirmed">Hold</span>
              )}
            </div>
          </div>

          {/* Behavior Bar */}
          <div className="unit-behavior-visualizer">
            <span
              className="behavior-verb-tag"
              style={{ backgroundColor: summary.badgeColor }}
            >
              {isAdjustmentPhase && !isDisbanding ? 'RETAIN' : summary.verb}
            </span>
            <span className="behavior-target-text">
              {isAdjustmentPhase && !isDisbanding
                ? `Retained in ${provinces[unit.province]?.name}`
                : summary.targetText}
            </span>
          </div>

          {/* Order Controls */}
          <div
            className="unit-inline-controls"
            onClick={(e) => e.stopPropagation()}
          >
            <OrderTypeTabs
              unit={unit}
              order={order}
              provinces={provinces}
              validRetreats={validRetreats}
              isDisbanding={isDisbanding}
              isRetreatPhase={isRetreatPhase}
              isAdjustmentPhase={isAdjustmentPhase}
              buildCount={buildCount}
              handleOrderTypeChange={handleOrderTypeChange}
            />
            {(isRetreatPhase ? unit.is_dislodged : !isAdjustmentPhase) && (
              <OrderParameterControls
                unit={unit}
                order={order}
                provinces={provinces}
                units={units}
                unitsByProv={unitsByProv}
                orders={orders}
                reachable={reachable}
                validRetreats={validRetreats}
                unitOptions={unitOptions}
                isRetreatPhase={isRetreatPhase}
                compact={true}
                useNativeSelect={useNativeSelect}
                onUpdateOrder={onUpdateOrder}
                onHoverProvince={handleHoverOptionProvince}
              />
            )}
          </div>
        </>
      )}

      {/* Diagnostic Alerts */}
      {unitIssues.map((iss) => (
        <div key={iss.id} className={`unit-diagnostic-alert ${iss.severity}`}>
          {iss.severity === 'info' ? (
            <Info size={13} className="diag-icon" />
          ) : (
            <AlertTriangle size={13} className="diag-icon" />
          )}
          <div>
            <strong>{iss.title}:</strong> {iss.message}
          </div>
        </div>
      ))}

      {/* Simulation Result */}
      {simRes && (
        <div
          className={`unit-sim-result-strip ${
            simRes.succeeded ? 'sim-ok' : 'sim-fail'
          }`}
        >
          <strong>
            {simRes.succeeded ? '✓ SIMULATED:' : '✕ BOUNCED / CUT:'}
          </strong>{' '}
          {simRes.reason}
        </div>
      )}
    </div>
  );
};
