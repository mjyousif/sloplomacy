import { MessagesSquare } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { Order, Power, PowerMeta, Unit } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { ConsensusStatusInfo } from '../../utils/orderHelpers';
import type { OrderProgress } from '../../utils/orderProgress';
import type { SheetSnap } from '../../utils/sheetHelpers';
import macroStyles from '../MacroSidebar.module.css';
import {
  PressUnreadBadge,
  pressBadgeAnchor,
} from '../tools/press/PressUnreadBadge';
import { BottomSheet } from '../ui/BottomSheet';
import styles from './MacroSheet.module.css';
import { MultiplayerConsensusCard, OrderFooter } from './OrderFooter';
import { PowerHeader } from './PowerHeader';
import { SheetPowerSwitcher } from './SheetPowerSwitcher';
import { useSheetSelection } from './useSheetSelection';

export interface MacroSheetProps {
  sheetSnap: SheetSnap;
  onSheetSnapChange?: (snap: SheetSnap) => void;
  activePower: Power;
  powerMeta: PowerMeta;
  finalizedPowers: Power[];
  units: Unit[];
  orders: Record<string, Order>;
  selectedUnitId: string | null;
  progress: OrderProgress;
  isSurrendered: boolean;
  isFinalized: boolean;
  isMultiplayer: boolean;
  gameOver: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  consensusInfo: ConsensusStatusInfo;
  locked: boolean;
  /** Watching without a seat: no Finalize, and the inert cards are not dimmed. */
  spectating?: boolean;
  lockBar: React.ReactNode;
  clearAllButton: React.ReactNode;
  phaseContext: React.ReactNode;
  unitList: React.ReactNode;
  canSwitchPower: boolean;
  onSelectPower?: (power: Power) => void;
  onHighlightProvinces: (provinces: string[]) => void;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onAdjudicateTurn: () => void;
  onOpenPress?: () => void;
  pressToggleRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Phone bottom-sheet layout for live orders: a slim peek holding the power, a 1-tap switcher
 * when available, Finalize, and Resolve / Press; with consensus details, Clear All, and unit
 * cards tucked inside the raised body.
 */
export const MacroSheet: React.FC<MacroSheetProps> = ({
  sheetSnap,
  onSheetSnapChange,
  activePower,
  powerMeta,
  finalizedPowers,
  units,
  orders,
  selectedUnitId,
  progress,
  isSurrendered,
  isFinalized,
  isMultiplayer,
  gameOver,
  isAdjustmentPhase,
  isRetreatPhase,
  consensusInfo,
  locked,
  spectating = false,
  lockBar,
  clearAllButton,
  phaseContext,
  unitList,
  canSwitchPower,
  onSelectPower,
  onHighlightProvinces,
  onFinalizeClick,
  onUnfinalizeClick,
  onAdjudicateTurn,
  onOpenPress,
  pressToggleRef,
}) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  if (switcherOpen && (!canSwitchPower || locked)) {
    setSwitcherOpen(false);
  }

  const sheetBodyRef = useSheetSelection({
    isSheet: true,
    sheetSnap,
    selectedUnitId,
    activePower,
    units,
    orders,
    onHighlightProvinces,
  });

  return (
    <BottomSheet
      snap={sheetSnap}
      onSnapChange={(snap) => onSheetSnapChange?.(snap)}
      label="Orders"
      testId="macro-sidebar"
      peek={
        <div
          className={macroStyles.macroSheetPeek}
          data-testid="macro-sheet-peek"
          data-history-locked={locked ? 'true' : undefined}
          data-spectating={spectating ? 'true' : undefined}
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
            canSwitchPower={canSwitchPower && Boolean(onSelectPower)}
            powerSwitcherOpen={switcherOpen}
            onTogglePowerSwitcher={() => setSwitcherOpen((open) => !open)}
          />
          {canSwitchPower && onSelectPower && switcherOpen && (
            <SheetPowerSwitcher
              activePower={activePower}
              finalizedPowers={finalizedPowers}
              onSelectPower={onSelectPower}
              onClose={() => setSwitcherOpen(false)}
            />
          )}
          <div
            className={styles.macroSheetActionBar}
            data-testid="macro-sheet-action-bar"
          >
            {!spectating && (
              <div
                className={styles.macroSheetControls}
                data-testid="macro-sheet-controls"
                inert={locked || undefined}
              >
                <OrderFooter
                  powerMeta={powerMeta}
                  isFinalized={isFinalized}
                  isSurrendered={isSurrendered}
                  blockingIssueCount={progress.myBlockingIssues.length}
                  unconfirmedCount={progress.unconfirmedCount}
                  isMultiplayer={isMultiplayer}
                  gameOver={gameOver}
                  isAdjustmentPhase={isAdjustmentPhase}
                  isRetreatPhase={isRetreatPhase}
                  consensusInfo={consensusInfo}
                  showConsensusCard={false}
                  compactLabels={true}
                  onFinalizeClick={onFinalizeClick}
                  onUnfinalizeClick={onUnfinalizeClick}
                  onAdjudicateTurn={onAdjudicateTurn}
                />
              </div>
            )}
            {onOpenPress && (
              <button
                ref={pressToggleRef}
                type="button"
                data-testid="mobile-press-toggle"
                className={cx(styles.mobilePressBtn, pressBadgeAnchor)}
                onClick={onOpenPress}
                aria-label="Open Press"
              >
                <MessagesSquare size={16} aria-hidden="true" />
                <span>Press</span>
                <PressUnreadBadge />
              </button>
            )}
          </div>
        </div>
      }
    >
      <div
        className={macroStyles.macroSheetBody}
        data-testid="macro-sheet-body"
        data-history-locked={locked ? 'true' : undefined}
        data-spectating={spectating ? 'true' : undefined}
        ref={sheetBodyRef}
        inert={locked || isSurrendered || undefined}
      >
        {phaseContext}
        {isMultiplayer && (
          <div className={styles.macroSheetConsensusWrap}>
            <MultiplayerConsensusCard consensusInfo={consensusInfo} />
          </div>
        )}
        {clearAllButton && (
          <div
            className={styles.macroSheetUtilityBar}
            data-testid="macro-sheet-utility-bar"
          >
            {clearAllButton}
          </div>
        )}
        <div
          className={macroStyles.macroUnitsScrollArea}
          data-testid="macro-units-scroll-area"
        >
          {unitList}
        </div>
      </div>
    </BottomSheet>
  );
};
