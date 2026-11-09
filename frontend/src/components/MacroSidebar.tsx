import {
  AlertCircle,
  AlertTriangle,
  Anchor,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Crosshair,
  Flag,
  Lock,
  MoveRight,
  PanelRightClose,
  PanelRightOpen,
  Play,
  PlusCircle,
  Shield,
  Swords,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import {
  type GameParticipant,
  type Order,
  type OrderType,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type SimulationResult,
  type Unit,
  type ValidationIssue,
} from '../types/diplomacy';
import {
  canUnitSupportInto,
  formatOrderSummary,
  getConsensusStatusInfo,
  getReachableDestinations,
  getValidRetreatDestinations,
} from '../utils/orderHelpers';
import type { SheetSnap } from '../utils/sheetHelpers';
import { BottomSheet } from './BottomSheet';
import { VersionBadge } from './VersionBadge';

export interface MacroSidebarProps {
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
  gameOver?: boolean;
  onOpenAdminTools?: () => void;
  adminOverrideActive?: boolean;
  onSelectPower?: (power: Power) => void;
  onToggleSandboxMode?: () => void;
  onSelectUnit: (unitId: string | null) => void;
  onHoverUnit: (unitId: string | null) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onUpdateOrder: (order: Order) => void;
  onConfirmAllHolds: () => void;
  onClearForeignPreMoves?: () => void;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onSimulatePreMoves?: () => void;
  onAdjudicateTurn: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  onSurrenderClick?: () => void;
  surrenderedPowers?: Power[];
  onGenerateAIMoves?: (powers?: Power[], includeActive?: boolean) => void;
  onAIStepTurn?: () => void;
  participants?: Record<string, GameParticipant>;
  lobbyStatus?: string;
  // Collapsible Props
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * 'panel' is the desktop sidebar. 'sheet' is the phone's pull-up order sheet, which shows the
   * power, Confirm All and Finalize at its peek and the unit cards when pulled up.
   */
  variant?: 'panel' | 'sheet';
  sheetSnap?: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
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
  gameOver = false,
  onSelectUnit,
  onHoverUnit,
  onHighlightProvinces,
  onUpdateOrder,
  onConfirmAllHolds,
  onFinalizeClick,
  onUnfinalizeClick,
  onAdjudicateTurn,
  onSurrenderClick,
  participants,
  lobbyStatus,
  collapsed = false,
  onToggleCollapse,
  variant = 'panel',
  sheetSnap = 'peek',
  onSheetSnapChange,
}) => {
  const powerMeta = POWER_METADATA[activePower];
  const isFinalized = finalizedPowers.includes(activePower);
  const isSurrendered = surrenderedPowers.includes(activePower);

  const unitsByProv: Record<string, Unit> = {};
  const unitsById: Record<string, Unit> = {};
  for (const u of units) {
    if (!u.is_dislodged) {
      unitsByProv[u.province] = u;
    }
    unitsById[u.id] = u;
  }

  const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
  const isRetreatPhase = phase === 'Retreats';

  const requiredPowersInMatch = useMemo(() => {
    if (!isMultiplayer || !participants) return [];
    const activeParticipants = Object.values(participants).filter(
      (p) => !p.surrendered && !surrenderedPowers.includes(p.power),
    );
    if (activeParticipants.length === 0) return [];

    if (isAdjustmentPhase) {
      if (!builds) return activeParticipants.map((p) => p.power);
      return activeParticipants
        .filter((p) => {
          const b = builds[p.power];
          // A power owed builds with every home center occupied has no decision to make.
          return (
            b &&
            typeof b === 'object' &&
            (b.count < 0 || (b.count > 0 && b.homes.length > 0))
          );
        })
        .map((p) => p.power);
    }

    if (isRetreatPhase) {
      const dislodgedPowers = new Set(
        units.filter((u) => u.is_dislodged).map((u) => u.power),
      );
      if (retreats) {
        Object.keys(retreats).forEach((pStr) => {
          if (
            retreats[pStr as Power] &&
            Object.keys(retreats[pStr as Power]).length > 0
          ) {
            dislodgedPowers.add(pStr as Power);
          }
        });
      }
      return activeParticipants
        .filter((p) => dislodgedPowers.has(p.power))
        .map((p) => p.power);
    }

    const powersWithUnits = new Set(units.map((u) => u.power));
    return activeParticipants
      .filter((p) => powersWithUnits.has(p.power))
      .map((p) => p.power);
  }, [
    isMultiplayer,
    participants,
    surrenderedPowers,
    isAdjustmentPhase,
    isRetreatPhase,
    builds,
    retreats,
    units,
  ]);

  const _requiredFinalizedCount = requiredPowersInMatch.filter((p) =>
    finalizedPowers.includes(p),
  ).length;
  const _totalRequiredCount = requiredPowersInMatch.length;
  const _missingPowers = requiredPowersInMatch.filter(
    (p) => !finalizedPowers.includes(p),
  );

  const consensusInfo = useMemo(
    () =>
      getConsensusStatusInfo({
        isMultiplayer,
        lobbyStatus,
        participants,
        surrenderedPowers,
        requiredPowers: requiredPowersInMatch,
        finalizedPowers,
        isGameCreator,
        gameOver,
      }),
    [
      isMultiplayer,
      lobbyStatus,
      participants,
      surrenderedPowers,
      requiredPowersInMatch,
      finalizedPowers,
      isGameCreator,
      gameOver,
    ],
  );

  const rawMyUnits = units.filter((u) => u.power === activePower);
  const myUnits = isRetreatPhase
    ? [...rawMyUnits].sort(
        (a, b) =>
          Number(Boolean(b.is_dislodged)) - Number(Boolean(a.is_dislodged)),
      )
    : rawMyUnits;
  const myDislodgedUnits = myUnits.filter((u) => u.is_dislodged);
  const myActiveFieldUnits = myUnits.filter((u) => !u.is_dislodged);

  const myIssues = issues.filter((i) => i.power === activePower);

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

  const myBuildInfo = builds ? builds[activePower] : undefined;
  const buildCount =
    myBuildInfo !== undefined
      ? myBuildInfo.count
      : scCountByPower[activePower] - myActiveFieldUnits.length;
  const buildHomes =
    myBuildInfo !== undefined
      ? myBuildInfo.homes
      : Object.values(provinces)
          .filter(
            (p) =>
              p.home_power === activePower &&
              p.is_supply_center &&
              ownership[p.id] === activePower &&
              !unitsByProv[p.id],
          )
          .map((p) => p.id);

  const maxAllowedBuilds =
    buildCount > 0 ? Math.min(buildCount, buildHomes.length) : 0;
  const assignedBuildsCount = buildHomes.filter(
    (h) => orders[`BUILD_${activePower}_${h}`]?.order_type === 'BUILD',
  ).length;
  const neededDisbands = buildCount < 0 ? Math.abs(buildCount) : 0;
  const assignedDisbandsCount = myUnits.filter(
    (u) => orders[u.id]?.order_type === 'DISBAND',
  ).length;

  const issuesByUnit: Record<string, ValidationIssue[]> = {};
  for (const iss of issues) {
    for (const uid of iss.unit_ids) {
      if (!issuesByUnit[uid]) issuesByUnit[uid] = [];
      issuesByUnit[uid].push(iss);
    }
  }

  // Compute confirmed / total actionable orders depending on current phase
  let totalActionableCount = myUnits.length;
  let confirmedCount = myUnits.filter((u) => orders[u.id]?.is_explicit).length;

  if (isRetreatPhase) {
    totalActionableCount = myDislodgedUnits.length;
    confirmedCount = myDislodgedUnits.filter(
      (u) => orders[u.id]?.is_explicit,
    ).length;
  } else if (isAdjustmentPhase) {
    if (buildCount > 0 && buildHomes.length > 0) {
      totalActionableCount = maxAllowedBuilds;
      const explicitBuilds = buildHomes.filter(
        (h) => orders[`BUILD_${activePower}_${h}`]?.is_explicit,
      ).length;
      confirmedCount = Math.min(maxAllowedBuilds, explicitBuilds);
    } else if (buildCount < 0) {
      totalActionableCount = neededDisbands;
      confirmedCount = Math.min(neededDisbands, assignedDisbandsCount);
    } else {
      totalActionableCount = 0;
      confirmedCount = 0;
    }
  }

  const unconfirmedCount = Math.max(0, totalActionableCount - confirmedCount);
  const simActive = showSimulationOverlay || sandboxMode;

  const handleOrderTypeChange = (unit: Unit, newType: OrderType) => {
    if (newType === 'RETREAT') {
      const validRetreats = getValidRetreatDestinations(
        unit,
        retreats,
        provinces,
      );
      const firstRet = validRetreats[0];
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'RETREAT',
        target: firstRet ? firstRet.province : null,
        target_coast:
          firstRet && firstRet.coasts.length === 1 ? firstRet.coasts[0] : null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
      return;
    }

    if (newType === 'DISBAND') {
      onUpdateOrder({
        unit_id: unit.id,
        power: unit.power,
        unit_type: unit.unit_type,
        origin: unit.province,
        origin_coast: unit.coast,
        order_type: 'DISBAND',
        target: null,
        target_coast: null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
      return;
    }

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
        target_coast:
          firstDest && firstDest.coasts.length === 1
            ? firstDest.coasts[0]
            : null,
        aux_unit_origin: null,
        via_convoy: false,
        is_explicit: true,
      });
    } else if (newType === 'SUPPORT') {
      const otherUnits = units.filter(
        (other) => other.id !== unit.id && !other.is_dislodged,
      );
      const defaultSup =
        otherUnits.find(
          (other) =>
            other.power === unit.power &&
            (canUnitSupportInto(unit, other.province, provinces) ||
              (orders[other.id]?.target &&
                canUnitSupportInto(unit, orders[other.id].target!, provinces))),
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
      const armies = units.filter(
        (u2) => u2.unit_type === 'A' && !u2.is_dislodged,
      );
      const firstArmy = armies.find((a) => a.power === unit.power) || armies[0];
      const coastalProvs = Object.values(provinces).filter(
        (p) => p.type === 'COAST',
      );
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

  // Phone: a finger has no hover, so the selected unit's card lights up its provinces instead,
  // the way hovering a card does on desktop.
  const isSheet = variant === 'sheet';
  const selectedFieldUnit = selectedUnitId
    ? unitsById[selectedUnitId]
    : undefined;
  const selectedFieldOrder = selectedFieldUnit
    ? orders[selectedFieldUnit.id]
    : undefined;
  const selectedProvincesKey = selectedFieldUnit
    ? [
        selectedFieldUnit.province,
        selectedFieldOrder?.target,
        selectedFieldOrder?.aux_unit_origin,
      ]
        .filter(Boolean)
        .join(',')
    : '';
  useEffect(() => {
    if (!isSheet) return;
    onHighlightProvinces(
      selectedProvincesKey ? selectedProvincesKey.split(',') : [],
    );
  }, [isSheet, selectedProvincesKey, onHighlightProvinces]);

  // Phone: raising the sheet while a unit is selected brings its card to the top of the list.
  // Only the sheet's own list scrolls, never the page around it.
  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isSheet || sheetSnap === 'peek' || !selectedUnitId) return;
    const body = sheetBodyRef.current;
    const scroller = body?.closest<HTMLElement>('.bottom-sheet-body');
    const card = Array.from(
      body?.querySelectorAll<HTMLElement>(
        '[data-unit-id], [data-home-province]',
      ) ?? [],
    ).find(
      (el) =>
        el.dataset.unitId === selectedUnitId ||
        `BUILD_${activePower}_${el.dataset.homeProvince}` === selectedUnitId,
    );
    if (!scroller || !card) return;
    scroller.scrollTop +=
      card.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      8;
  }, [isSheet, sheetSnap, selectedUnitId, activePower]);

  // The pieces of the expanded panel. The desktop panel and the phone sheet arrange the same
  // pieces differently, so neither copies the other.
  const statusBadge = (
    <div className="power-status-badge-wrap">
      {isSurrendered ? (
        <span className="status-badge surrendered">
          <Flag size={11} /> Civil Disorder
        </span>
      ) : isFinalized ? (
        <span className="status-badge finalized">
          <Lock size={11} /> Finalized
        </span>
      ) : myIssues.length > 0 ? (
        <span className="status-badge has-warnings">
          <AlertTriangle size={11} /> {myIssues.length} Issue
          {myIssues.length > 1 ? 's' : ''}
        </span>
      ) : (
        <span className="status-badge drafting">Drafting</span>
      )}
    </div>
  );

  const confirmAllButton = (
    <button
      type="button"
      className="quick-action-btn"
      data-testid="btn-confirm-all"
      title="Mark all current orders as confirmed"
      onClick={onConfirmAllHolds}
    >
      <CheckCircle2 size={12} /> Confirm All ({confirmedCount}/
      {totalActionableCount})
    </button>
  );

  const surrenderButton =
    isMultiplayer && onSurrenderClick ? (
      <button
        type="button"
        className="quick-action-btn surrender-btn-sidebar"
        title="Surrender sovereign command and leave this campaign"
        onClick={onSurrenderClick}
      >
        <Flag size={12} /> Surrender
      </button>
    ) : null;

  const phaseContext = (
    <>
      {isAdjustmentPhase && (
        <div className="macro-phase-context-box adjustment">
          <strong>WINTER ADJUSTMENTS:</strong>{' '}
          {buildCount > 0 && buildHomes.length > 0
            ? `Build up to ${maxAllowedBuilds} unit${maxAllowedBuilds > 1 ? 's' : ''} in open home centers (${assignedBuildsCount}/${maxAllowedBuilds} assigned).`
            : buildCount > 0 && buildHomes.length === 0
              ? `+${buildCount} surplus, but home centers are occupied.`
              : buildCount < 0
                ? `Disband ${neededDisbands} unit${neededDisbands > 1 ? 's' : ''} (${assignedDisbandsCount}/${neededDisbands} selected).`
                : `Forces in equilibrium (${myActiveFieldUnits.length} units = ${scCountByPower[activePower]} SCs).`}
        </div>
      )}

      {isRetreatPhase && (
        <div className="macro-phase-context-box retreat">
          <strong>RETREAT PHASE:</strong>{' '}
          {myDislodgedUnits.length > 0
            ? `${myDislodgedUnits.length} dislodged unit${myDislodgedUnits.length > 1 ? 's' : ''} must Retreat or Disband.`
            : 'No dislodged units. Awaiting other powers.'}
        </div>
      )}
    </>
  );

  // Everything inside the scrolling list of builds and unit cards.
  const unitList = (
    <>
      {/* Winter Builds */}
      {isAdjustmentPhase && buildCount > 0 && buildHomes.length > 0 && (
        <div className="macro-builds-wrapper">
          <div className="macro-list-header">
            <span>
              HOME BUILDS ({assignedBuildsCount}/{maxAllowedBuilds} ASSIGNED)
            </span>
            <span className="macro-hint">
              {isSheet ? 'Tap a card or the map' : 'Click card or map'}
            </span>
          </div>
          {buildHomes.map((homeProv) => {
            const bId = `BUILD_${activePower}_${homeProv}`;
            const buildOrder = orders[bId];
            const pInfo = provinces[homeProv];
            const isWaived = buildOrder?.order_type === 'WAIVE';
            const isArmy =
              !isWaived && (buildOrder?.unit_type === 'A' || !buildOrder);
            const isFleet = !isWaived && buildOrder?.unit_type === 'F';
            const activeCoast =
              buildOrder?.origin_coast || buildOrder?.target_coast || null;
            const isSelected = selectedUnitId === bId;
            const summary = formatOrderSummary(
              buildOrder,
              provinces,
              unitsByProv,
            );

            return (
              <div
                key={homeProv}
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
                  <span className="behavior-target-text">
                    {summary.targetText}
                  </span>
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
                          const isThisCoastFleet =
                            isFleet && activeCoast === cst;
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
          })}
        </div>
      )}

      <div className="macro-list-header">
        <span>
          {isAdjustmentPhase && buildCount < 0
            ? `DISBAND UNITS (${assignedDisbandsCount}/${neededDisbands} SELECTED)`
            : `ACTIVE FORCE ORDERS (${myUnits.length} UNITS)`}
        </span>
        <span className="macro-hint">
          {isSheet ? 'Tap a card or the map' : 'Click card or map'}
        </span>
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
        const validRetreats = unit.is_dislodged
          ? getValidRetreatDestinations(unit, retreats, provinces)
          : [];
        const simRes = simActive
          ? simulationResult?.resolutions[unit.id]
          : null;
        const isDisbanding = order?.order_type === 'DISBAND';

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
              // A finger has no hover: on touch the highlight would stick until the next tap.
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
                ) : isAdjustmentPhase ||
                  (isRetreatPhase && !unit.is_dislodged) ? (
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

                    {order?.order_type === 'RETREAT' &&
                      validRetreats.length > 0 && (
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
                              if (
                                r.coasts.length > 0 &&
                                unit.unit_type === 'F'
                              ) {
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
                        {unit.unit_type === 'A' && (
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
                            const supOrd = supUnit
                              ? orders[supUnit.id]
                              : undefined;
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
                            .filter(
                              (u2) => u2.id !== unit.id && !u2.is_dislodged,
                            )
                            .map((u2) => (
                              <option key={u2.id} value={u2.province}>
                                [{POWER_METADATA[u2.power].shortName}]{' '}
                                {u2.unit_type} {provinces[u2.province]?.name} (
                                {u2.province})
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
                              .filter(
                                (r) => r.province !== order.aux_unit_origin,
                              )
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
                            .filter(
                              (u2) => u2.unit_type === 'A' && !u2.is_dislodged,
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
                </>
              )}
            </div>

            {/* Diagnostic Alerts */}
            {unitIssues.map((iss) => (
              <div
                key={iss.id}
                className={`unit-diagnostic-alert ${iss.severity}`}
              >
                <AlertTriangle size={13} className="diag-icon" />
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
      })}
    </>
  );

  // Finalize or unlock, then Resolve or the multiplayer consensus card.
  const footerActions = (
    <>
      {!isFinalized ? (
        <button
          type="button"
          data-testid="btn-finalize-orders"
          className={`finalize-primary-btn ${
            myIssues.length > 0 ? 'has-warning-state' : ''
          }`}
          onClick={onFinalizeClick}
        >
          {myIssues.length > 0 ? (
            <>
              <AlertTriangle size={15} />
              <span>
                Finalize {powerMeta.shortName} ({myIssues.length} Warning
                {myIssues.length > 1 ? 's' : ''})
              </span>
            </>
          ) : (
            <>
              <Lock size={15} />
              <span>
                Finalize {powerMeta.shortName} Orders
                {unconfirmedCount > 0
                  ? ` (${unconfirmedCount} Unconfirmed)`
                  : ''}
              </span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          data-testid="btn-unfinalize-orders"
          className="unfinalize-btn"
          onClick={onUnfinalizeClick}
        >
          <Unlock size={15} />
          <span>Orders Finalized — Click to Unlock</span>
        </button>
      )}

      {!isMultiplayer ? (
        <button
          type="button"
          data-testid="btn-adjudicate-phase"
          className="adjudicate-turn-btn"
          title="Execute turn adjudication and advance to the next season"
          onClick={onAdjudicateTurn}
          disabled={gameOver}
        >
          <Play size={14} />
          <span>
            {gameOver
              ? 'Game Over'
              : isAdjustmentPhase
                ? 'Resolve Adjustments & Advance'
                : isRetreatPhase
                  ? 'Resolve Retreats & Advance'
                  : 'Resolve Phase'}
          </span>
        </button>
      ) : (
        <div className="mp-resolution-controls">
          <div
            className={`mp-consensus-status-card ${consensusInfo.isWaitingForPlayers ? 'waiting-mode' : ''}`}
          >
            <div className="mp-consensus-header">
              {consensusInfo.isWaitingForPlayers ? (
                <Users size={14} className="consensus-icon" />
              ) : (
                <Clock size={13} className="consensus-icon" />
              )}
              <span className="consensus-title">{consensusInfo.title}</span>
            </div>
            <div className="mp-consensus-desc">{consensusInfo.description}</div>
          </div>

          {isGameCreator && (
            <button
              type="button"
              className={`adjudicate-turn-btn creator-override-btn ${
                consensusInfo.isSoloAdvanceReady ? 'solo-advance-ready' : ''
              }`}
              title={consensusInfo.buttonTitle}
              onClick={onAdjudicateTurn}
              disabled={gameOver}
            >
              <Play size={14} />
              <span>{consensusInfo.buttonLabel}</span>
            </button>
          )}
        </div>
      )}
    </>
  );

  // Phone: the same pieces in a pull-up sheet. The peek holds what a player needs every turn,
  // and spells out the counts the desktop rail only gives in tooltips.
  if (variant === 'sheet') {
    return (
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={(snap) => onSheetSnapChange?.(snap)}
        label="Orders"
        testId="macro-sidebar"
        peek={
          <div
            className="macro-sheet-peek"
            style={{ borderLeftColor: powerMeta.color }}
          >
            <div className="macro-sheet-status-row">
              <span className="power-crest-icon">{powerMeta.crest}</span>
              <div className="macro-sheet-power">
                <span className="power-name-text">{powerMeta.shortName}</span>
                <span
                  className="macro-sheet-counts"
                  data-testid="macro-sheet-counts"
                >
                  {myActiveFieldUnits.length} units ·{' '}
                  {scCountByPower[activePower]} SCs
                  {unconfirmedCount > 0
                    ? ` · ${unconfirmedCount} unconfirmed`
                    : ''}
                </span>
              </div>
              {statusBadge}
            </div>
            <div className="macro-sheet-controls">
              {confirmAllButton}
              {footerActions}
            </div>
          </div>
        }
      >
        <div className="macro-sheet-body" ref={sheetBodyRef}>
          {phaseContext}
          <div className="macro-units-scroll-area">{unitList}</div>
          {surrenderButton && (
            <div className="macro-sheet-surrender">{surrenderButton}</div>
          )}
          <div className="sidebar-version-footer">
            <VersionBadge />
          </div>
        </div>
      </BottomSheet>
    );
  }

  // Collapsed Rail View
  if (collapsed) {
    return (
      <aside
        className="macro-sidebar macro-sidebar-collapsed"
        aria-label="Tactical Orders Collapsed"
      >
        {onToggleCollapse && (
          <button
            type="button"
            data-testid="macro-sidebar-expand-btn"
            className="sidebar-rail-btn rail-toggle-btn"
            onClick={onToggleCollapse}
            title="Expand Tactical Command & Orders"
          >
            <PanelRightOpen size={16} />
          </button>
        )}

        <div className="rail-divider" />

        <div
          className="rail-power-crest"
          title={`Commanding ${powerMeta.name} (${myActiveFieldUnits.length} Units, ${scCountByPower[activePower]} SC)`}
          style={{ borderColor: powerMeta.color }}
        >
          <span>{powerMeta.crest}</span>
        </div>

        <div
          className="rail-counter-badge"
          title={`${unconfirmedCount} unconfirmed orders`}
        >
          {unconfirmedCount > 0 ? (
            <span className="rail-badge-unconfirmed">{unconfirmedCount}</span>
          ) : (
            <span className="rail-badge-clean">✓</span>
          )}
        </div>

        {myIssues.length > 0 && (
          <div
            className="rail-warn-badge"
            title={`${myIssues.length} tactical issues`}
          >
            <AlertTriangle size={14} />
          </div>
        )}

        <div className="rail-spacer" />

        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-rail-btn rail-expand-chevron"
            onClick={onToggleCollapse}
            title="Expand Tactical Orders"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </aside>
    );
  }

  // Expanded Core-Gameplay Sidebar
  return (
    <aside
      className="macro-sidebar macro-sidebar-expanded"
      data-testid="macro-sidebar"
      aria-label="Tactical Command & Orders"
    >
      {/* 1. ACTIVE POWER HEADER & TELEMETRY */}
      <div
        className="active-power-banner"
        style={{ borderLeft: `4px solid ${powerMeta.color}` }}
      >
        <div className="power-banner-top">
          <div className="power-banner-main-col">
            <div className="power-banner-title">
              <span className="power-crest-icon">{powerMeta.crest}</span>
              <span className="power-name-text">{powerMeta.name}</span>
            </div>
            <div className="power-banner-sub">
              {myActiveFieldUnits.length} Units
              {myDislodgedUnits.length > 0
                ? ` (+${myDislodgedUnits.length} Dislodged)`
                : ''}{' '}
              • {scCountByPower[activePower]} SCs
            </div>
          </div>

          <div className="power-banner-actions-right">
            {statusBadge}

            {onToggleCollapse && (
              <button
                type="button"
                data-testid="macro-sidebar-collapse-btn"
                className="sidebar-collapse-toggle-btn"
                onClick={onToggleCollapse}
                title="Collapse Tactical Orders"
              >
                <PanelRightClose size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Quick Command Bar */}
        <div className="macro-quick-actions">
          {confirmAllButton}
          {surrenderButton}
        </div>

        {phaseContext}
      </div>

      {/* 2. UNIT ORDERS LIST (BUILDS + FIELD UNITS) */}
      <div className="macro-units-scroll-area">{unitList}</div>

      {/* 3. STICKY FOOTER: FINALIZE & ADJUDICATE */}
      <div className="sidebar-footer-actions">{footerActions}</div>
      <div className="sidebar-version-footer">
        <VersionBadge />
      </div>
    </aside>
  );
};
