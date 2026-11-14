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
import { cx } from '../../utils/cx';
import { isOrderIncomplete, splitProvinceCode } from '../../utils/orderHelpers';
import { MoveControls } from './controls/MoveControls';
import { OrderParameterControls } from './OrderParameterControls';
import { OrderTypeTabs } from './OrderTypeTabs';
import styles from './UnitMacroCard.module.css';

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
      className={cx(
        styles.unitMacroCard,
        isCompactRow && styles.unitMacroCardCompact,
        isSelected && styles.selected,
        isHovered && styles.hovered,
        hasError ? styles.cardError : hasWarn && styles.cardWarning,
      )}
      data-testid="unit-macro-card"
      data-unit-id={unit.id}
      data-compact={isCompactRow ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
      data-hovered={isHovered ? 'true' : undefined}
      data-status={hasError ? 'error' : hasWarn ? 'warning' : undefined}
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
          <div className={styles.unitCompactRow} data-testid="unit-compact-row">
            <span
              className={cx(styles.unitTypeBadge, styles.compact)}
              data-testid="unit-type-badge"
              data-unit-type={unit.unit_type === 'A' ? 'army' : 'fleet'}
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
              className={styles.unitCompactProv}
              title={`${provinces[unit.province]?.name ?? unit.province} (${unit.province}${unit.coast ? `/${unit.coast}` : ''})`}
            >
              {provinces[unit.province]?.name ?? unit.province}
            </span>
            <div
              className={styles.unitCompactControls}
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
                  dropdownClassNames={{
                    root: styles.unitCompactDropdown,
                    trigger: styles.unitCompactTrigger,
                    value: styles.unitCompactValue,
                    menu: styles.unitCompactMenu,
                  }}
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
                  className={styles.unitCompactTargetPlaceholder}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
          {(order?.order_type === 'SUPPORT' ||
            order?.order_type === 'CONVOY') && (
            <div
              className={styles.unitCompactSubcontrols}
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
          <div className={styles.unitCardHeader} data-testid="unit-card-header">
            <div className={styles.unitIdentity}>
              <span
                className={styles.unitTypeBadge}
                data-testid="unit-type-badge"
                data-unit-type={unit.unit_type === 'A' ? 'army' : 'fleet'}
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
                <div
                  className={styles.unitProvTitle}
                  data-testid="unit-prov-title"
                >
                  {provinces[unit.province]?.name}
                  <span className={styles.unitProvCode}>
                    {unit.province}
                    {unit.coast ? `/${unit.coast}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* An unfinished order outranks the server's error for it: it is not an order yet. */}
            <div>
              {unit.is_dislodged ? (
                <span
                  className={cx(styles.unitMiniPill, styles.error)}
                  data-testid="unit-mini-pill"
                >
                  <AlertTriangle size={11} /> Dislodged
                </span>
              ) : isDisbanding ? (
                <span
                  className={cx(styles.unitMiniPill, styles.error)}
                  data-testid="unit-mini-pill"
                >
                  <Trash2 size={11} /> Disbanding
                </span>
              ) : isOrderIncomplete(order) ? (
                <span
                  className={cx(styles.unitMiniPill, styles.unconfirmed)}
                  data-testid="unit-mini-pill"
                >
                  <AlertTriangle size={11} /> Incomplete
                </span>
              ) : hasError ? (
                <span
                  className={cx(styles.unitMiniPill, styles.error)}
                  data-testid="unit-mini-pill"
                >
                  <AlertCircle size={11} /> Illegal
                </span>
              ) : hasWarn ? (
                <span
                  className={cx(styles.unitMiniPill, styles.warning)}
                  data-testid="unit-mini-pill"
                >
                  <AlertTriangle size={11} /> Warning
                </span>
              ) : isAdjustmentPhase ||
                (isRetreatPhase && !unit.is_dislodged) ? (
                <span
                  className={cx(styles.unitMiniPill, styles.confirmed)}
                  data-testid="unit-mini-pill"
                >
                  <CheckCircle2 size={11} /> Retained
                </span>
              ) : order?.is_explicit ? (
                <span
                  className={cx(styles.unitMiniPill, styles.confirmed)}
                  data-testid="unit-mini-pill"
                >
                  <CheckCircle2 size={11} /> Ready
                </span>
              ) : (
                <span
                  className={cx(styles.unitMiniPill, styles.unconfirmed)}
                  data-testid="unit-mini-pill"
                >
                  Hold
                </span>
              )}
            </div>
          </div>

          {/* Behavior Bar */}
          <div className={styles.unitBehaviorVisualizer}>
            <span
              className={styles.behaviorVerbTag}
              data-testid="behavior-verb-tag"
              style={{ backgroundColor: summary.badgeColor }}
            >
              {isAdjustmentPhase && !isDisbanding ? 'RETAIN' : summary.verb}
            </span>
            <span
              className={styles.behaviorTargetText}
              data-testid="behavior-target-text"
            >
              {isAdjustmentPhase && !isDisbanding
                ? `Retained in ${provinces[unit.province]?.name}`
                : summary.targetText}
            </span>
          </div>

          {/* Order Controls */}
          <div
            className={styles.unitInlineControls}
            data-testid="unit-inline-controls"
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
        <div
          key={iss.id}
          className={cx(styles.unitDiagnosticAlert, styles[iss.severity])}
          data-testid="unit-diagnostic-alert"
          data-severity={iss.severity}
        >
          {iss.severity === 'info' ? (
            <Info size={13} className={styles.diagIcon} />
          ) : (
            <AlertTriangle size={13} className={styles.diagIcon} />
          )}
          <div>
            <strong>{iss.title}:</strong> {iss.message}
          </div>
        </div>
      ))}

      {/* Simulation Result */}
      {simRes && (
        <div
          className={cx(
            styles.unitSimResultStrip,
            simRes.succeeded ? styles.simOk : styles.simFail,
          )}
          data-testid="unit-sim-result-strip"
          data-outcome={simRes.succeeded ? 'ok' : 'fail'}
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
