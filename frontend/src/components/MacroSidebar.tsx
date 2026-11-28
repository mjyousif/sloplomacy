import type React from 'react';
import { useMemo } from 'react';
import { POWER_METADATA } from '../types/diplomacy';
import { cx } from '../utils/cx';
import { isOpeningTurn } from '../utils/openings';
import { getConsensusStatusInfo } from '../utils/orderHelpers';
import {
  computeOrderProgress,
  getRequiredPowers,
} from '../utils/orderProgress';
import { turnLabel } from '../utils/turnFormat';
import styles from './MacroSidebar.module.css';
import { AdminDirectEditSidebar } from './macro/AdminDirectEditSidebar';
import { AdminTurnClockSidebar } from './macro/AdminTurnClockSidebar';
import { CollapsedRail } from './macro/CollapsedRail';
import { HistoryTurnPanel } from './macro/HistoryTurnPanel';
import { MacroSheet } from './macro/MacroSheet';
import type { MacroSidebarProps } from './macro/macroSidebarProps';
import { OpeningsButton, OpeningsList } from './macro/OpeningsList';
import { ClearAllButton, OrderFooter } from './macro/OrderFooter';
import { HistoryLockBar, PhaseContext, PowerHeader } from './macro/PowerHeader';
import { SpectatorBar } from './macro/SpectatorBar';
import { UnitOrderList } from './macro/UnitOrderList';
import { useCompactOrders } from './macro/useCompactOrders';
import { useOpeningsPanel } from './macro/useOpeningsPanel';
import { usePanelCardScroll } from './macro/usePanelCardScroll';
import scrollbarStyles from './ui/Scrollbars.module.css';
import chromeStyles from './ui/SidebarChrome.module.css';

export type { MacroSidebarProps } from './macro/macroSidebarProps';

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
  year = 0,
  builds = null,
  retreats = null,
  unitOptions = null,
  isMultiplayer = false,
  isGameCreator = false,
  gameOver = false,
  onSelectPower,
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
  onOpenPress,
  pressToggleRef,
  spectator,
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

  const computed = computeOrderProgress({
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
  // A spectator is sent every order masked, so nothing about them is "unconfirmed".
  const progress = spectator ? { ...computed, unconfirmedCount: 0 } : computed;
  const { myBlockingIssues, unconfirmedCount } = progress;
  const isSheet = variant === 'sheet';
  const { compactOrders, toggleCompactOrders: handleToggleCompactOrders } =
    useCompactOrders(uiSpacing, onToggleUiSpacing);

  const panelScrollRef = usePanelCardScroll({
    enabled: !isSheet && !collapsed,
    selectedUnitId,
    activePower,
  });

  // Book openings on the first turn, for a power the player orders (a past turn or a press
  // suggestion on the board hides them, since the cards are locked then, and so does a host
  // panel that replaces the order panel).
  const openings = useOpeningsPanel({
    available:
      isOpeningTurn({ season, year, phase }) &&
      !spectator &&
      !isSurrendered &&
      !gameOver &&
      historyLabel === null &&
      !directEditActive &&
      !turnClockSettings?.isOpen,
    power: activePower,
    units,
    turn: turnLabel({ season, year, phase }),
  });

  // The pieces of the expanded panel. The desktop panel and the phone sheet arrange the same
  // pieces differently, so neither copies the other.
  const clearAllButton =
    isSurrendered || spectator ? null : (
      <>
        <ClearAllButton
          key={season + phase}
          onClearAllOrders={onClearAllOrders}
        />
        {openings.available && <OpeningsButton panel={openings} />}
      </>
    );

  const phaseContext = (
    <PhaseContext
      activePower={activePower}
      progress={progress}
      isAdjustmentPhase={isAdjustmentPhase}
      isRetreatPhase={isRetreatPhase}
    />
  );

  // Everything inside the scrolling list of builds and unit cards, or the openings in its place.
  const unitList = openings.open ? (
    <OpeningsList panel={openings} power={activePower} />
  ) : (
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
      // A spectator gets the read-only rows: no order buttons that only look pressable.
      compactOrders={compactOrders || Boolean(spectator)}
      onToggleCompactOrders={spectator ? undefined : handleToggleCompactOrders}
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

  // A past turn, a move suggestion or watching without a seat: the live orders stay inert.
  const locked = historyLabel !== null || Boolean(spectator);
  const lockBar =
    historyLabel !== null ? (
      <HistoryLockBar
        historyLabel={historyLabel}
        historyIsAdmin={historyIsAdmin}
        onReturnToLive={onReturnToLive}
      />
    ) : (
      spectator && (
        <SpectatorBar
          controls={spectator}
          activePower={activePower}
          participants={participants}
          gameOver={gameOver}
          onSelectPower={onSelectPower}
        />
      )
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
        className={cx(chromeStyles.sidebarShell, styles.macroSidebar)}
        data-side="right"
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

  // Phone: slim pull-up sheet with 1-tap switcher, Finalize, and Resolve / Press in the peek;
  // consensus details, Clear All, and unit cards inside the raised body.
  if (variant === 'sheet') {
    const canSwitchPower =
      (!isMultiplayer || sandboxMode) && !locked && Boolean(onSelectPower);
    return (
      <MacroSheet
        sheetSnap={sheetSnap}
        onSheetSnapChange={onSheetSnapChange}
        activePower={activePower}
        powerMeta={powerMeta}
        finalizedPowers={finalizedPowers}
        units={units}
        orders={orders}
        selectedUnitId={selectedUnitId}
        progress={progress}
        isSurrendered={isSurrendered}
        isFinalized={isFinalized}
        isMultiplayer={isMultiplayer}
        gameOver={gameOver}
        isAdjustmentPhase={isAdjustmentPhase}
        isRetreatPhase={isRetreatPhase}
        consensusInfo={consensusInfo}
        locked={locked}
        spectating={Boolean(spectator)}
        lockBar={lockBar}
        clearAllButton={clearAllButton}
        phaseContext={phaseContext}
        unitList={unitList}
        canSwitchPower={canSwitchPower}
        onSelectPower={onSelectPower}
        onHighlightProvinces={onHighlightProvinces}
        onFinalizeClick={onFinalizeClick}
        onUnfinalizeClick={onUnfinalizeClick}
        onAdjudicateTurn={onAdjudicateTurn}
        onOpenPress={onOpenPress}
        pressToggleRef={pressToggleRef}
      />
    );
  }

  // Expanded Core-Gameplay Sidebar
  return (
    <aside
      className={cx(chromeStyles.sidebarShell, styles.macroSidebar)}
      data-side="right"
      data-expanded="true"
      data-testid="macro-sidebar"
      data-history-locked={locked ? 'true' : undefined}
      data-spectating={spectator ? 'true' : undefined}
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
        className={cx(styles.macroUnitsScrollArea, scrollbarStyles.thin)}
        data-testid="macro-units-scroll-area"
        ref={panelScrollRef}
        inert={locked || isSurrendered || undefined}
      >
        {unitList}
      </div>

      {/* 3. STICKY FOOTER: FINALIZE & ADJUDICATE (a spectator has nothing to finalize) */}
      {!spectator && (
        <div
          className={styles.sidebarFooterActions}
          data-testid="macro-footer-actions"
          inert={locked || undefined}
        >
          {footerActions}
        </div>
      )}
    </aside>
  );
};
