import { Anchor, CheckCircle2, PlusCircle, Swords } from 'lucide-react';
import type React from 'react';
import type { Order, Power, ProvinceInfo, Unit } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import { formatOrderSummary } from '../../utils/orderHelpers';
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

  return (
    <div
      className={cx(styles.unitMacroCard, isSelected && styles.selected)}
      data-testid="build-macro-card"
      data-home-province={homeProv}
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
              {buildOrder?.unit_type === 'F' ? 'Fleet' : 'Army'}
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
        <span className={styles.behaviorTargetText}>{summary.targetText}</span>
      </div>

      <div
        className={styles.unitInlineControls}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={tabStyles.orderTypeTabs}>
          <button
            type="button"
            data-testid="btn-build-army"
            data-active={isArmy ? 'true' : undefined}
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
            <Swords size={11} /> + Army
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
                    data-active={isThisCoastFleet ? 'true' : undefined}
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
                    <Anchor size={11} /> + Fleet ({cst})
                  </button>
                );
              })
            ) : (
              <button
                type="button"
                data-testid="btn-build-fleet"
                data-active={isFleet ? 'true' : undefined}
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
                <Anchor size={11} /> + Fleet
              </button>
            ))}

          <button
            type="button"
            data-testid="btn-build-waive"
            data-active={isWaived ? 'true' : undefined}
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
      </div>
    </div>
  );
};
