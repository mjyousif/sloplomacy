import {
  AlertTriangle,
  Clock,
  Eraser,
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

/** Multiplayer resolution / consensus progress card. */
export const MultiplayerConsensusCard: React.FC<{
  consensusInfo: ConsensusStatusInfo;
}> = ({ consensusInfo }) => (
  <div
    className={styles.mpResolutionControls}
    data-testid="mp-resolution-controls"
  >
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
      <div className={styles.mpConsensusDesc} data-testid="mp-consensus-desc">
        {consensusInfo.description}
      </div>
    </div>
  </div>
);

interface OrderFooterProps {
  powerMeta: PowerMeta;
  isFinalized: boolean;
  /** A surrendered power is in Civil Disorder: finalizing and unlocking are off. */
  isSurrendered?: boolean;
  blockingIssueCount: number;
  unconfirmedCount: number;
  isMultiplayer: boolean;
  gameOver: boolean;
  isAdjustmentPhase: boolean;
  isRetreatPhase: boolean;
  consensusInfo: ConsensusStatusInfo;
  /** Desktop renders the consensus card right after Finalize; phone sheet moves it into the body. */
  showConsensusCard?: boolean;
  /** Phone sheet peek uses shorter button labels to fit on one row. */
  compactLabels?: boolean;
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
  isSurrendered = false,
  blockingIssueCount,
  unconfirmedCount,
  isMultiplayer,
  gameOver,
  isAdjustmentPhase,
  isRetreatPhase,
  consensusInfo,
  showConsensusCard = true,
  compactLabels = false,
  onFinalizeClick,
  onUnfinalizeClick,
  onAdjudicateTurn,
}) => {
  const warningText = compactLabels
    ? `Finalize (${blockingIssueCount} Warning${blockingIssueCount > 1 ? 's' : ''})`
    : `Finalize ${powerMeta.shortName} (${blockingIssueCount} Warning${blockingIssueCount > 1 ? 's' : ''})`;
  const finalizeText = compactLabels
    ? `Finalize${unconfirmedCount > 0 ? ` (${unconfirmedCount})` : ' Orders'}`
    : `Finalize ${powerMeta.shortName} Orders${unconfirmedCount > 0 ? ` (${unconfirmedCount} Unconfirmed)` : ''}`;
  const unfinalizeText = compactLabels
    ? 'Finalized · Unlock'
    : 'Orders Finalized — Click to Unlock';
  const resolveText = gameOver
    ? 'Game Over'
    : compactLabels
      ? 'Resolve'
      : isAdjustmentPhase
        ? 'Resolve Adjustments & Advance'
        : isRetreatPhase
          ? 'Resolve Retreats & Advance'
          : 'Resolve Phase';

  return (
    <>
      {!isFinalized ? (
        <button
          type="button"
          data-testid="btn-finalize-orders"
          disabled={isSurrendered}
          data-warning={blockingIssueCount > 0 ? 'true' : undefined}
          className={styles.finalizePrimaryBtn}
          onClick={onFinalizeClick}
        >
          {blockingIssueCount > 0 ? (
            <>
              <AlertTriangle size={15} />
              <span>{warningText}</span>
            </>
          ) : (
            <>
              <Lock size={15} />
              <span>{finalizeText}</span>
            </>
          )}
        </button>
      ) : (
        <button
          type="button"
          data-testid="btn-unfinalize-orders"
          disabled={isSurrendered}
          className={styles.unfinalizeBtn}
          onClick={onUnfinalizeClick}
        >
          <Unlock size={15} />
          <span>{unfinalizeText}</span>
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
          <span>{resolveText}</span>
        </button>
      ) : (
        showConsensusCard && (
          <MultiplayerConsensusCard consensusInfo={consensusInfo} />
        )
      )}
    </>
  );
};
