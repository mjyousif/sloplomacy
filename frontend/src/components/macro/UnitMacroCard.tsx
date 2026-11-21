import { AlertTriangle, Info } from 'lucide-react';
import type React from 'react';
import { useCallback, useRef, useState } from 'react';
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
import { splitProvinceCode } from '../../utils/orderHelpers';
import { UnitCardCompactRow } from './UnitCardCompactRow';
import { UnitCardDetail } from './UnitCardDetail';
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
  /** Desktop selects the unit when an order tab is picked; the phone sheet keeps the sheet open. */
  selectOnOrderTypeChange?: boolean;
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
  selectOnOrderTypeChange = true,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
  handleOrderTypeChange: changeOrderType,
}) => {
  // Picking an order type on a desktop card also picks the unit, never toggling it off.
  // On a phone sheet, order controls stay inside the open sheet instead of dropping to the docked bar.
  const handleOrderTypeChange = (u: Unit, type: OrderType) => {
    if (selectOnOrderTypeChange && !isSelected) onSelectUnit(u.id);
    changeOrderType(u, type);
  };

  const isCompactRow = compact;
  const isCardHoveredRef = useRef(false);
  // A compact row with a warning (and no error) glows yellow and keeps the
  // explanation behind a ⚠ button, so the one-line layout stays one line.
  const hasWarnToggle = isCompactRow && hasWarn && !hasError;
  const [isWarnOpen, setIsWarnOpen] = useState(false);
  const visibleIssues =
    hasWarnToggle && !isWarnOpen
      ? unitIssues.filter((iss) => iss.severity !== 'warning')
      : unitIssues;

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
        <UnitCardCompactRow
          unit={unit}
          order={order}
          powerColor={powerMeta.color}
          provinces={provinces}
          units={units}
          unitsByProv={unitsByProv}
          orders={orders}
          reachable={reachable}
          validRetreats={validRetreats}
          unitOptions={unitOptions}
          isDisbanding={isDisbanding}
          isRetreatPhase={isRetreatPhase}
          isAdjustmentPhase={isAdjustmentPhase}
          buildCount={buildCount}
          useNativeSelect={useNativeSelect}
          hasWarnToggle={hasWarnToggle}
          isWarnOpen={isWarnOpen}
          onToggleWarn={() => setIsWarnOpen((open) => !open)}
          handleOrderTypeChange={handleOrderTypeChange}
          onUpdateOrder={onUpdateOrder}
          onHoverProvince={handleHoverOptionProvince}
        />
      ) : (
        <UnitCardDetail
          unit={unit}
          order={order}
          powerColor={powerMeta.color}
          provinces={provinces}
          units={units}
          unitsByProv={unitsByProv}
          orders={orders}
          reachable={reachable}
          validRetreats={validRetreats}
          unitOptions={unitOptions}
          summary={summary}
          hasError={hasError}
          hasWarn={hasWarn}
          isDisbanding={isDisbanding}
          isRetreatPhase={isRetreatPhase}
          isAdjustmentPhase={isAdjustmentPhase}
          buildCount={buildCount}
          useNativeSelect={useNativeSelect}
          handleOrderTypeChange={handleOrderTypeChange}
          onUpdateOrder={onUpdateOrder}
          onHoverProvince={handleHoverOptionProvince}
        />
      )}

      {/* Diagnostic Alerts (a compact warning row shows its warnings only while opened) */}
      {visibleIssues.map((iss) => (
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
