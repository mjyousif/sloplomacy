import type React from 'react';
import { POWER_METADATA, type Power } from '../../types/diplomacy';
import type { HistoryOwnershipChange } from '../../utils/historyOwnershipChanges';
import type { HistoryPhaseKind } from '../../utils/historyTurnLog';
import { powerShortNameOrNeutral } from '../../utils/powerHelpers';
import { SupplyStar } from '../MapPiece';
import type { HistoryHighlightFocus } from './HistoryTurnPanel';
import styles from './HistoryTurnPanel.module.css';

const OwnerTag: React.FC<{ power: Power | null }> = ({ power }) => (
  <span className={styles.historyOwnerTag}>
    <span
      className={styles.historyOwnerDot}
      style={
        power
          ? ({
              '--owner-color': POWER_METADATA[power].fillColor,
            } as React.CSSProperties)
          : undefined
      }
    />
    <span>{powerShortNameOrNeutral(power)}</span>
  </span>
);

export interface HistoryOwnershipSectionProps {
  ownershipChanges: readonly HistoryOwnershipChange[];
  phaseKind: HistoryPhaseKind;
  selectedOrderId: string | null;
  compact: boolean;
  densityToggle: React.ReactNode;
  onHoverOrder?: (focus: HistoryHighlightFocus | null) => void;
  onTogglePinOrder?: (focus: HistoryHighlightFocus) => void;
}

/** Past-turn "Territorial Changes" log section listing captured supply centers and claimed land. */
export const HistoryOwnershipSection: React.FC<
  HistoryOwnershipSectionProps
> = ({
  ownershipChanges,
  phaseKind,
  selectedOrderId,
  compact,
  densityToggle,
  onHoverOrder,
  onTogglePinOrder,
}) => {
  if (ownershipChanges.length === 0) return null;

  return (
    <div
      className={styles.historySection}
      data-testid="history-ownership-section"
    >
      <div className={styles.historySectionHeaderRow}>
        <div className={styles.historySectionHeader}>Territorial Changes</div>
        {densityToggle}
      </div>
      <section
        className={styles.historyPowerGroup}
        data-testid="history-ownership-group"
        data-compact={compact ? 'true' : undefined}
        style={
          {
            '--group-color': phaseKind === 'Admin' ? '#dc2626' : '#c8963e',
          } as React.CSSProperties
        }
      >
        <div className={styles.historyEntries}>
          {ownershipChanges.map((change) => {
            const focusId = `own_${change.province}`;
            const focus: HistoryHighlightFocus = {
              id: focusId,
              unitId: null,
              provinces: [change.province],
            };
            const isSelected = selectedOrderId === focusId;
            return (
              <button
                key={change.province}
                type="button"
                className={styles.historyOwnershipRow}
                data-testid="history-ownership-item"
                data-province={change.province}
                data-selected={isSelected ? 'true' : undefined}
                data-compact={compact ? 'true' : undefined}
                aria-pressed={isSelected}
                onPointerEnter={(e) => {
                  if (e.pointerType !== 'touch') onHoverOrder?.(focus);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType !== 'touch') onHoverOrder?.(null);
                }}
                onClick={() => onTogglePinOrder?.(focus)}
              >
                <span className={styles.historyOwnershipProv}>
                  <span>{change.provinceName}</span>
                  {change.isSupplyCenter && (
                    <svg
                      className={styles.historyOwnershipStar}
                      width={16}
                      height={16}
                      viewBox="-11 -11 22 22"
                      role="img"
                      aria-label="Supply Center"
                      data-testid="history-ownership-sc"
                    >
                      <title>Supply Center</title>
                      <SupplyStar
                        ownerColor={
                          change.nextPower
                            ? POWER_METADATA[change.nextPower].color
                            : undefined
                        }
                      />
                    </svg>
                  )}
                </span>
                <span className={styles.historyOwnershipTransfer}>
                  <OwnerTag power={change.prevPower} />
                  {' → '}
                  <OwnerTag power={change.nextPower} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
