import {
  AlertTriangle,
  Clock,
  Eraser,
  Flag,
  Lock,
  Play,
  Unlock,
  Users,
} from 'lucide-react';
import type React from 'react';
import type { PowerMeta } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { ConsensusStatusInfo } from '../../utils/orderHelpers';
import styles from './OrderFooter.module.css';

/** "Clear All": resets every order of the power to its phase default. */
export const ClearAllButton: React.FC<{
  onClearAllOrders: () => void;
}> = ({ onClearAllOrders }) => (
  <button
    type="button"
    className={cx(styles.quickActionBtn, styles.clearAllBtn)}
    data-testid="btn-clear-all"
    title="Clear all orders and return every unit to its default"
    onClick={onClearAllOrders}
  >
    <Eraser size={12} /> Clear All Orders
  </button>
);

/** Surrender, in a multiplayer match whose host has wired it up. */
export const SurrenderButton: React.FC<{ onSurrenderClick: () => void }> = ({
  onSurrenderClick,
}) => (
  <button
    type="button"
    className={cx(styles.quickActionBtn, styles.surrenderBtnSidebar)}
    data-testid="btn-surrender-sidebar"
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
        data-warning={blockingIssueCount > 0 ? 'true' : undefined}
        className={styles.finalizePrimaryBtn}
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
        className={styles.unfinalizeBtn}
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
        className={styles.adjudicateTurnBtn}
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
      <div className={styles.mpResolutionControls}>
        <div
          className={styles.mpConsensusStatusCard}
          data-testid="mp-consensus-status-card"
          data-waiting={consensusInfo.isWaitingForPlayers ? 'true' : undefined}
        >
          <div className={styles.mpConsensusHeader}>
            {consensusInfo.isWaitingForPlayers ? (
              <Users size={14} className={styles.consensusIcon} />
            ) : (
              <Clock size={13} className={styles.consensusIcon} />
            )}
            <span data-testid="consensus-title">{consensusInfo.title}</span>
          </div>
          <div
            className={styles.mpConsensusDesc}
            data-testid="mp-consensus-desc"
          >
            {consensusInfo.description}
          </div>
        </div>

        {isGameCreator && (
          <button
            type="button"
            data-testid="btn-creator-override"
            data-solo-ready={
              consensusInfo.isSoloAdvanceReady ? 'true' : undefined
            }
            className={cx(styles.adjudicateTurnBtn, styles.creatorOverrideBtn)}
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
