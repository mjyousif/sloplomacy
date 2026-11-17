import type React from 'react';
import { useMemo } from 'react';
import {
  type GameParticipant,
  type Order,
  POWER_METADATA,
  type Power,
  type ProvinceInfo,
  type SimulationResult,
  type TurnRecord,
  type Unit,
  type UnitMoveOptions,
  type ValidationIssue,
} from '../types/diplomacy';
import type { UiSpacing, UnitMark } from '../utils/displayPrefs';
import type { HistoryActionType } from '../utils/historyHelpers';
import { getConsensusStatusInfo } from '../utils/orderHelpers';
import {
  computeOrderProgress,
  getRequiredPowers,
} from '../utils/orderProgress';
import type { SheetSnap } from '../utils/sheetHelpers';
import type { DirectEditMapHandlers } from './EuropeMap';
import styles from './MacroSidebar.module.css';
import { AdminDirectEditSidebar } from './macro/AdminDirectEditSidebar';
import {
  type AdminTurnClockSettings,
  AdminTurnClockSidebar,
} from './macro/AdminTurnClockSidebar';
import { CollapsedRail } from './macro/CollapsedRail';
import {
  type HistoryHighlightFocus,
  HistoryTurnPanel,
} from './macro/HistoryTurnPanel';
import { MacroOrderSheet } from './macro/MacroOrderSheet';
import { ClearAllButton, OrderFooter } from './macro/OrderFooter';
import { HistoryLockBar, PhaseContext, PowerHeader } from './macro/PowerHeader';
import { UnitOrderList } from './macro/UnitOrderList';
import {
  useCompactOrders,
  usePanelScroll,
  useSheetSelection,
} from './macro/useSheetSelection';

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
  onClearAllOrders: () => void;
  onClearForeignPreMoves?: () => void;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onSimulatePreMoves?: () => void;
  onAdjudicateTurn: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  onSaveSandboxClick?: () => void;
  surrenderedPowers?: Power[];
  participants?: Record<string, GameParticipant>;
  lobbyStatus?: string;
  // Collapsible Props
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * 'panel' is the desktop sidebar. 'sheet' is the phone's pull-up order sheet, which shows the
   * power, Clear All and Finalize at its peek and the unit cards when pulled up.
   */
  variant?: 'panel' | 'sheet';
  sheetSnap?: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  /** Set when inspecting a resolved past turn record; replaces live controls with the turn log. */
  historyTurn?: TurnRecord | null;
  /** Selected nation filters for the past turn log. Empty shows all nations. */
  historyPowers?: readonly Power[];
  /** Selected movement action filters for a past Movement turn. Empty shows all actions. */
  historyActions?: readonly HistoryActionType[];
  /** Unit icon display setting so the history log matches the map's pieces. */
  unitMark?: UnitMark;
  /** UI spacing preference from Display Settings ('compact' | 'normal'). */
  uiSpacing?: UiSpacing;
  onToggleUiSpacing?: () => void;
  selectedHistoryOrderId?: string | null;
  onSelectHistoryPowers?: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
  onHoverHistoryOrder?: (focus: HistoryHighlightFocus | null) => void;
  onTogglePinHistoryOrder?: (focus: HistoryHighlightFocus) => void;
  /**
   * Set while the map shows a past turn or move suggestion. For move suggestions (no
   * `historyTurn`), the live orders stay dimmed and inert under a bar back to live.
   */
  historyLabel?: string | null;
  /** True when the viewed history entry is an admin board edit. */
  historyIsAdmin?: boolean;
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
  onClearAllOrders,
  onFinalizeClick,
  onUnfinalizeClick,
  onAdjudicateTurn,
  participants,
  lobbyStatus,
  collapsed = false,
  onToggleCollapse,
  variant = 'panel',
  sheetSnap = 'peek',
  onSheetSnapChange,
  historyTurn = null,
  historyPowers = [],
  historyActions = [],
  unitMark = 'icons',
  uiSpacing,
  onToggleUiSpacing,
  selectedHistoryOrderId = null,
  onSelectHistoryPowers,
  onSelectHistoryActions,
  onHoverHistoryOrder,
  onTogglePinHistoryOrder,
  historyLabel = null,
  historyIsAdmin = false,
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
  const { myBlockingIssues, unconfirmedCount } = progress;
  const isSheet = variant === 'sheet';
  const { compactOrders, handleToggleCompactOrders } = useCompactOrders({
    uiSpacing,
    onToggleUiSpacing,
  });

  const panelScrollRef = usePanelScroll({
    isSheet,
    collapsed,
    selectedUnitId,
    activePower,
  });

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
  const clearAllButton = isSurrendered ? null : (
    <ClearAllButton key={season + phase} onClearAllOrders={onClearAllOrders} />
  );

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
      isSurrendered={isSurrendered}
      blockingIssueCount={myBlockingIssues.length}
      unconfirmedCount={unconfirmedCount}
      isMultiplayer={isMultiplayer}
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
      historyIsAdmin={historyIsAdmin}
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

  // Collapsed Rail View (Desktop only; phone uses BottomSheet peek/snap)
  if (collapsed && variant !== 'sheet') {
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

  if (historyTurn) {
    return (
      <HistoryTurnPanel
        variant={variant}
        sheetSnap={sheetSnap}
        onSheetSnapChange={onSheetSnapChange}
        onToggleCollapse={onToggleCollapse}
        historyTurn={historyTurn}
        historyLabel={historyLabel ?? ''}
        historyIsAdmin={historyIsAdmin}
        historyPowers={historyPowers}
        historyActions={historyActions}
        unitMark={unitMark}
        provinces={provinces}
        selectedOrderId={selectedHistoryOrderId}
        compactOrders={compactOrders}
        onToggleCompactOrders={handleToggleCompactOrders}
        onSelectHistoryPowers={onSelectHistoryPowers}
        onSelectHistoryActions={onSelectHistoryActions}
        onHoverOrder={onHoverHistoryOrder}
        onTogglePinOrder={onTogglePinHistoryOrder}
      />
    );
  }

  // Phone: the same pieces in a pull-up sheet. The peek holds what a player needs every turn,
  // and spells out the counts the desktop rail only gives in tooltips.
  if (variant === 'sheet') {
    return (
      <MacroOrderSheet
        sheetSnap={sheetSnap}
        onSheetSnapChange={onSheetSnapChange}
        activePower={activePower}
        powerColor={powerMeta.color}
        progress={progress}
        isSurrendered={isSurrendered}
        isFinalized={isFinalized}
        locked={locked}
        lockBar={lockBar}
        clearAllButton={clearAllButton}
        footerActions={footerActions}
        phaseContext={phaseContext}
        unitList={unitList}
        sheetBodyRef={sheetBodyRef}
      />
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
        {clearAllButton && (
          <div className={styles.macroQuickActions}>{clearAllButton}</div>
        )}

        {phaseContext}
      </div>

      {/* 2. UNIT ORDERS LIST (BUILDS + FIELD UNITS) */}
      <div
        className={styles.macroUnitsScrollArea}
        data-testid="macro-units-scroll-area"
        ref={panelScrollRef}
        inert={locked || isSurrendered || undefined}
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
    </aside>
  );
};
