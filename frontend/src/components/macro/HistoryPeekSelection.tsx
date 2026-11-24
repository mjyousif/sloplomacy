import { X } from 'lucide-react';
import type React from 'react';
import type { HistoryOwnershipChange } from '../../utils/historyOwnershipChanges';
import type {
  HistoryOrderEntry,
  HistoryTurnLog,
} from '../../utils/historyTurnLog';
import { powerShortNameOrNeutral } from '../../utils/powerHelpers';
import { PowerFlag } from '../ui/PowerFlag';
import styles from './HistoryPeekSelection.module.css';
import type { HistoryHighlightFocus } from './HistoryTurnPanel';
import panelStyles from './HistoryTurnPanel.module.css';

export interface HistoryPeekSelectionProps {
  selectedOrder: HistoryOrderEntry | null;
  selectedOwnership: HistoryOwnershipChange | null;
  onExpand: () => void;
  onClear: () => void;
}

/** Resolves the pinned past-turn item and its clear focus for the phone sheet peek. */
export function resolvePinnedHistorySelection(
  log: HistoryTurnLog,
  selectedOrderId: string | null,
): {
  selectedOrder: HistoryOrderEntry | null;
  selectedOwnership: HistoryOwnershipChange | null;
  clearFocus: HistoryHighlightFocus | null;
} {
  if (!selectedOrderId) {
    return { selectedOrder: null, selectedOwnership: null, clearFocus: null };
  }
  for (const group of log.groups) {
    const hit = group.entries.find((e) => e.id === selectedOrderId);
    if (hit) {
      return {
        selectedOrder: hit,
        selectedOwnership: null,
        clearFocus: {
          id: hit.id,
          unitId: hit.highlightUnitId,
          provinces: hit.highlightProvinces,
        },
      };
    }
  }
  const own =
    log.ownershipChanges.find((c) => `own_${c.province}` === selectedOrderId) ??
    null;
  return {
    selectedOrder: null,
    selectedOwnership: own,
    clearFocus: own
      ? {
          id: `own_${own.province}`,
          unitId: null,
          provinces: [own.province],
        }
      : null,
  };
}

/**
 * Compact summary shown in the lowered History bottom-sheet peek when a player taps a
 * past-turn order or ownership change to inspect it on the map. Tapping the summary re-opens
 * the turn log; the × button clears the map highlight.
 */
export const HistoryPeekSelection: React.FC<HistoryPeekSelectionProps> = ({
  selectedOrder,
  selectedOwnership,
  onExpand,
  onClear,
}) => {
  if (!selectedOrder && !selectedOwnership) return null;

  return (
    <div className={styles.peekSelection} data-testid="history-peek-selection">
      <button
        type="button"
        className={styles.peekSelectionSummary}
        onClick={onExpand}
        aria-label="Open turn log"
      >
        {selectedOrder ? (
          <>
            <PowerFlag power={selectedOrder.power} width={16} height={11} />
            <span className={styles.peekSelectionLoc}>
              {selectedOrder.locationLabel}
            </span>
            <span className={styles.peekSelectionDetail}>
              {selectedOrder.detail}
            </span>
            <span
              className={panelStyles.historyOutcomePill}
              data-tone={selectedOrder.outcomeTone}
            >
              {selectedOrder.outcomeLabel}
            </span>
          </>
        ) : (
          selectedOwnership && (
            <>
              <span className={styles.peekSelectionLoc}>
                {selectedOwnership.provinceName}
              </span>
              <span className={styles.peekSelectionDetail}>
                {powerShortNameOrNeutral(selectedOwnership.prevPower)} →{' '}
                {powerShortNameOrNeutral(selectedOwnership.nextPower)}
              </span>
            </>
          )
        )}
      </button>
      <button
        type="button"
        className={styles.peekSelectionClearBtn}
        data-testid="history-peek-clear-pin"
        onClick={onClear}
        aria-label="Clear selected order"
        title="Clear selected order"
      >
        <X size={14} />
      </button>
    </div>
  );
};
