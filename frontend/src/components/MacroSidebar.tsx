import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type GameParticipant,
  type Order,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type SimulationResult,
  type Unit,
  type UnitMoveOptions,
  type ValidationIssue,
} from '../types/diplomacy';
import { getConsensusStatusInfo } from '../utils/orderHelpers';
import {
  computeOrderProgress,
  getRequiredPowers,
} from '../utils/orderProgress';
import type { SheetSnap } from '../utils/sheetHelpers';
import { BottomSheet } from './BottomSheet';
import type { DirectEditMapHandlers } from './EuropeMap';
import styles from './MacroSidebar.module.css';
import { AdminDirectEditSidebar } from './macro/AdminDirectEditSidebar';
import {
  type AdminTurnClockSettings,
  AdminTurnClockSidebar,
} from './macro/AdminTurnClockSidebar';
import { CollapsedRail } from './macro/CollapsedRail';
import {
  ConfirmAllButton,
  OrderFooter,
  SurrenderButton,
} from './macro/OrderFooter';
import { HistoryLockBar, PhaseContext, PowerHeader } from './macro/PowerHeader';
import { UnitOrderList } from './macro/UnitOrderList';
import { useSheetSelection } from './macro/useSheetSelection';
import chromeStyles from './SidebarChrome.module.css';
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
  unitOptions?: Record<string, UnitMoveOptions> | null;
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
  /**
   * Set while the map shows a past turn, e.g. "Fall 1901 Movement". The orders are dimmed and
   * inert under a bar that leads back to the live turn, so nothing is edited out of sight.
   */
  historyLabel?: string | null;
  onReturnToLive?: () => void;
  /** Repurposes the right sidebar into the Edit Board Inspector. */
  directEditActive?: boolean;
  directEdit?: DirectEditMapHandlers;
  /** Repurposes the right sidebar into the Turn and Clock Settings panel. */
  turnClockSettings?: AdminTurnClockSettings;
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
  unitOptions = null,
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
  historyLabel = null,
  onReturnToLive,
  directEditActive = false,
  directEdit,
  turnClockSettings,
}) => {
  const powerMeta = POWER_METADATA[activePower];
  const isFinalized = finalizedPowers.includes(activePower);
  const isSurrendered = surrenderedPowers.includes(activePower);

  const isAdjustmentPhase = phase === 'Adjustments' || season === 'Winter';
  const isRetreatPhase = phase === 'Retreats';

  const requiredPowersInMatch = useMemo(
    () =>
      getRequiredPowers({
        isMultiplayer,
        participants,
        surrenderedPowers,
        isAdjustmentPhase,
        isRetreatPhase,
        builds,
        retreats,
        units,
      }),
    [
      isMultiplayer,
      participants,
      surrenderedPowers,
      isAdjustmentPhase,
      isRetreatPhase,
      builds,
      retreats,
      units,
    ],
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

  const progress = computeOrderProgress({
    units,
    orders,
    ownership,
    provinces,
    activePower,
    issues,
    builds,
    isAdjustmentPhase,
    isRetreatPhase,
  });
  const {
    myBlockingIssues,
    unconfirmedCount,
    confirmedCount,
    totalActionableCount,
  } = progress;

  const isSheet = variant === 'sheet';
  const [compactOrders, setCompactOrders] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage.getItem('sloplomacy_compact_orders') === '1'
      );
    } catch {
      return false;
    }
  });

  const handleToggleCompactOrders = () => {
    setCompactOrders((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          'sloplomacy_compact_orders',
          next ? '1' : '0',
        );
      } catch {
        // Ignore storage failures in restricted contexts.
      }
      return next;
    });
  };

  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSheet || collapsed || !selectedUnitId) return;
    const scroller = panelScrollRef.current;
    if (!scroller) return;
    const card = Array.from(
      scroller.querySelectorAll<HTMLElement>(
        '[data-unit-id], [data-home-province]',
      ),
    ).find(
      (el) =>
        el.dataset.unitId === selectedUnitId ||
        `BUILD_${activePower}_${el.dataset.homeProvince}` === selectedUnitId,
    );
    if (!card) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.top < scrollerRect.top) {
      scroller.scrollTop += cardRect.top - scrollerRect.top - 8;
    } else if (cardRect.bottom > scrollerRect.bottom) {
      scroller.scrollTop += cardRect.bottom - scrollerRect.bottom + 8;
    }
  }, [isSheet, collapsed, selectedUnitId, activePower]);

  const sheetBodyRef = useSheetSelection({
    isSheet,
    sheetSnap,
    selectedUnitId,
    activePower,
    units,
    orders,
    onHighlightProvinces,
  });

  // The pieces of the expanded panel. The desktop panel and the phone sheet arrange the same
  // pieces differently, so neither copies the other.
  const confirmAllButton = (
    <ConfirmAllButton
      confirmedCount={confirmedCount}
      totalActionableCount={totalActionableCount}
      onConfirmAllHolds={onConfirmAllHolds}
    />
  );

  const surrenderButton =
    isMultiplayer && onSurrenderClick ? (
      <SurrenderButton onSurrenderClick={onSurrenderClick} />
    ) : null;

  const phaseContext = (
    <PhaseContext
      activePower={activePower}
      progress={progress}
      isAdjustmentPhase={isAdjustmentPhase}
      isRetreatPhase={isRetreatPhase}
    />
  );

  // Everything inside the scrolling list of builds and unit cards.
  const unitList = (
    <UnitOrderList
      activePower={activePower}
      powerMeta={powerMeta}
      progress={progress}
      provinces={provinces}
      units={units}
      orders={orders}
      retreats={retreats}
      unitOptions={unitOptions}
      selectedUnitId={selectedUnitId}
      hoveredUnitId={hoveredUnitId}
      simulationResult={simulationResult}
      simActive={showSimulationOverlay || sandboxMode}
      isAdjustmentPhase={isAdjustmentPhase}
      isRetreatPhase={isRetreatPhase}
      isSheet={isSheet}
      compactOrders={compactOrders}
      onToggleCompactOrders={handleToggleCompactOrders}
      onSelectUnit={onSelectUnit}
      onHoverUnit={onHoverUnit}
      onHighlightProvinces={onHighlightProvinces}
      onUpdateOrder={onUpdateOrder}
    />
  );

  // Finalize or unlock, then Resolve or the multiplayer consensus card.
  const footerActions = (
    <OrderFooter
      powerMeta={powerMeta}
      isFinalized={isFinalized}
      blockingIssueCount={myBlockingIssues.length}
      unconfirmedCount={unconfirmedCount}
      isMultiplayer={isMultiplayer}
      isGameCreator={isGameCreator}
      gameOver={gameOver}
      isAdjustmentPhase={isAdjustmentPhase}
      isRetreatPhase={isRetreatPhase}
      consensusInfo={consensusInfo}
      onFinalizeClick={onFinalizeClick}
      onUnfinalizeClick={onUnfinalizeClick}
      onAdjudicateTurn={onAdjudicateTurn}
    />
  );

  const locked = historyLabel !== null;
  const lockBar = locked && (
    <HistoryLockBar
      historyLabel={historyLabel}
      onReturnToLive={onReturnToLive}
    />
  );

  if (directEditActive && directEdit) {
    return (
      <AdminDirectEditSidebar
        variant={variant}
        sheetSnap={sheetSnap}
        onSheetSnapChange={onSheetSnapChange}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        provinces={provinces}
        orders={orders}
        ownership={ownership}
        activePower={activePower}
        progress={progress}
        directEdit={directEdit}
        onSelectUnit={onSelectUnit}
      />
    );
  }

  if (turnClockSettings?.isOpen) {
    return (
      <AdminTurnClockSidebar
        variant={variant}
        sheetSnap={sheetSnap}
        onSheetSnapChange={onSheetSnapChange}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        activePower={activePower}
        progress={progress}
        settings={turnClockSettings}
      />
    );
  }

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
            className={styles.macroSheetPeek}
            data-testid="macro-sheet-peek"
            data-history-locked={locked ? 'true' : undefined}
            style={{ borderLeftColor: powerMeta.color }}
          >
            {lockBar}
            <PowerHeader
              variant="sheet"
              activePower={activePower}
              progress={progress}
              isSurrendered={isSurrendered}
              isFinalized={isFinalized}
              locked={locked}
            />
            <div
              className={styles.macroSheetControls}
              data-testid="macro-sheet-controls"
              inert={locked || undefined}
            >
              {confirmAllButton}
              {footerActions}
            </div>
          </div>
        }
      >
        <div
          className={styles.macroSheetBody}
          data-testid="macro-sheet-body"
          data-history-locked={locked ? 'true' : undefined}
          ref={sheetBodyRef}
          inert={locked || undefined}
        >
          {phaseContext}
          <div
            className={styles.macroUnitsScrollArea}
            data-testid="macro-units-scroll-area"
          >
            {unitList}
          </div>
          {surrenderButton && (
            <div
              className={styles.macroSheetSurrender}
              data-testid="macro-sheet-surrender"
            >
              {surrenderButton}
            </div>
          )}
          <div className={chromeStyles.sidebarVersionFooter}>
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
        className={styles.macroSidebar}
        data-collapsed="true"
        data-testid="macro-sidebar-collapsed"
        aria-label="Tactical Orders Collapsed"
      >
        <CollapsedRail
          activePower={activePower}
          progress={progress}
          onToggleCollapse={onToggleCollapse}
        />
      </aside>
    );
  }

  // Expanded Core-Gameplay Sidebar
  return (
    <aside
      className={styles.macroSidebar}
      data-expanded="true"
      data-testid="macro-sidebar"
      data-history-locked={locked ? 'true' : undefined}
      aria-label="Tactical Command & Orders"
    >
      {lockBar}
      {/* 1. ACTIVE POWER HEADER & TELEMETRY */}
      <div
        inert={locked || undefined}
        className={styles.activePowerBanner}
        data-testid="active-power-banner"
        style={{ borderLeft: `4px solid ${powerMeta.color}` }}
      >
        <PowerHeader
          variant="panel"
          activePower={activePower}
          progress={progress}
          isSurrendered={isSurrendered}
          isFinalized={isFinalized}
          locked={locked}
          onToggleCollapse={onToggleCollapse}
        />

        {/* Quick Command Bar */}
        <div className={styles.macroQuickActions}>
          {confirmAllButton}
          {surrenderButton}
        </div>

        {phaseContext}
      </div>

      {/* 2. UNIT ORDERS LIST (BUILDS + FIELD UNITS) */}
      <div
        className={styles.macroUnitsScrollArea}
        data-testid="macro-units-scroll-area"
        ref={panelScrollRef}
        inert={locked || undefined}
      >
        {unitList}
      </div>

      {/* 3. STICKY FOOTER: FINALIZE & ADJUDICATE */}
      <div
        className={styles.sidebarFooterActions}
        data-testid="macro-footer-actions"
        inert={locked || undefined}
      >
        {footerActions}
      </div>
      <div className={chromeStyles.sidebarVersionFooter}>
        <VersionBadge />
      </div>
    </aside>
  );
};
