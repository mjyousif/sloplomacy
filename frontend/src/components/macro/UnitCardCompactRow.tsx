import { AlertTriangle, Anchor, CheckCircle2, Swords } from 'lucide-react';
import type {
  Order,
  OrderType,
  ProvinceInfo,
  Unit,
  UnitMoveOptions,
} from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import { provinceName, unitTypeName } from '../../utils/turnFormat';
import type { IconSelectDropdownClassNames } from '../ui/IconSelectDropdown';
import { MoveControls } from './controls/MoveControls';
import { orderParamDropdownClassNames } from './controls/orderParamDropdown';
import { RetreatControls } from './controls/RetreatControls';
import { OrderParameterControls } from './OrderParameterControls';
import { OrderTypeTabs } from './OrderTypeTabs';
import styles from './UnitMacroCard.module.css';

const compactRowDropdownClassNames: IconSelectDropdownClassNames = {
  root: cx(orderParamDropdownClassNames.root, styles.unitCompactDropdown),
  trigger: orderParamDropdownClassNames.trigger,
  value: orderParamDropdownClassNames.value,
  menu: cx(orderParamDropdownClassNames.menu, styles.unitCompactMenu),
  native: cx(orderParamDropdownClassNames.native, styles.unitCompactNative),
};

export interface UnitCardCompactRowProps {
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
  isDisbanding: boolean;
  isRetreatPhase: boolean;
  isAdjustmentPhase: boolean;
  buildCount: number;
  useNativeSelect: boolean;
  /** The ⚠ button that opens a warning, shown only for a warning with no error. */
  hasWarnToggle: boolean;
  isWarnOpen: boolean;
  onToggleWarn: () => void;
  handleOrderTypeChange: (unit: Unit, type: OrderType) => void;
  onUpdateOrder: (order: Order) => void;
  onHoverProvince: (prov: string | null) => void;
}

/** A unit's one-line row: type badge, province, order tabs and the target control. */
export function UnitCardCompactRow({
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
  isDisbanding,
  isRetreatPhase,
  isAdjustmentPhase,
  buildCount,
  useNativeSelect,
  hasWarnToggle,
  isWarnOpen,
  onToggleWarn,
  handleOrderTypeChange,
  onUpdateOrder,
  onHoverProvince: handleHoverOptionProvince,
}: UnitCardCompactRowProps) {
  return (
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
                : powerColor,
          }}
          title={`${unitTypeName(unit.unit_type)} in ${provinceName(provinces, unit.province)}`}
        >
          {unit.unit_type === 'A' ? <Swords size={10} /> : <Anchor size={10} />}
          {unit.unit_type}
        </span>
        <span
          className={styles.unitCompactProv}
          title={`${provinceName(provinces, unit.province)} (${unit.province}${unit.coast ? `/${unit.coast}` : ''})`}
        >
          {provinceName(provinces, unit.province)}
        </span>
        <div
          className={styles.unitCompactControls}
          onClick={(e) => e.stopPropagation()}
        >
          {isAdjustmentPhase ? (
            buildCount < 0 ? (
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
            ) : (
              <span
                className={cx(styles.unitMiniPill, styles.confirmed)}
                data-testid="unit-mini-pill"
              >
                <CheckCircle2 size={10} /> Retained
              </span>
            )
          ) : isRetreatPhase ? (
            unit.is_dislodged ? (
              <>
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
                {order?.order_type === 'RETREAT' ? (
                  <RetreatControls
                    dropdownClassNames={compactRowDropdownClassNames}
                    unit={unit}
                    order={order}
                    provinces={provinces}
                    validRetreats={validRetreats}
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
              </>
            ) : (
              <span
                className={cx(styles.unitMiniPill, styles.confirmed)}
                data-testid="unit-mini-pill"
              >
                <CheckCircle2 size={10} /> Retained
              </span>
            )
          ) : (
            <>
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
                  dropdownClassNames={compactRowDropdownClassNames}
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
            </>
          )}
        </div>
        {hasWarnToggle && (
          <button
            type="button"
            className={styles.unitWarningToggle}
            data-testid="btn-unit-warning-toggle"
            data-active={isWarnOpen ? 'true' : undefined}
            aria-expanded={isWarnOpen}
            aria-label={isWarnOpen ? 'Hide warning' : 'Show warning'}
            title={isWarnOpen ? 'Hide warning' : 'Show warning'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleWarn();
            }}
          >
            <AlertTriangle size={12} />
          </button>
        )}
      </div>
      {!isAdjustmentPhase &&
        !isRetreatPhase &&
        (order?.order_type === 'SUPPORT' || order?.order_type === 'CONVOY') && (
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
  );
}
