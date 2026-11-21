import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Swords,
  Trash2,
} from 'lucide-react';
import type {
  Order,
  OrderType,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import { isOrderIncomplete } from '../../utils/orderHelpers';
import { OrderParameterControls } from './OrderParameterControls';
import { OrderTypeTabs } from './OrderTypeTabs';
import styles from './UnitMacroCard.module.css';

export interface UnitCardDetailProps {
  unit: Unit;
  order: Order | undefined;
  powerColor: string;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  unitsByProv: Record<string, Unit>;
  orders: Record<string, Order>;
  reachable: { province: string; coasts: string[] }[];
  validRetreats: { province: string; coasts: string[] }[];
  unitOptions: UnitMoveOptions | null;
  summary: { verb: string; targetText: string; badgeColor: string };
  hasError: boolean;
  hasWarn: boolean;
  isDisbanding: boolean;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  buildCount: number;
  useNativeSelect: boolean;
  handleOrderTypeChange: (unit: Unit, type: OrderType) => void;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince: (prov: string | null) => void;
}

/** A unit's full card: identity and status pill, the behavior bar and the order controls. */
export function UnitCardDetail({
  unit,
  order,
  powerColor,
  provinces,
  units,
  unitsByProv,
  orders,
  reachable,
  validRetreats,
  unitOptions,
  summary,
  hasError,
  hasWarn,
  isDisbanding,
  isRetreatPhase,
  isAdjustmentPhase,
  buildCount,
  useNativeSelect,
  handleOrderTypeChange,
  onUpdateOrder,
  onHoverProvince: handleHoverOptionProvince,
}: UnitCardDetailProps) {
  return (
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
                  : powerColor,
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
            <div className={styles.unitProvTitle} data-testid="unit-prov-title">
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
          ) : isAdjustmentPhase || (isRetreatPhase && !unit.is_dislodged) ? (
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
  );
}
