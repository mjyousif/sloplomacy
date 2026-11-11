import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Crosshair,
  Info,
  MoveRight,
  Shield,
  Swords,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import {
  type Order,
  type OrderResolution,
  type OrderType,
  POWER_METADATA,
  type ProvinceInfo,
  type Unit,
  type ValidationIssue,
} from '../../types/diplomacy';

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
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
  handleOrderTypeChange,
}) => {
  return (
    <div
      key={unit.id}
      className={`unit-macro-card ${isSelected ? 'selected' : ''} ${
        isHovered ? 'hovered' : ''
      } ${hasError ? 'card-error' : hasWarn ? 'card-warning' : ''}`}
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
        onHoverUnit(unit.id);
        const provs = [unit.province];
        if (order?.target) provs.push(order.target);
        if (order?.aux_unit_origin) provs.push(order.aux_unit_origin);
        onHighlightProvinces(provs);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'touch') return;
        onHoverUnit(null);
        onHighlightProvinces([]);
      }}
    >
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
          ) : isAdjustmentPhase || (isRetreatPhase && !unit.is_dislodged) ? (
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
        {isRetreatPhase ? (
          unit.is_dislodged ? (
            <>
              <div className="order-type-tabs">
                {validRetreats.length > 0 && (
                  <button
                    type="button"
                    data-testid="btn-order-retreat"
                    className={`order-tab-btn ${order?.order_type === 'RETREAT' ? 'active' : ''}`}
                    style={
                      order?.order_type === 'RETREAT'
                        ? {
                            backgroundColor: '#ea580c',
                            borderColor: '#fdba74',
                            color: '#fff',
                          }
                        : undefined
                    }
                    onClick={() => handleOrderTypeChange(unit, 'RETREAT')}
                  >
                    <MoveRight size={11} /> RETREAT
                  </button>
                )}
                <button
                  type="button"
                  data-testid="btn-order-disband"
                  className={`order-tab-btn ${order?.order_type === 'DISBAND' ? 'active' : ''}`}
                  style={
                    order?.order_type === 'DISBAND'
                      ? {
                          backgroundColor: '#dc2626',
                          borderColor: '#fca5a5',
                          color: '#fff',
                        }
                      : undefined
                  }
                  onClick={() => handleOrderTypeChange(unit, 'DISBAND')}
                >
                  <Trash2 size={11} /> DISBAND
                </button>
              </div>

              {order?.order_type === 'RETREAT' && validRetreats.length > 0 && (
                <div className="order-param-row">
                  <label>Retreat To:</label>
                  <select
                    data-testid="select-retreat-target"
                    value={
                      order.target
                        ? `${order.target}${order.target_coast ? `/${order.target_coast}` : ''}`
                        : ''
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      const [base, cst] = val.split('/');
                      onUpdateOrder({
                        ...order,
                        target: base,
                        target_coast: cst || null,
                        is_explicit: true,
                      });
                    }}
                  >
                    {validRetreats.flatMap((r) => {
                      if (r.coasts.length > 0 && unit.unit_type === 'F') {
                        return r.coasts.map((c) => (
                          <option
                            key={`${r.province}/${c}`}
                            value={`${r.province}/${c}`}
                          >
                            {provinces[r.province]?.name} ({c} Coast) [
                            {r.province}/{c}]
                          </option>
                        ));
                      }
                      return (
                        <option key={r.province} value={r.province}>
                          {provinces[r.province]?.name} ({r.province})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </>
          ) : null
        ) : isAdjustmentPhase ? (
          buildCount < 0 ? (
            <div className="order-type-tabs">
              <button
                type="button"
                data-testid="btn-adjustment-keep"
                className={`order-tab-btn ${!isDisbanding ? 'active' : ''}`}
                onClick={() => handleOrderTypeChange(unit, 'HOLD')}
              >
                <Shield size={11} /> KEEP UNIT
              </button>
              <button
                type="button"
                data-testid="btn-adjustment-disband"
                className={`order-tab-btn ${isDisbanding ? 'active' : ''}`}
                style={
                  isDisbanding
                    ? {
                        backgroundColor: '#dc2626',
                        borderColor: '#fca5a5',
                        color: '#fff',
                      }
                    : undefined
                }
                onClick={() => handleOrderTypeChange(unit, 'DISBAND')}
              >
                <Trash2 size={11} /> DISBAND UNIT
              </button>
            </div>
          ) : null
        ) : (
          <>
            <div className="order-type-tabs">
              {(['HOLD', 'MOVE', 'SUPPORT', 'CONVOY'] as OrderType[]).map(
                (oType) => {
                  if (
                    oType === 'CONVOY' &&
                    (unit.unit_type !== 'F' ||
                      provinces[unit.province]?.type !== 'SEA')
                  ) {
                    return null;
                  }
                  const active = (order?.order_type || 'HOLD') === oType;
                  return (
                    <button
                      key={oType}
                      type="button"
                      className={`order-tab-btn ${active ? 'active' : ''}`}
                      data-testid={`btn-order-type-${oType}`}
                      onClick={() => handleOrderTypeChange(unit, oType)}
                    >
                      {oType === 'HOLD' && <Shield size={11} />}
                      {oType === 'MOVE' && <MoveRight size={11} />}
                      {oType === 'SUPPORT' && <Crosshair size={11} />}
                      {oType === 'CONVOY' && <Anchor size={11} />}
                      {oType}
                    </button>
                  );
                },
              )}
            </div>

            {order?.order_type === 'MOVE' && (
              <div className="order-param-row">
                <label>Destination:</label>
                <select
                  data-testid="select-order-target"
                  value={
                    order.target
                      ? `${order.target}${order.target_coast ? `/${order.target_coast}` : ''}`
                      : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const [base, cst] = val.split('/');
                    const isAdjacent = reachable.some(
                      (r) => r.province === base,
                    );
                    onUpdateOrder({
                      ...order,
                      target: base,
                      target_coast: cst || null,
                      via_convoy: unit.unit_type === 'A' && !isAdjacent,
                      is_explicit: true,
                    });
                  }}
                >
                  <optgroup label="Reachable Provinces">
                    {reachable.flatMap((r) => {
                      if (r.coasts.length > 0 && unit.unit_type === 'F') {
                        return r.coasts.map((c) => (
                          <option
                            key={`${r.province}/${c}`}
                            value={`${r.province}/${c}`}
                          >
                            {provinces[r.province]?.name} ({c} Coast) [
                            {r.province}/{c}]
                          </option>
                        ));
                      }
                      return (
                        <option key={r.province} value={r.province}>
                          {provinces[r.province]?.name} ({r.province})
                        </option>
                      );
                    })}
                  </optgroup>
                  {unit.unit_type === 'A' &&
                    provinces[unit.province]?.type === 'COAST' && (
                      <optgroup label="Coastal (via Convoy)">
                        {Object.values(provinces)
                          .filter(
                            (p) =>
                              p.type === 'COAST' &&
                              p.id !== unit.province &&
                              !reachable.some((r) => r.province === p.id),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.id}) — via Convoy
                            </option>
                          ))}
                      </optgroup>
                    )}
                </select>
              </div>
            )}

            {order?.order_type === 'SUPPORT' && (
              <div className="order-param-grid">
                <div className="order-param-row">
                  <label>Unit:</label>
                  <select
                    data-testid="select-support-unit"
                    value={order.aux_unit_origin || ''}
                    onChange={(e) => {
                      const newAux = e.target.value;
                      const supUnit = unitsByProv[newAux];
                      const supOrd = supUnit ? orders[supUnit.id] : undefined;
                      const autoTarget =
                        supOrd?.order_type === 'MOVE' && supOrd.target
                          ? supOrd.target
                          : newAux;
                      onUpdateOrder({
                        ...order,
                        aux_unit_origin: newAux,
                        target: autoTarget,
                        is_explicit: true,
                      });
                    }}
                  >
                    {units
                      .filter((u2) => u2.id !== unit.id && !u2.is_dislodged)
                      .map((u2) => (
                        <option key={u2.id} value={u2.province}>
                          [{POWER_METADATA[u2.power].shortName}] {u2.unit_type}{' '}
                          {provinces[u2.province]?.name} ({u2.province})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="order-param-row">
                  <label>Into:</label>
                  <select
                    data-testid="select-support-target"
                    value={order.target || ''}
                    onChange={(e) => {
                      onUpdateOrder({
                        ...order,
                        target: e.target.value,
                        is_explicit: true,
                      });
                    }}
                  >
                    {order.aux_unit_origin && (
                      <option value={order.aux_unit_origin}>
                        HOLD in {provinces[order.aux_unit_origin]?.name} (
                        {order.aux_unit_origin})
                      </option>
                    )}
                    <optgroup label="Support Move Into:">
                      {reachable
                        .filter((r) => r.province !== order.aux_unit_origin)
                        .map((r) => (
                          <option key={r.province} value={r.province}>
                            → {provinces[r.province]?.name} ({r.province})
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
              </div>
            )}

            {order?.order_type === 'CONVOY' && (
              <div className="order-param-grid">
                <div className="order-param-row">
                  <label>Army:</label>
                  <select
                    value={order.aux_unit_origin || ''}
                    onChange={(e) => {
                      const nextOrigin = e.target.value;
                      const nextTarget =
                        order.target && order.target !== nextOrigin
                          ? order.target
                          : Object.values(provinces).find(
                              (p) => p.type === 'COAST' && p.id !== nextOrigin,
                            )?.id || null;
                      onUpdateOrder({
                        ...order,
                        aux_unit_origin: nextOrigin,
                        target: nextTarget,
                        is_explicit: true,
                      });
                    }}
                  >
                    {units
                      .filter(
                        (u2) =>
                          u2.unit_type === 'A' &&
                          !u2.is_dislodged &&
                          provinces[u2.province]?.type === 'COAST',
                      )
                      .map((u2) => (
                        <option key={u2.id} value={u2.province}>
                          A {provinces[u2.province]?.name} ({u2.province})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="order-param-row">
                  <label>To Coast:</label>
                  <select
                    value={order.target || ''}
                    onChange={(e) =>
                      onUpdateOrder({
                        ...order,
                        target: e.target.value,
                        is_explicit: true,
                      })
                    }
                  >
                    {Object.values(provinces)
                      .filter(
                        (p) =>
                          p.type === 'COAST' && p.id !== order.aux_unit_origin,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.id})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
