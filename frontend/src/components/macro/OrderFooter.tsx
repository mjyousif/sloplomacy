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
import { useEffect, useRef, useState } from 'react';
import type { PowerMeta } from '../../types/diplomacy';
import { cx } from '../../utils/cx';
import type { ConsensusStatusInfo } from '../../utils/orderHelpers';
import styles from './OrderFooter.module.css';

/**
 * "Clear All": resets every order of the power to its phase default. The first click only asks:
 * the button's spot splits into Yes (clears) and Cancel, and either one, or Escape, puts the
 * button back. The question never times out. `MacroSidebar` keys this by the phase, so an open
 * question does not carry into the next turn.
 */
export const ClearAllButton: React.FC<{
  onClearAllOrders: () => void;
}> = ({ onClearAllOrders }) => {
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  // Focus follows the swap only when the player was using these buttons, so a rerender never
  // pulls focus away from somewhere else.
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    (confirming ? cancelRef : clearRef).current?.focus();
  }, [confirming]);

  const swap = (next: boolean) => {
    moveFocus.current = true;
    setConfirming(next);
  };

  if (!confirming) {
    return (
      <button
        ref={clearRef}
        type="button"
        className={cx(styles.quickActionBtn, styles.clearAllBtn)}
        data-testid="btn-clear-all"
        title="Clear all orders and return every unit to its default"
        onClick={() => swap(true)}
      >
        <Eraser size={12} /> Clear All Orders
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Clear all orders?"
      className={styles.clearAllConfirm}
      data-testid="clear-all-confirm"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        swap(false);
      }}
    >
      {/* An invisible copy of the button under the two, so they keep its exact footprint. A
          button, so it has the same font; `visibility: hidden` keeps it out of reach and out of
          the accessibility tree. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={cx(styles.quickActionBtn, styles.clearAllGhost)}
      >
        <Eraser size={12} /> Clear All Orders
      </button>
      <div className={styles.clearAllChoices}>
        <button
          type="button"
          className={cx(styles.quickActionBtn, styles.clearAllBtn)}
          data-testid="btn-clear-all-confirm"
          title="Yes, clear all orders"
          onClick={() => {
            swap(false);
            onClearAllOrders();
          }}
        >
          <Eraser size={12} /> Yes
        </button>
        <button
          ref={cancelRef}
          type="button"
          className={styles.quickActionBtn}
          data-testid="btn-clear-all-cancel"
          title="Keep the orders"
          onClick={() => swap(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

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
  gameOver: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  consensusInfo: ConsensusStatusInfo;
  onFinalizeClick: () => void;
  onUnfinalizeClick: () => void;
  onAdjudicateTurn: () => void;
}

/**
 * Finalize or unlock, then Resolve (solo) or the multiplayer consensus card. A fragment, because
 * the sheet's CSS styles these buttons as direct children of its controls row.
 */
export const OrderFooter: React.FC<OrderFooterProps> = ({
  powerMeta,
  isFinalized,
  blockingIssueCount,
  unconfirmedCount,
  isMultiplayer,
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
      </div>
    )}
  </>
);
