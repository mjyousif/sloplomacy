import {
  AlertTriangle,
  ChevronDown,
  Filter,
  Flag,
  History,
  Lock,
  PanelRightClose,
  X,
} from 'lucide-react';
import type React from 'react';
import {
  POWER_METADATA,
  type Power,
  type ValidationIssue,
} from '../../types/diplomacy';
import {
  ALL_ADJUSTMENT_ACTIONS,
  ALL_HISTORY_ACTIONS,
  type HistoryActionType,
} from '../../utils/historyHelpers';
import type { OrderProgress } from '../../utils/orderProgress';
import {
  ActionFilterChips,
  PowerFilterChips,
} from '../tools/TurnHistorySelector';
import { PowerFlag } from '../ui/PowerFlag';
import chromeStyles from '../ui/SidebarChrome.module.css';
import styles from './PowerHeader.module.css';

/** Civil Disorder, Finalized, the issue count or Drafting. */
export const StatusBadge: React.FC<{
  isSurrendered: boolean;
  isFinalized: boolean;
  blockingIssues: ValidationIssue[];
}> = ({ isSurrendered, isFinalized, blockingIssues }) => (
  <div>
    {isSurrendered ? (
      <span
        className={styles.statusBadge}
        data-testid="status-badge"
        data-status="surrendered"
      >
        <Flag size={11} /> Civil Disorder
      </span>
    ) : isFinalized ? (
      <span
        className={styles.statusBadge}
        data-testid="status-badge"
        data-status="finalized"
      >
        <Lock size={11} /> Finalized
      </span>
    ) : blockingIssues.length > 0 ? (
      <span
        className={styles.statusBadge}
        data-testid="status-badge"
        data-status="has-warnings"
      >
        <AlertTriangle size={11} /> {blockingIssues.length} Issue
        {blockingIssues.length > 1 ? 's' : ''}
      </span>
    ) : (
      <span
        className={styles.statusBadge}
        data-testid="status-badge"
        data-status="drafting"
      >
        Drafting
      </span>
    )}
  </div>
);

/** What the phase asks of this power: winter builds or disbands, or the retreat count. */
export const PhaseContext: React.FC<{
  activePower: Power;
  progress: OrderProgress;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
}> = ({ activePower, progress, isAdjustmentPhase, isRetreatPhase }) => {
  const {
    buildCount,
    buildHomes,
    maxAllowedBuilds,
    assignedBuildsCount,
    neededDisbands,
    assignedDisbandsCount,
    myActiveFieldUnits,
    myDislodgedUnits,
    scCountByPower,
  } = progress;
  return (
    <>
      {isAdjustmentPhase && (
        <div
          className={styles.macroPhaseContextBox}
          data-testid="macro-phase-context-box"
          data-phase="adjustment"
        >
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
        <div
          className={styles.macroPhaseContextBox}
          data-testid="macro-phase-context-box"
          data-phase="retreat"
        >
          <strong>RETREAT PHASE:</strong>{' '}
          {myDislodgedUnits.length > 0
            ? `${myDislodgedUnits.length} dislodged unit${myDislodgedUnits.length > 1 ? 's' : ''} must Retreat or Disband.`
            : 'No dislodged units. Awaiting other powers.'}
        </div>
      )}
    </>
  );
};

function actionsForTurn(
  phase?: string,
  season?: string,
): readonly HistoryActionType[] | null {
  if (phase === 'Admin') return null;
  if (phase === 'Adjustments' || season === 'Winter') {
    return ALL_ADJUSTMENT_ACTIONS;
  }
  if (phase === 'Movement') {
    return ALL_HISTORY_ACTIONS;
  }
  return null;
}

/** Nation + phase-action filter block shared under "Viewing [turn]". */
export const HistoryFilterSection: React.FC<{
  historyPhase?: string;
  historySeason?: string;
  historyIsAdmin?: boolean;
  historyPowers?: readonly Power[];
  historyActions?: readonly HistoryActionType[];
  onSelectHistoryPowers: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
}> = ({
  historyPhase,
  historySeason,
  historyIsAdmin = false,
  historyPowers = [],
  historyActions = [],
  onSelectHistoryPowers,
  onSelectHistoryActions,
}) => {
  const availableActions = actionsForTurn(historyPhase, historySeason);
  return (
    <div
      className={styles.historyLockFilterSection}
      data-admin-phase={historyIsAdmin ? 'true' : undefined}
    >
      <div
        className={styles.historyLockFilterHeader}
        data-testid="history-lock-filter-header"
      >
        <Filter
          size={12}
          className={styles.historyLockFilterIcon}
          aria-hidden="true"
        />
        <span>Filters</span>
      </div>
      <div className={styles.historyLockFilterRows}>
        <div className={styles.historyLockFilterRow}>
          <span className={styles.historyLockFilterRowLabel}>Nations</span>
          <PowerFilterChips
            powers={historyPowers}
            disabled={false}
            showAllChip={false}
            onSelectPowers={onSelectHistoryPowers}
            className={styles.historyLockFilterChips}
            chipClassName={styles.historyLockFilterChip}
          />
          <button
            type="button"
            className={styles.historyLockFilterClearBtn}
            data-testid="turn-history-clear-powers"
            disabled={historyPowers.length === 0}
            aria-label="Clear nation filters"
            title="Clear nation filters"
            onClick={() => onSelectHistoryPowers([])}
          >
            <X size={12} />
          </button>
        </div>
        {onSelectHistoryActions && availableActions && (
          <div className={styles.historyLockFilterRow}>
            <span className={styles.historyLockFilterRowLabel}>Actions</span>
            <ActionFilterChips
              actions={historyActions}
              availableActions={availableActions}
              onSelectActions={onSelectHistoryActions}
              className={styles.historyLockFilterChips}
              chipClassName={styles.historyLockActionChip}
            />
            <button
              type="button"
              className={styles.historyLockFilterClearBtn}
              data-testid="turn-history-clear-actions"
              disabled={historyActions.length === 0}
              aria-label="Clear action filters"
              title="Clear action filters"
              onClick={() => onSelectHistoryActions([])}
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/** The bar over a past turn's orders or live suggestion preview, with optional filters or Back to live button. */
export const HistoryLockBar: React.FC<{
  historyLabel: string;
  historyPhase?: string;
  historySeason?: string;
  historyIsAdmin?: boolean;
  historyPowers?: readonly Power[];
  historyActions?: readonly HistoryActionType[];
  onSelectHistoryPowers?: (powers: Power[]) => void;
  onSelectHistoryActions?: (actions: HistoryActionType[]) => void;
  onReturnToLive?: () => void;
  onToggleCollapse?: () => void;
}> = ({
  historyLabel,
  historyPhase,
  historySeason,
  historyIsAdmin = false,
  historyPowers = [],
  historyActions = [],
  onSelectHistoryPowers,
  onSelectHistoryActions,
  onReturnToLive,
  onToggleCollapse,
}) => (
  <div
    className={styles.historyLockBar}
    data-testid="history-lock-bar"
    data-admin-phase={historyIsAdmin ? 'true' : undefined}
  >
    <div className={styles.historyLockMainRow}>
      {onToggleCollapse && (
        <button
          type="button"
          data-testid="macro-sidebar-collapse-btn"
          className={chromeStyles.sidebarCollapseToggleBtn}
          onClick={onToggleCollapse}
          title="Collapse Turn Log"
        >
          <PanelRightClose size={15} />
        </button>
      )}
      <History
        size={13}
        className={styles.historyLockIcon}
        aria-hidden="true"
      />
      <span className={styles.historyLockLabel}>
        Viewing <strong>{historyLabel}</strong>
      </span>
      {onReturnToLive && (
        <button
          type="button"
          className={styles.historyLockLiveBtn}
          data-testid="history-lock-live-btn"
          onClick={onReturnToLive}
        >
          Back to live
        </button>
      )}
    </div>
    {onSelectHistoryPowers && (
      <HistoryFilterSection
        historyPhase={historyPhase}
        historySeason={historySeason}
        historyIsAdmin={historyIsAdmin}
        historyPowers={historyPowers}
        historyActions={historyActions}
        onSelectHistoryPowers={onSelectHistoryPowers}
        onSelectHistoryActions={onSelectHistoryActions}
      />
    )}
  </div>
);

interface PowerHeaderProps {
  /** 'panel' is the desktop banner's top row, 'sheet' is the phone peek's status row. */
  variant: 'panel' | 'sheet';
  activePower: Power;
  progress: OrderProgress;
  isSurrendered: boolean;
  isFinalized: boolean;
  /** The past-turn lock: the sheet's row goes inert with the rest of its peek. */
  locked: boolean;
  onToggleCollapse?: () => void;
  /** Phone sheet only: true when tapping the power opens the 1-tap 7-power switcher. */
  canSwitchPower?: boolean;
  powerSwitcherOpen?: boolean;
  onTogglePowerSwitcher?: () => void;
}

/** Which power the player commands and its status. */
export const PowerHeader: React.FC<PowerHeaderProps> = ({
  variant,
  activePower,
  progress,
  isSurrendered,
  isFinalized,
  locked,
  onToggleCollapse,
  canSwitchPower = false,
  powerSwitcherOpen = false,
  onTogglePowerSwitcher,
}) => {
  const powerMeta = POWER_METADATA[activePower];
  const { myBlockingIssues } = progress;
  const statusBadge = (
    <StatusBadge
      isSurrendered={isSurrendered}
      isFinalized={isFinalized}
      blockingIssues={myBlockingIssues}
    />
  );

  if (variant === 'sheet') {
    return (
      <div
        className={styles.macroSheetStatusRow}
        data-testid="macro-sheet-status-row"
        inert={locked || undefined}
      >
        {canSwitchPower && onTogglePowerSwitcher ? (
          <button
            type="button"
            className={styles.powerSwitcherTrigger}
            data-testid="sheet-power-switcher-trigger"
            aria-expanded={Boolean(powerSwitcherOpen)}
            aria-haspopup="listbox"
            aria-label={`Switch nation (current: ${powerMeta.shortName})`}
            onClick={onTogglePowerSwitcher}
          >
            <span className={styles.powerCrestIcon}>
              <PowerFlag power={activePower} width={22} height={15} />
            </span>
            <span className={styles.macroSheetPower}>
              <span className={styles.powerSwitcherTitleRow}>
                <span
                  className={styles.powerNameText}
                  data-testid="power-name-text"
                >
                  {powerMeta.shortName}
                </span>
                <ChevronDown
                  size={14}
                  className={styles.powerSwitcherChevron}
                  data-open={powerSwitcherOpen ? 'true' : undefined}
                  aria-hidden="true"
                />
              </span>
            </span>
          </button>
        ) : (
          <>
            <span className={styles.powerCrestIcon}>
              <PowerFlag power={activePower} width={24} height={16} />
            </span>
            <div className={styles.macroSheetPower}>
              <span
                className={styles.powerNameText}
                data-testid="power-name-text"
              >
                {powerMeta.shortName}
              </span>
            </div>
          </>
        )}
        {statusBadge}
      </div>
    );
  }

  return (
    <div className={styles.powerBannerTop}>
      {onToggleCollapse && (
        <button
          type="button"
          data-testid="macro-sidebar-collapse-btn"
          className={chromeStyles.sidebarCollapseToggleBtn}
          onClick={onToggleCollapse}
          title="Collapse Tactical Orders"
        >
          <PanelRightClose size={15} />
        </button>
      )}
      <div className={styles.powerBannerMainCol}>
        <div
          className={styles.powerBannerTitle}
          data-testid="power-banner-title"
        >
          <span className={styles.powerCrestIcon}>
            <PowerFlag power={activePower} width={22} height={15} />
          </span>
          <span className={styles.powerNameText}>{powerMeta.name}</span>
        </div>
      </div>

      <div className={styles.powerBannerActionsRight}>{statusBadge}</div>
    </div>
  );
};
