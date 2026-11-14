import { LayoutList, Rows3 } from 'lucide-react';
import type React from 'react';
import type {
  Order,
  OrderType,
  Power,
  PowerMeta,
  ProvinceInfo,
  SimulationResult,
  Unit,
  UnitMoveOptions,
} from '../../types/diplomacy';
import { buildDefaultOrderForType } from '../../utils/orderBuilders';
import {
  formatOrderSummary,
  getReachableDestinations,
  getValidRetreatDestinations,
  isOrderIncomplete,
} from '../../utils/orderHelpers';
import type { OrderProgress } from '../../utils/orderProgress';
import { BuildSlotCard } from './BuildSlotCard';
import { UnitMacroCard } from './UnitMacroCard';
import styles from './UnitOrderList.module.css';

interface UnitOrderListProps {
  activePower: Power;
  powerMeta: PowerMeta;
  progress: OrderProgress;
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  retreats: Record<Power, Record<string, string[]>> | null;
  unitOptions: Record<string, UnitMoveOptions> | null;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  simulationResult: SimulationResult | null;
  /** Whether each card shows how its order resolved in the simulation. */
  simActive: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  /** The phone sheet words its hints for a finger. */
  isSheet: boolean;
  compactOrders?: boolean;
  onToggleCompactOrders?: () => void;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onUpdateOrder: (order: Order) => void;
}

/**
 * Everything inside the scrolling list: the home build slots in winter, then a card for each of
 * the power's units. A fragment, so the panel and the sheet each choose the container.
 */
export const UnitOrderList: React.FC<UnitOrderListProps> = ({
  activePower,
  powerMeta,
  progress,
  provinces,
  units,
  orders,
  retreats,
  unitOptions,
  selectedUnitId,
  hoveredUnitId,
  simulationResult,
  simActive,
  isAdjustmentPhase,
  isRetreatPhase,
  isSheet,
  compactOrders = false,
  onToggleCompactOrders,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
}) => {
  const {
    unitsByProv,
    myUnits,
    issuesByUnit,
    buildCount,
    buildHomes,
    maxAllowedBuilds,
    assignedBuildsCount,
    neededDisbands,
    assignedDisbandsCount,
  } = progress;

  const handleOrderTypeChange = (unit: Unit, newType: OrderType) => {
    const nextOrder = buildDefaultOrderForType({
      unit,
      newType,
      provinces,
      retreats,
      unitOptions: unitOptions ? (unitOptions[unit.id] ?? null) : null,
    });
    if (nextOrder) onUpdateOrder(nextOrder);
  };

  return (
    <>
      {/* Winter Builds */}
      {isAdjustmentPhase && buildCount > 0 && buildHomes.length > 0 && (
        <div
          className={styles.macroBuildsWrapper}
          data-testid="macro-builds-wrapper"
        >
          <div
            className={styles.macroListHeader}
            data-testid="macro-list-header"
          >
            <span>
              HOME BUILDS ({assignedBuildsCount}/{maxAllowedBuilds} ASSIGNED)
            </span>
            <span className={styles.macroHint} data-testid="macro-hint">
              {isSheet ? 'Tap a card or the map' : 'Click card or map'}
            </span>
          </div>
          {buildHomes.map((homeProv) => {
            const bId = `BUILD_${activePower}_${homeProv}`;
            return (
              <BuildSlotCard
                key={homeProv}
                homeProv={homeProv}
                buildOrder={orders[bId]}
                pInfo={provinces[homeProv]}
                activePower={activePower}
                isSelected={selectedUnitId === bId}
                provinces={provinces}
                unitsByProv={unitsByProv}
                onSelectUnit={onSelectUnit}
                onHoverUnit={onHoverUnit}
                onHighlightProvinces={onHighlightProvinces}
                onUpdateOrder={onUpdateOrder}
              />
            );
          })}
        </div>
      )}

      <div className={styles.macroListHeader} data-testid="macro-list-header">
        <span>
          {isAdjustmentPhase && buildCount < 0
            ? `DISBAND UNITS (${assignedDisbandsCount}/${neededDisbands} SELECTED)`
            : `ACTIVE FORCE ORDERS (${myUnits.length} UNITS)`}
        </span>
        {!isSheet &&
        !isAdjustmentPhase &&
        !isRetreatPhase &&
        onToggleCompactOrders ? (
          <button
            type="button"
            data-testid="btn-toggle-compact-orders"
            className={styles.macroDensityToggle}
            aria-pressed={compactOrders}
            onClick={onToggleCompactOrders}
            title={
              compactOrders
                ? 'Switch to detailed order cards'
                : 'Switch to compact one-line order rows'
            }
          >
            {compactOrders ? <Rows3 size={12} /> : <LayoutList size={12} />}
            <span>{compactOrders ? 'Detailed' : 'Compact'}</span>
          </button>
        ) : (
          <span className={styles.macroHint} data-testid="macro-hint">
            {isSheet ? 'Tap a card or the map' : 'Click card or map'}
          </span>
        )}
      </div>

      {myUnits.map((unit) => {
        const order = orders[unit.id];
        const isSelected = unit.id === selectedUnitId;
        // An order still being filled in raises no warning until the player moves off the unit.
        const unitIssues =
          isSelected && isOrderIncomplete(order)
            ? []
            : issuesByUnit[unit.id] || [];
        const hasError = unitIssues.some((i) => i.severity === 'error');
        const hasWarn = unitIssues.some((i) => i.severity === 'warning');
        const isHovered = unit.id === hoveredUnitId;
        const uOpts = unitOptions ? (unitOptions[unit.id] ?? null) : null;
        const summary = formatOrderSummary(order, provinces, unitsByProv);
        const reachable = getReachableDestinations(unit, provinces, uOpts);
        const validRetreats = unit.is_dislodged
          ? getValidRetreatDestinations(unit, retreats, provinces, uOpts)
          : [];
        const simRes = simActive
          ? simulationResult?.resolutions[unit.id]
          : null;
        const isDisbanding = order?.order_type === 'DISBAND';

        return (
          <UnitMacroCard
            key={unit.id}
            unit={unit}
            order={order}
            powerMeta={powerMeta}
            provinces={provinces}
            units={units}
            unitsByProv={unitsByProv}
            orders={orders}
            reachable={reachable}
            validRetreats={validRetreats}
            unitOptions={uOpts}
            summary={summary}
            unitIssues={unitIssues}
            simRes={simRes}
            isSelected={isSelected}
            isHovered={isHovered}
            hasError={hasError}
            hasWarn={hasWarn}
            isDisbanding={isDisbanding}
            isRetreatPhase={isRetreatPhase}
            isAdjustmentPhase={isAdjustmentPhase}
            buildCount={buildCount}
            compact={compactOrders}
            useNativeSelect={isSheet}
            onSelectUnit={onSelectUnit}
            onHoverUnit={onHoverUnit}
            onHighlightProvinces={onHighlightProvinces}
            onUpdateOrder={onUpdateOrder}
            handleOrderTypeChange={handleOrderTypeChange}
          />
        );
      })}
    </>
  );
};
