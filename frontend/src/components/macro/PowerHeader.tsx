import {
  AlertTriangle,
  Flag,
  History,
  Lock,
  PanelRightClose,
} from 'lucide-react';
import type React from 'react';
import {
  POWER_METADATA,
  type Power,
  type ValidationIssue,
} from '../../types/diplomacy';
import type { OrderProgress } from '../../utils/orderProgress';
import { PowerFlag } from '../PowerFlag';

/** Civil Disorder, Finalized, the issue count or Drafting. */
export const StatusBadge: React.FC<{
  isSurrendered: boolean;
  isFinalized: boolean;
  blockingIssues: ValidationIssue[];
}> = ({ isSurrendered, isFinalized, blockingIssues }) => (
  <div className="power-status-badge-wrap">
    {isSurrendered ? (
      <span className="status-badge surrendered">
        <Flag size={11} /> Civil Disorder
      </span>
    ) : isFinalized ? (
      <span className="status-badge finalized">
        <Lock size={11} /> Finalized
      </span>
    ) : blockingIssues.length > 0 ? (
      <span className="status-badge has-warnings">
        <AlertTriangle size={11} /> {blockingIssues.length} Issue
        {blockingIssues.length > 1 ? 's' : ''}
      </span>
    ) : (
      <span className="status-badge drafting">Drafting</span>
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
};

/** The bar over a past turn's orders that leads back to the live turn. */
export const HistoryLockBar: React.FC<{
  historyLabel: string;
  onReturnToLive?: () => void;
}> = ({ historyLabel, onReturnToLive }) => (
  <div className="history-lock-bar" data-testid="history-lock-bar">
    <History size={13} aria-hidden="true" />
    <span className="history-lock-label">
      Viewing <strong>{historyLabel}</strong>
    </span>
    <button
      type="button"
      className="history-lock-live-btn"
      data-testid="history-lock-live-btn"
      onClick={onReturnToLive}
    >
      Back to live
    </button>
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
}

/** Which power the player commands, its units and supply centers, and its status. */
export const PowerHeader: React.FC<PowerHeaderProps> = ({
  variant,
  activePower,
  progress,
  isSurrendered,
  isFinalized,
  locked,
  onToggleCollapse,
}) => {
  const powerMeta = POWER_METADATA[activePower];
  const {
    myActiveFieldUnits,
    myDislodgedUnits,
    myBlockingIssues,
    scCountByPower,
    unconfirmedCount,
  } = progress;
  const statusBadge = (
    <StatusBadge
      isSurrendered={isSurrendered}
      isFinalized={isFinalized}
      blockingIssues={myBlockingIssues}
    />
  );

  if (variant === 'sheet') {
    return (
      <div className="macro-sheet-status-row" inert={locked || undefined}>
        <span className="power-crest-icon">
          <PowerFlag power={activePower} width={24} height={16} />
        </span>
        <div className="macro-sheet-power">
          <span className="power-name-text">{powerMeta.shortName}</span>
          <span className="macro-sheet-counts" data-testid="macro-sheet-counts">
            {myActiveFieldUnits.length} units · {scCountByPower[activePower]}{' '}
            SCs
            {unconfirmedCount > 0 ? ` · ${unconfirmedCount} unconfirmed` : ''}
          </span>
        </div>
        {statusBadge}
      </div>
    );
  }

  return (
    <div className="power-banner-top">
      <div className="power-banner-main-col">
        <div className="power-banner-title">
          <span className="power-crest-icon">
            <PowerFlag power={activePower} width={22} height={15} />
          </span>
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
  );
};
