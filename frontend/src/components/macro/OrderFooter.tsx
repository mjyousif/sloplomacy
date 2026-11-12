import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  Play,
  Unlock,
  Users,
} from 'lucide-react';
import type React from 'react';
import type { PowerMeta } from '../../types/diplomacy';
import type { ConsensusStatusInfo } from '../../utils/orderHelpers';

/** "Confirm All (n/m)": marks every current order as confirmed. */
export const ConfirmAllButton: React.FC<{
  confirmedCount: number;
  totalActionableCount: number;
  onConfirmAllHolds: () => void;
}> = ({ confirmedCount, totalActionableCount, onConfirmAllHolds }) => (
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

/** Surrender, in a multiplayer match whose host has wired it up. */
export const SurrenderButton: React.FC<{ onSurrenderClick: () => void }> = ({
  onSurrenderClick,
}) => (
  <button
    type="button"
    className="quick-action-btn surrender-btn-sidebar"
    title="Surrender sovereign command and leave this campaign"
    onClick={onSurrenderClick}
  >
    <Flag size={12} /> Surrender
  </button>
);

interface OrderFooterProps {
  powerMeta: PowerMeta;
  isFinalized: boolean;
  blockingIssueCount: number;
  unconfirmedCount: number;
  isMultiplayer: boolean;
  isGameCreator: boolean;
  gameOver: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  consensusInfo: ConsensusStatusInfo;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onAdjudicateTurn: () => void;
}

/**
 * Finalize or unlock, then Resolve (solo) or the multiplayer consensus card with the host's
 * override. A fragment, because the sheet's CSS styles these buttons as direct children of its
 * controls row.
 */
export const OrderFooter: React.FC<OrderFooterProps> = ({
  powerMeta,
  isFinalized,
  blockingIssueCount,
  unconfirmedCount,
  isMultiplayer,
  isGameCreator,
  gameOver,
  isAdjustmentPhase,
  isRetreatPhase,
  consensusInfo,
  onFinalizeClick,
  onUnfinalizeClick,
  onAdjudicateTurn,
}) => (
  <>
    {!isFinalized ? (
      <button
        type="button"
        data-testid="btn-finalize-orders"
        className={`finalize-primary-btn ${
          blockingIssueCount > 0 ? 'has-warning-state' : ''
        }`}
        onClick={onFinalizeClick}
      >
        {blockingIssueCount > 0 ? (
          <>
            <AlertTriangle size={15} />
            <span>
              Finalize {powerMeta.shortName} ({blockingIssueCount} Warning
              {blockingIssueCount > 1 ? 's' : ''})
            </span>
          </>
        ) : (
          <>
            <Lock size={15} />
            <span>
              Finalize {powerMeta.shortName} Orders
              {unconfirmedCount > 0 ? ` (${unconfirmedCount} Unconfirmed)` : ''}
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
