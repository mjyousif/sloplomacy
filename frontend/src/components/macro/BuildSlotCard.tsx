import { Anchor, CheckCircle2, PlusCircle, Swords } from 'lucide-react';
import type React from 'react';
import type { Order, Power, ProvinceInfo, Unit } from '../../types/diplomacy';
import { formatOrderSummary } from '../../utils/orderHelpers';

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
      className={`unit-macro-card ${isSelected ? 'selected' : ''}`}
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
      <div className="unit-card-header">
        <div className="unit-identity">
          <span
            className="unit-type-badge"
            style={{
              backgroundColor: isWaived ? '#64748b' : '#16a34a',
            }}
          >
            <PlusCircle size={11} />
            {isWaived ? '—' : buildOrder?.unit_type || 'A'}
          </span>
          <div>
            <div className="unit-prov-title">
              {pInfo?.name || homeProv}
              <span className="unit-prov-code">
                {homeProv}
                {isFleet && activeCoast ? `/${activeCoast}` : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="unit-status-pill-wrap">
          {isWaived ? (
            <span className="unit-mini-pill unconfirmed">Waived</span>
          ) : (
            <span className="unit-mini-pill confirmed">
              <CheckCircle2 size={11} /> Build{' '}
              {buildOrder?.unit_type === 'F' ? 'Fleet' : 'Army'}
            </span>
          )}
        </div>
      </div>

      <div className="unit-behavior-visualizer">
        <span
          className="behavior-verb-tag"
          style={{ backgroundColor: summary.badgeColor }}
        >
          {summary.verb}
        </span>
        <span className="behavior-target-text">{summary.targetText}</span>
      </div>

      <div
        className="unit-inline-controls"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="order-type-tabs">
          <button
            type="button"
            data-testid="btn-build-army"
            className={`order-tab-btn ${isArmy ? 'active' : ''}`}
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
                    className={`order-tab-btn ${isThisCoastFleet ? 'active' : ''}`}
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
                className={`order-tab-btn ${isFleet ? 'active' : ''}`}
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
            className={`order-tab-btn ${isWaived ? 'active' : ''}`}
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
