import { Anchor, CheckCircle2, PlusCircle, Swords } from 'lucide-react';
import type React from 'react';
import type { Order, Power, ProvinceInfo, Unit } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import { formatOrderSummary } from '../../utils/orderHelpers';
import { unitTypeName } from '../../utils/turnFormat';
import tabStyles from './OrderTypeTabs.module.css';
import styles from './UnitMacroCard.module.css';

export interface BuildSlotCardProps {
  homeProv: string;
  buildOrder: Order | undefined;
  pInfo: ProvinceInfo | undefined;
  activePower: Power;
  isSelected: boolean;
  provinces: Record<string, ProvinceInfo>;
  unitsByProv: Record<string, Unit>;
  compact?: boolean;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onUpdateOrder: (order: Order) => void;
}

export const BuildSlotCard: React.FC<BuildSlotCardProps> = ({
  homeProv,
  buildOrder,
  pInfo,
  activePower,
  isSelected,
  provinces,
  unitsByProv,
  compact = false,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
}) => {
  const bId = `BUILD_${activePower}_${homeProv}`;
  const isWaived = buildOrder?.order_type === 'WAIVE';
  const isArmy = !isWaived && (buildOrder?.unit_type === 'A' || !buildOrder);
  const isFleet = !isWaived && buildOrder?.unit_type === 'F';
  const activeCoast =
    buildOrder?.origin_coast || buildOrder?.target_coast || null;
  const summary = formatOrderSummary(buildOrder, provinces, unitsByProv);

  const buildOrderButtons = (
    <div
      className={tabStyles.orderTypeTabs}
      data-compact={compact ? 'true' : undefined}
    >
      <button
        type="button"
        data-testid="btn-build-army"
        data-compact={compact ? 'true' : undefined}
        data-compact-label={compact ? 'true' : undefined}
        data-active={isArmy ? 'true' : undefined}
        title="Build Army"
        className={tabStyles.orderTabBtn}
        style={
          isArmy
            ? {
                backgroundColor: '#15803d',
                borderColor: '#4ade80',
                color: '#fff',
              }
            : undefined
        }
        onClick={() =>
          onUpdateOrder({
            unit_id: bId,
            power: activePower,
            unit_type: 'A',
            origin: homeProv,
            origin_coast: null,
            order_type: 'BUILD',
            via_convoy: false,
            is_explicit: true,
          })
        }
      >
        {compact ? (
          '+A'
        ) : (
          <>
            <Swords size={11} /> + Army
          </>
        )}
      </button>

      {pInfo?.type === 'COAST' &&
        (pInfo.coasts && pInfo.coasts.length > 0 ? (
          pInfo.coasts.map((cst) => {
            const isThisCoastFleet = isFleet && activeCoast === cst;
            return (
              <button
                key={cst}
                type="button"
                data-testid={`btn-build-fleet-${cst}`}
                data-compact={compact ? 'true' : undefined}
                data-compact-label={compact ? 'true' : undefined}
                data-active={isThisCoastFleet ? 'true' : undefined}
                title={`Build Fleet (${cst})`}
                className={tabStyles.orderTabBtn}
                style={
                  isThisCoastFleet
                    ? {
                        backgroundColor: '#15803d',
                        borderColor: '#4ade80',
                        color: '#fff',
                      }
                    : undefined
                }
                onClick={() =>
                  onUpdateOrder({
                    unit_id: bId,
                    power: activePower,
                    unit_type: 'F',
                    origin: homeProv,
                    origin_coast: cst,
                    order_type: 'BUILD',
                    via_convoy: false,
                    is_explicit: true,
                  })
                }
              >
                {compact ? (
                  `+F(${cst})`
                ) : (
                  <>
                    <Anchor size={11} /> + Fleet ({cst})
                  </>
                )}
              </button>
            );
          })
        ) : (
          <button
            type="button"
            data-testid="btn-build-fleet"
            data-compact={compact ? 'true' : undefined}
            data-compact-label={compact ? 'true' : undefined}
            data-active={isFleet ? 'true' : undefined}
            title="Build Fleet"
            className={tabStyles.orderTabBtn}
            style={
              isFleet
                ? {
                    backgroundColor: '#15803d',
                    borderColor: '#4ade80',
                    color: '#fff',
                  }
                : undefined
            }
            onClick={() =>
              onUpdateOrder({
                unit_id: bId,
                power: activePower,
                unit_type: 'F',
                origin: homeProv,
                origin_coast: null,
                order_type: 'BUILD',
                via_convoy: false,
                is_explicit: true,
              })
            }
          >
            {compact ? (
              '+F'
            ) : (
              <>
                <Anchor size={11} /> + Fleet
              </>
            )}
          </button>
        ))}

      <button
        type="button"
        data-testid="btn-build-waive"
        data-compact={compact ? 'true' : undefined}
        data-compact-label={compact ? 'true' : undefined}
        data-active={isWaived ? 'true' : undefined}
        title="Waive build"
        className={tabStyles.orderTabBtn}
        onClick={() =>
          onUpdateOrder({
            unit_id: bId,
            power: activePower,
            unit_type: 'A',
            origin: homeProv,
            origin_coast: null,
            order_type: 'WAIVE',
            via_convoy: false,
            is_explicit: true,
          })
        }
      >
        Waive
      </button>
    </div>
  );

  return (
    <div
      className={cx(
        styles.unitMacroCard,
        compact && styles.unitMacroCardCompact,
        isSelected && styles.selected,
      )}
      data-testid="build-macro-card"
      data-home-province={homeProv}
      data-compact={compact ? 'true' : undefined}
      style={{
        borderLeft: `4px solid ${isWaived ? '#64748b' : '#16a34a'}`,
      }}
      onClick={() => onSelectUnit(isSelected ? null : bId)}
      onPointerEnter={(e) => {
        if (e.pointerType === 'touch') return;
        onHoverUnit(bId);
        onHighlightProvinces([homeProv]);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return;
        onHoverUnit(null);
        onHighlightProvinces([]);
      }}
    >
      {compact ? (
        <div className={styles.unitCompactRow} data-testid="build-compact-row">
          <span
            className={cx(styles.unitTypeBadge, styles.compact)}
            style={{
              backgroundColor: isWaived ? '#64748b' : '#16a34a',
            }}
          >
            <PlusCircle size={10} />
            {isWaived ? '—' : buildOrder?.unit_type || 'A'}
          </span>
          <span
            className={styles.unitCompactProv}
            title={`${pInfo?.name || homeProv} (${homeProv}${isFleet && activeCoast ? `/${activeCoast}` : ''})`}
          >
            {pInfo?.name || homeProv}
          </span>
          <div
            className={styles.unitCompactControls}
            onClick={(e) => e.stopPropagation()}
          >
            {buildOrderButtons}
          </div>
        </div>
      ) : (
        <>
          <div className={styles.unitCardHeader}>
            <div className={styles.unitIdentity}>
              <span
                className={styles.unitTypeBadge}
                style={{
                  backgroundColor: isWaived ? '#64748b' : '#16a34a',
                }}
              >
                <PlusCircle size={11} />
                {isWaived ? '—' : buildOrder?.unit_type || 'A'}
              </span>
              <div>
                <div className={styles.unitProvTitle}>
                  {pInfo?.name || homeProv}
                  <span className={styles.unitProvCode}>
                    {homeProv}
                    {isFleet && activeCoast ? `/${activeCoast}` : ''}
                  </span>
                </div>
              </div>
            </div>
            <div>
              {isWaived ? (
                <span className={cx(styles.unitMiniPill, styles.unconfirmed)}>
                  Waived
                </span>
              ) : (
                <span className={cx(styles.unitMiniPill, styles.confirmed)}>
                  <CheckCircle2 size={11} /> Build{' '}
                  {unitTypeName(buildOrder?.unit_type ?? 'A')}
                </span>
              )}
            </div>
          </div>

          <div className={styles.unitBehaviorVisualizer}>
            <span
              className={styles.behaviorVerbTag}
              style={{ backgroundColor: summary.badgeColor }}
            >
              {summary.verb}
            </span>
            <span className={styles.behaviorTargetText}>
              {summary.targetText}
            </span>
          </div>

          <div
            className={styles.unitInlineControls}
            onClick={(e) => e.stopPropagation()}
          >
            {buildOrderButtons}
          </div>
        </>
      )}
    </div>
  );
};
