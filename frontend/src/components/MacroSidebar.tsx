import React from 'react';
import {
  ALL_POWERS,
  Order,
  OrderType,
  POWER_METADATA,
  Power,
  ProvinceInfo,
  SimulationResult,
  Unit,
  ValidationIssue,
} from '../types/diplomacy';
import {
  canUnitSupportInto,
  formatOrderSummary,
  getReachableDestinations,
} from '../utils/orderHelpers';
import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  Crosshair,
  Flag,
  FlaskConical,
  Lock,
  MoveRight,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Sliders,
  Swords,
  Trash2,
  Unlock,
} from 'lucide-react';

interface MacroSidebarProps {
  provinces: Record<string, ProvinceInfo>;
  units: Unit[];
  orders: Record<string, Order>;
  ownership: Record<string, Power>;
  activePower: Power;
  finalizedPowers: Power[];
  sandboxMode: boolean;
  selectedUnitId: string | null;
  hoveredUnitId: string | null;
  issues: ValidationIssue[];
  simulationResult: SimulationResult | null;
  showSimulationOverlay: boolean;
  phase?: string;
  season?: string;
  builds?: Record<Power, { count: number; homes: string[] }> | null;
  retreats?: Record<Power, Record<string, string[]>> | null;
  isMultiplayer?: boolean;
  isGameCreator?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onSelectPower: (power: Power) => void;
  onToggleSandboxMode: () => void;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onUpdateOrder: (order: Order) => void;
  onConfirmAllHolds: () => void;
  onClearForeignPreMoves: () => void;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onSimulatePreMoves: () => void;
  onAdjudicateTurn: () => void;
  onLoadScenario: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  onSurrenderClick?: () => void;
  surrenderedPowers?: Power[];
}

export const MacroSidebar: React.FC<MacroSidebarProps> = ({
  provinces,
  units,
  orders,
  ownership,
  activePower,
  finalizedPowers,
  surrenderedPowers = [],
  sandboxMode,
  selectedUnitId,
  hoveredUnitId,
  issues,
  simulationResult,
  showSimulationOverlay,
  phase = 'Movement',
  season = 'Spring',
  builds = null,
  retreats = null,
  isMultiplayer = false,
  isGameCreator = false,
  onOpenAdminTools,
  adminOverrideActive = false,
  onSelectPower,
  onToggleSandboxMode,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
  onConfirmAllHolds,
  onClearForeignPreMoves,
  onFinalizeClick,
  onUnfinalizeClick,
  onSimulatePreMoves,
  onAdjudicateTurn,
  onLoadScenario,
  onSaveSandboxClick,
  onSurrenderClick,
}) => {
  const powerMeta = POWER_METADATA[activePower];
  const isFinalized = finalizedPowers.includes(activePower);
  const isSurrendered = surrenderedPowers.includes(activePower);

  const unitsByProv: Record<string, Unit> = {};
  const unitsById: Record<string, Unit> = {};
  for (const u of units) {
    unitsByProv[u.province] = u;
    unitsById[u.id] = u;
  }

  const myUnits = units.filter((u) => u.power === activePower);
  const selectedUnit = selectedUnitId ? unitsById[selectedUnitId] : null;
  const isForeignUnitSelected = Boolean(selectedUnit && selectedUnit.power !== activePower);

  const foreignModifiedOrders = units
    .filter((u) => u.power !== activePower)
    .map((u) => ({ unit: u, order: orders[u.id] }))
    .filter(({ order }) => order && (order.order_type !== 'HOLD' || order.is_explicit));

  const myIssues = issues.filter((i) => i.power === activePower);
  const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
  const myBuildInfo = builds ? builds[activePower] : undefined;
  const buildCount = myBuildInfo ? myBuildInfo.count : 0;
  const buildHomes = myBuildInfo ? myBuildInfo.homes : [];
  const issuesByUnit: Record<string, ValidationIssue[]> = {};
  for (const iss of issues) {
    for (const uid of iss.unit_ids) {
      if (!issuesByUnit[uid]) issuesByUnit[uid] = [];
      issuesByUnit[uid].push(iss);
    }
  }

  const confirmedCount = myUnits.filter((u) => orders[u.id]?.is_explicit).length;
  const unconfirmedCount = myUnits.length - confirmedCount;
  const simActive = showSimulationOverlay || sandboxMode;

  // Supply center count per power
  const scCountByPower: Record<Power, number> = {
    AUSTRIA: 0,
    ENGLAND: 0,
    FRANCE: 0,
    GERMANY: 0,
    ITALY: 0,
    RUSSIA: 0,
    TURKEY: 0,
  };
  for (const [, pwr] of Object.entries(ownership)) {
    if (scCountByPower[pwr] !== undefined) scCountByPower[pwr]++;
  }

  const handleOrderTypeChange = (unit: Unit, newType: OrderType) => {
    const reachable = getReachableDestinations(unit, provinces);
    if (newType === 'HOLD') {
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'HOLD',
        target: null,
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
    } else if (newType === 'MOVE') {
      const firstDest = reachable[0];
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'MOVE',
        target: firstDest ? firstDest.province : null,
        target_coast: firstDest && firstDest.coasts.length === 1 ? firstDest.coasts[0] : null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
    } else if (newType === 'SUPPORT') {
      const otherUnits = units.filter((other) => other.id !== unit.id);
      const defaultSup =
        otherUnits.find(
          (other) =>
            other.power === unit.power &&
            (canUnitSupportInto(unit, other.province, provinces) ||
              (orders[other.id]?.target &&
                canUnitSupportInto(unit, orders[other.id].target!, provinces)))
        ) || otherUnits[0];

      const supOrder = defaultSup ? orders[defaultSup.id] : undefined;
      const defaultTarget =
        supOrder &&
        supOrder.order_type === 'MOVE' &&
        supOrder.target &&
        canUnitSupportInto(unit, supOrder.target, provinces)
          ? supOrder.target
          : defaultSup?.province || null;

      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'SUPPORT',
        aux_unit_origin: defaultSup ? defaultSup.province : null,
        target: defaultTarget,
        via_convoy: false,
        is_explicit: true,
      });
    } else if (newType === 'CONVOY') {
      const armies = units.filter((u2) => u2.unit_type === 'A');
      const firstArmy = armies.find((a) => a.power === unit.power) || armies[0];
      const coastalProvs = Object.values(provinces).filter((p) => p.type === 'COAST');
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'CONVOY',
        aux_unit_origin: firstArmy ? firstArmy.province : null,
        target: coastalProvs[0]?.id || null,
        via_convoy: false,
        is_explicit: true,
      });
    }
  };

  return (
    <aside className="macro-sidebar">
      {/* 1. GREAT POWER SELECTOR STRIP (SANDBOX) OR SOVEREIGN LOCK (MULTIPLAYER) */}
      {isMultiplayer ? (
        <div className="sidebar-section power-selector-section mp-locked-section">
          <div className="section-overline">
            <Lock size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            MULTIPLAYER SOVEREIGN NATION (COUNTRY LOCKED)
          </div>
          <div className="mp-diplomatic-status-row">
            {ALL_POWERS.map((pwr) => {
              const meta = POWER_METADATA[pwr];
              const pwrFinalized = finalizedPowers.includes(pwr);
              const isMe = pwr === activePower;
              return (
                <div
                  key={pwr}
                  className={`mp-status-chip ${isMe ? 'mine' : ''}`}
                  title={`${meta.name}: ${pwrFinalized ? 'Orders Finalized' : 'Orders Pending'}`}
                  style={{
                    borderColor: isMe ? meta.color : undefined,
                    backgroundColor: isMe ? meta.lightBg : undefined,
                  }}
                >
                  <span className="power-dot" style={{ backgroundColor: meta.color }} />
                  <span className="mp-chip-code">{pwr.slice(0, 3)}</span>
                  {pwrFinalized && (
                    <CheckCircle2 size={11} className="power-finalized-icon" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="sidebar-section power-selector-section">
          <div className="section-overline">SELECT GREAT POWER COMMAND</div>
          <div className="power-pills-grid">
            {ALL_POWERS.map((pwr) => {
              const meta = POWER_METADATA[pwr];
              const pwrIssues = issues.filter((i) => i.power === pwr);
              const pwrFinalized = finalizedPowers.includes(pwr);
              const isActive = pwr === activePower;

              return (
                <button
                  key={pwr}
                  className={`power-pill-btn ${isActive ? 'active' : ''}`}
                  style={{
                    borderColor: isActive ? meta.color : undefined,
                    backgroundColor: isActive ? meta.lightBg : undefined,
                  }}
                  onClick={() => onSelectPower(pwr)}
                >
                  <span className="power-dot" style={{ backgroundColor: meta.color }} />
                  <span className="power-pill-name">{meta.shortName}</span>
                  {pwrFinalized && (
                    <CheckCircle2 size={12} className="power-finalized-icon" />
                  )}
                  {!pwrFinalized && pwrIssues.length > 0 && (
                    <span className="power-warn-count">{pwrIssues.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. ACTIVE POWER MACRO HEADER & TELEMETRY */}
      <div
        className="active-power-banner"
        style={{ borderLeft: `4px solid ${powerMeta.color}` }}
      >
        <div className="power-banner-top">
          <div>
            <div className="power-banner-title">
              <span>{powerMeta.crest}</span> {powerMeta.name}
            </div>
            <div className="power-banner-sub">
              {myUnits.length} Active Units • {scCountByPower[activePower]} Supply Centers
            </div>
          </div>

          <div className="power-status-badge-wrap">
            {isSurrendered ? (
              <span className="status-badge surrendered">
                <Flag size={12} /> Civil Disorder
              </span>
            ) : isFinalized ? (
              <span className="status-badge finalized">
                <Lock size={12} /> Finalized
              </span>
            ) : myIssues.length > 0 ? (
              <span className="status-badge has-warnings">
                <AlertTriangle size={12} /> {myIssues.length} Issue
                {myIssues.length > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="status-badge drafting">Drafting Orders</span>
            )}
          </div>
        </div>

        {/* Quick Toolbar for Presets & Confirm All */}
        <div className="macro-quick-actions">
          <button
            className="quick-action-btn"
            title="Mark all current orders (including Holds) as confirmed"
            onClick={onConfirmAllHolds}
          >
            <CheckCircle2 size={13} /> Confirm All ({confirmedCount}/{myUnits.length})
          </button>
          {isMultiplayer && onSurrenderClick && (
            <button
              type="button"
              className="quick-action-btn surrender-btn-sidebar"
              title="Surrender sovereign command and leave this multiplayer campaign"
              onClick={onSurrenderClick}
            >
              <Flag size={13} /> Surrender &amp; Leave
            </button>
          )}
          {!isMultiplayer && (
            <button
              className="quick-action-btn"
              title="Reset to clean Spring 1901 start"
              onClick={() => onLoadScenario('standard_1901')}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
          {!isMultiplayer && onSaveSandboxClick && (
            <button
              className="quick-action-btn"
              title="Save this sandbox scenario to your account"
              onClick={onSaveSandboxClick}
            >
              <Shield size={13} /> Save
            </button>
          )}
        </div>

        {isAdjustmentPhase && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor:
                buildCount > 0
                  ? 'rgba(22, 163, 74, 0.15)'
                  : buildCount < 0
                  ? 'rgba(220, 38, 38, 0.15)'
                  : 'rgba(100, 116, 139, 0.15)',
              border: `1px solid ${
                buildCount > 0 ? '#16a34a' : buildCount < 0 ? '#dc2626' : '#64748b'
              }`,
              fontSize: '12px',
              lineHeight: '1.4',
            }}
          >
            <strong>WINTER ADJUSTMENT PHASE:</strong>{' '}
            {buildCount > 0
              ? `${powerMeta.shortName} may build up to ${buildCount} unit${
                  buildCount > 1 ? 's' : ''
                } in unoccupied home centers.`
              : buildCount < 0
              ? `${powerMeta.shortName} must disband ${Math.abs(buildCount)} unit${
                  Math.abs(buildCount) > 1 ? 's' : ''
                }.`
              : `${powerMeta.shortName} is in equilibrium (${myUnits.length} units = ${scCountByPower[activePower]} supply centers).`}
          </div>
        )}
      </div>

      {/* 3. MACRO UNIT COMMAND OVERVIEW LIST */}
      <div className="macro-units-scroll-area">
        <div className="macro-list-header">
          <span>MACRO FORCE OVERVIEW ({myUnits.length} UNITS)</span>
          <span className="macro-hint">Click card or map to edit</span>
        </div>

        {myUnits.map((unit) => {
          const order = orders[unit.id];
          const unitIssues = issuesByUnit[unit.id] || [];
          const hasError = unitIssues.some((i) => i.severity === 'error');
          const hasWarn = unitIssues.some((i) => i.severity === 'warning');
          const isSelected = unit.id === selectedUnitId;
          const isHovered = unit.id === hoveredUnitId;
          const summary = formatOrderSummary(order, provinces, unitsByProv);
          const reachable = getReachableDestinations(unit, provinces);
          const simRes = simActive ? simulationResult?.resolutions[unit.id] : null;

          return (
            <div
              key={unit.id}
              className={`unit-macro-card ${isSelected ? 'selected' : ''} ${
                isHovered ? 'hovered' : ''
              } ${hasError ? 'card-error' : hasWarn ? 'card-warning' : ''}`}
              onClick={() => onSelectUnit(isSelected ? null : unit.id)}
              onMouseEnter={() => {
                onHoverUnit(unit.id);
                const provs = [unit.province];
                if (order?.target) provs.push(order.target);
                if (order?.aux_unit_origin) provs.push(order.aux_unit_origin);
                onHighlightProvinces(provs);
              }}
              onMouseLeave={() => {
                onHoverUnit(null);
                onHighlightProvinces([]);
              }}
            >
              {/* Unit Card Header */}
              <div className="unit-card-header">
                <div className="unit-identity">
                  <span
                    className={`unit-type-badge ${unit.unit_type === 'A' ? 'army' : 'fleet'}`}
                    style={{ backgroundColor: powerMeta.color }}
                  >
                    {unit.unit_type === 'A' ? <Swords size={12} /> : <Anchor size={12} />}
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

                {/* Right-side status icon */}
                <div className="unit-status-pill-wrap">
                  {hasError ? (
                    <span className="unit-mini-pill error">
                      <AlertCircle size={12} /> Illegal
                    </span>
                  ) : hasWarn ? (
                    <span className="unit-mini-pill warning">
                      <AlertTriangle size={12} /> Warning
                    </span>
                  ) : order?.is_explicit ? (
                    <span className="unit-mini-pill confirmed">
                      <CheckCircle2 size={12} /> Ready
                    </span>
                  ) : (
                    <span className="unit-mini-pill unconfirmed">Default Hold</span>
                  )}
                </div>
              </div>

              {/* Visual Tactical Behavior Bar */}
              <div className="unit-behavior-visualizer">
                <span
                  className="behavior-verb-tag"
                  style={{ backgroundColor: summary.badgeColor }}
                >
                  {summary.verb}
                </span>
                <span className="behavior-target-text">{summary.targetText}</span>
              </div>

              {/* Inline Order Mode Buttons */}
              <div className="unit-inline-controls" onClick={(e) => e.stopPropagation()}>
                <div className="order-type-tabs">
                  {(['HOLD', 'MOVE', 'SUPPORT', 'CONVOY'] as OrderType[]).map((oType) => {
                    if (
                      oType === 'CONVOY' &&
                      (unit.unit_type !== 'F' || provinces[unit.province]?.type !== 'SEA')
                    ) {
                      return null;
                    }
                    const active = (order?.order_type || 'HOLD') === oType;
                    return (
                      <button
                        key={oType}
                        className={`order-tab-btn ${active ? 'active' : ''}`}
                        onClick={() => handleOrderTypeChange(unit, oType)}
                      >
                        {oType === 'HOLD' && <Shield size={11} />}
                        {oType === 'MOVE' && <MoveRight size={11} />}
                        {oType === 'SUPPORT' && <Crosshair size={11} />}
                        {oType === 'CONVOY' && <Anchor size={11} />}
                        {oType}
                      </button>
                    );
                  })}
                </div>

                {/* Contextual Selectors for MOVE, SUPPORT, CONVOY */}
                {order?.order_type === 'MOVE' && (
                  <div className="order-param-row">
                    <label>Destination:</label>
                    <select
                      value={
                        order.target
                          ? `${order.target}${order.target_coast ? `/${order.target_coast}` : ''}`
                          : ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [base, cst] = val.split('/');
                        const isAdjacent = reachable.some((r) => r.province === base);
                        onUpdateOrder({
                          ...order,
                          target: base,
                          target_coast: cst || null,
                          via_convoy: unit.unit_type === 'A' && !isAdjacent,
                          is_explicit: true,
                        });
                      }}
                    >
                      <optgroup label="Adjacent Reachable Provinces">
                        {reachable.flatMap((r) => {
                          if (r.coasts.length > 0 && unit.unit_type === 'F') {
                            return r.coasts.map((c) => (
                              <option key={`${r.province}/${c}`} value={`${r.province}/${c}`}>
                                {provinces[r.province]?.name} ({c} Coast) [{r.province}/{c}]
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
                      {unit.unit_type === 'A' && (
                        <optgroup label="Coastal Provinces (via Fleet Convoy)">
                          {Object.values(provinces)
                            .filter(
                              (p) =>
                                p.type === 'COAST' &&
                                p.id !== unit.province &&
                                !reachable.some((r) => r.province === p.id)
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
                      <label>Support Unit:</label>
                      <select
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
                          .filter((u2) => u2.id !== unit.id)
                          .map((u2) => (
                            <option key={u2.id} value={u2.province}>
                              [{POWER_METADATA[u2.power].shortName}] {u2.unit_type}{' '}
                              {provinces[u2.province]?.name} ({u2.province})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="order-param-row">
                      <label>Into / Hold:</label>
                      <select
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
                        onChange={(e) =>
                          onUpdateOrder({
                            ...order,
                            aux_unit_origin: e.target.value,
                            is_explicit: true,
                          })
                        }
                      >
                        {units
                          .filter((u2) => u2.unit_type === 'A')
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
                          .filter((p) => p.type === 'COAST')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.id})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time Warning / Sanity Diagnostic Banner inside Unit Card */}
              {unitIssues.map((iss) => (
                <div key={iss.id} className={`unit-diagnostic-alert ${iss.severity}`}>
                  <AlertTriangle size={14} className="diag-icon" />
                  <div>
                    <strong>{iss.title}:</strong> {iss.message}
                  </div>
                </div>
              ))}

              {/* Simulation Result Banner if Preview or Sandbox is Active */}
              {simRes && (
                <div
                  className={`unit-sim-result-strip ${
                    simRes.succeeded ? 'sim-ok' : 'sim-fail'
                  }`}
                >
                  <strong>{simRes.succeeded ? '✓ SIMULATED:' : '✕ BOUNCED / CUT:'}</strong>{' '}
                  {simRes.reason}
                </div>
              )}
            </div>
          );
        })}

        {/* UNOCCUPIED HOME CENTERS (BUILDS) */}
        {isAdjustmentPhase && buildHomes.length > 0 && (
          <div style={{ marginTop: '16px', marginBottom: '16px' }}>
            <div className="macro-list-header">
              <span>UNOCCUPIED HOME CENTERS (BUILDS)</span>
              <span className="macro-hint">
                Up to {buildCount} build{buildCount > 1 ? 's' : ''} available
              </span>
            </div>
            {buildHomes.map((homeProv) => {
              const bId = `BUILD_${activePower}_${homeProv}`;
              const buildOrder = orders[bId];
              const pInfo = provinces[homeProv];
              const isArmy =
                buildOrder?.unit_type === 'A' &&
                (buildOrder?.order_type === 'BUILD' || !buildOrder);
              const isFleet =
                buildOrder?.unit_type === 'F' && buildOrder?.order_type === 'BUILD';
              const isWaived = buildOrder?.order_type === 'WAIVE';

              return (
                <div
                  key={homeProv}
                  className="unit-macro-card"
                  style={{ borderLeft: '4px solid #16a34a' }}
                >
                  <div className="unit-card-header">
                    <div className="unit-identity">
                      <span
                        className="unit-type-badge army"
                        style={{ backgroundColor: '#16a34a' }}
                      >
                        +
                      </span>
                      <span className="unit-location-label">
                        <strong>{pInfo?.name || homeProv}</strong> ({homeProv})
                      </span>
                    </div>
                    <span
                      className="unit-order-badge"
                      style={{
                        backgroundColor: isWaived ? '#64748b' : '#16a34a',
                      }}
                    >
                      {isWaived ? 'WAIVED' : `BUILD ${buildOrder?.unit_type || 'A'}`}
                    </span>
                  </div>
                  <div className="order-type-tabs" style={{ marginTop: '8px' }}>
                    <button
                      className={`tab-btn ${isArmy && !isWaived ? 'tab-active' : ''}`}
                      onClick={() =>
                        onUpdateOrder({
                          unit_id: bId,
                          power: activePower,
                          unit_type: 'A',
                          origin: homeProv,
                          order_type: 'BUILD',
                          via_convoy: false,
                          is_explicit: true,
                        })
                      }
                    >
                      Build Army
                    </button>
                    {pInfo?.type === 'COAST' && (
                      <button
                        className={`tab-btn ${isFleet ? 'tab-active' : ''}`}
                        onClick={() =>
                          onUpdateOrder({
                            unit_id: bId,
                            power: activePower,
                            unit_type: 'F',
                            origin: homeProv,
                            origin_coast: pInfo?.coasts?.[0] || null,
                            order_type: 'BUILD',
                            via_convoy: false,
                            is_explicit: true,
                          })
                        }
                      >
                        Build Fleet
                      </button>
                    )}
                    <button
                      className={`tab-btn ${isWaived ? 'tab-active' : ''}`}
                      onClick={() =>
                        onUpdateOrder({
                          unit_id: bId,
                          power: activePower,
                          unit_type: 'A',
                          origin: homeProv,
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
              );
            })}
          </div>
        )}

        {/* 4. SANDBOX / PRE-MOVE FOREIGN UNITS SECTION */}
        <div className={`sandbox-panel-card ${sandboxMode ? 'sandbox-card-active' : ''}`}>
          <div className="sandbox-header-row">
            <div className="sandbox-title">
              <FlaskConical size={15} />
              <span>Sandbox &amp; Pre-Move Testing</span>
            </div>
            <button
              className={`sandbox-toggle-pill ${sandboxMode ? 'active' : ''}`}
              onClick={onToggleSandboxMode}
            >
              {sandboxMode ? 'Exit Sandbox (Clear Guesses)' : 'Enter Sandbox Mode'}
            </button>
          </div>
          <p className="sandbox-desc">
            {sandboxMode
              ? 'Sandbox Mode is ACTIVE: Click any foreign unit on the map to guess/plan what they might do. Exiting Sandbox discards all foreign guesses and restores your real view!'
              : `You are commanding ${powerMeta.shortName}. Enter Sandbox Mode to guess foreign moves and test what-if scenarios without affecting the real board.`}
          </p>

          {sandboxMode && isForeignUnitSelected && selectedUnit && (
            <div className="sandbox-selected-foreign-banner">
              <span>
                Guessing Foreign Move:{' '}
                <strong>
                  {POWER_METADATA[selectedUnit.power].shortName} {selectedUnit.unit_type}{' '}
                  {provinces[selectedUnit.province]?.name}
                </strong>
              </span>
              <button
                className="switch-power-mini-btn"
                onClick={() => onSelectPower(selectedUnit.power)}
              >
                Play as {POWER_METADATA[selectedUnit.power].shortName}
              </button>
            </div>
          )}

          {sandboxMode && foreignModifiedOrders.length > 0 && (
            <div className="foreign-orders-mini-list">
              <div className="foreign-list-header-row">
                <span className="foreign-list-label">
                  Hypothetical Foreign Moves ({foreignModifiedOrders.length}):
                </span>
                <button
                  className="clear-foreign-btn"
                  onClick={onClearForeignPreMoves}
                  title="Reset all foreign units back to Hold"
                >
                  <Trash2 size={11} /> Clear All
                </button>
              </div>
              {foreignModifiedOrders.map(({ unit, order }) => {
                const sum = formatOrderSummary(order, provinces, unitsByProv);
                const fSim = simulationResult?.resolutions[unit.id];
                const fIssues = issuesByUnit[unit.id] || [];
                return (
                  <div
                    key={unit.id}
                    className={`foreign-order-chip ${
                      unit.id === selectedUnitId ? 'chip-selected' : ''
                    }`}
                    onClick={() => onSelectUnit(unit.id)}
                  >
                    <span
                      className="foreign-chip-dot"
                      style={{ backgroundColor: POWER_METADATA[unit.power].color }}
                    />
                    <div className="foreign-chip-main">
                      <div>
                        <strong>{POWER_METADATA[unit.power].shortName}:</strong> {sum.fullSymbolic}
                      </div>
                      {fSim && (
                        <div
                          className={`foreign-chip-sim ${
                            fSim.succeeded ? 'sim-pass' : 'sim-bounce'
                          }`}
                        >
                          {fSim.succeeded ? '✓ Advances' : '✕ Bounced'} — {fSim.reason}
                        </div>
                      )}
                      {fIssues.length > 0 && (
                        <div className="foreign-chip-warn">⚠ {fIssues[0].title}</div>
                      )}
                    </div>
                    <button
                      className="foreign-chip-reset"
                      title="Reset this unit to Hold"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateOrder({
                          unit_id: unit.id,
                          power: unit.power,
                          unit_type: unit.unit_type,
                          origin: unit.province,
                          origin_coast: unit.coast,
                          order_type: 'HOLD',
                          target: null,
                          target_coast: null,
                          aux_unit_origin: null,
                          via_convoy: false,
                          is_explicit: false,
                        });
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {sandboxMode ? (
            <div className="sandbox-action-buttons-row">
              <button className="simulate-outcome-btn" onClick={onToggleSandboxMode}>
                <FlaskConical size={14} />
                <span>Done Planning — Exit Sandbox</span>
              </button>
              <button
                className="sandbox-step-turn-btn"
                onClick={onAdjudicateTurn}
                title="Step forward to the next season in Sandbox to plan follow-up turns"
              >
                <Play size={13} />
                <span>Step Turn Forward</span>
              </button>
            </div>
          ) : (
            <div className="sandbox-action-buttons-row">
              <button className="simulate-outcome-btn" onClick={onToggleSandboxMode}>
                <FlaskConical size={14} />
                <span>Open Pre-Move Sandbox (Plan &amp; Test Guesses)</span>
              </button>
            </div>
          )}
        </div>
        {isGameCreator && onOpenAdminTools && (
          <div className="admin-sidebar-card">
            <div className="admin-sidebar-header">
              <div className="admin-sidebar-title">
                <ShieldAlert size={14} className="section-icon-crimson" />
                <span>Creator Admin Tools</span>
              </div>
              <span className="creator-badge">Creator</span>
            </div>
            <p className="admin-sidebar-desc">
              Arbitrarily edit state, roll back turns, move units anywhere, or spawn/destroy units.
            </p>
            <button
              type="button"
              className="admin-sidebar-open-btn"
              onClick={onOpenAdminTools}
            >
              <Sliders size={13} />
              <span>Open Creator Admin Console</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. STICKY FOOTER: FINALIZE ORDERS & ADJUDICATE TURN */}
      <div className="sidebar-footer-actions">
        {!isFinalized ? (
          <button
            className={`finalize-primary-btn ${
              myIssues.length > 0 ? 'has-warning-state' : ''
            }`}
            onClick={onFinalizeClick}
          >
            {myIssues.length > 0 ? (
              <>
                <AlertTriangle size={16} />
                <span>
                  Finalize {powerMeta.shortName} Orders ({myIssues.length} Warning
                  {myIssues.length > 1 ? 's' : ''})
                </span>
              </>
            ) : (
              <>
                <Lock size={16} />
                <span>
                  Finalize {powerMeta.shortName} Orders
                  {unconfirmedCount > 0 ? ` (${unconfirmedCount} Unconfirmed)` : ''}
                </span>
              </>
            )}
          </button>
        ) : (
          <button className="unfinalize-btn" onClick={onUnfinalizeClick}>
            <Unlock size={16} />
            <span>Orders Finalized — Click to Unlock &amp; Edit</span>
          </button>
        )}

        <button
          className="adjudicate-turn-btn"
          title="Execute turn adjudication and advance to the next season"
          onClick={onAdjudicateTurn}
        >
          <Play size={15} />
          <span>
            {isAdjustmentPhase
              ? 'Resolve Adjustments & Advance to Spring'
              : phase === 'Retreats'
              ? 'Resolve Retreats & Advance'
              : 'Resolve Phase'}
          </span>
        </button>
      </div>
    </aside>
  );
};
