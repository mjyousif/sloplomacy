import { ShieldAlert } from 'lucide-react';
import type React from 'react';
import type { AdminActionLogEntry } from '../types/diplomacy';
import styles from './AdminActionWarningModal.module.css';
import { Modal, ModalFooter } from './modal/Modal';
import sanityStyles from './SanityCheckModal.module.css';

export interface AdminActionWarningModalProps {
  isOpen: boolean;
  entries: AdminActionLogEntry[];
  onAcknowledge: () => Promise<void>;
  loading?: boolean;
}

/**
 * Warns participants whenever administrator or creator actions modify a match.
 * Appears immediately via live WebSocket or upon first load/rejoin, persisting
 * acknowledgement to the server upon dismissal.
 */
export const AdminActionWarningModal: React.FC<
  AdminActionWarningModalProps
> = ({ isOpen, entries, onAcknowledge, loading = false }) => {
  if (!isOpen || entries.length === 0) return null;

  return (
    <Modal
      phone="fit"
      cardClassName={sanityStyles.sanityModalCard}
      backdropProps={{
        'data-testid': 'admin-warning-modal-backdrop',
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'admin-warning-title',
      }}
      cardProps={{ 'data-testid': 'admin-action-warning-modal' }}
    >
      {/* Header */}
      <div className={sanityStyles.sanityModalHeader}>
        <div className={sanityStyles.sanityHeaderTitleGroup}>
          <div className={sanityStyles.sanityHazardBadge}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <div className={sanityStyles.sanityOverline}>
              ADMINISTRATIVE INTERVENTION NOTICE
            </div>
            <h2 id="admin-warning-title">
              Match State Modified by Administrator
            </h2>
          </div>
        </div>
      </div>

      {/* Content list */}
      <div>
        <p className={sanityStyles.adminWarningIntro}>
          The match creator or administrator has intervened and modified the
          board or turn state for this match. Review the actions taken below:
        </p>

        <div
          className={sanityStyles.adminWarningEntriesList}
          data-testid="admin-warning-entries-list"
        >
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={sanityStyles.adminWarningEntryCard}
              data-testid="admin-warning-entry-card"
            >
              <div className={sanityStyles.adminWarningEntryHeader}>
                <span className={sanityStyles.adminWarningTurnBadge}>
                  {entry.season} {entry.year} {entry.phase}
                </span>
                <span>
                  By <strong>{entry.actor}</strong>
                </span>
                <span className={sanityStyles.adminWarningTime}>
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <ul className={sanityStyles.adminWarningSummaryList}>
                {entry.summary_lines.map((line, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is static in audit logs
                  <li key={idx}>
                    {line.startsWith('[ADMIN OVERRIDE] ')
                      ? line.replace('[ADMIN OVERRIDE] ', '')
                      : line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <ModalFooter className={sanityStyles.sanityModalFooter}>
        <button
          type="button"
          className={styles.adminPrimaryBtn}
          data-testid="admin-warning-acknowledge-btn"
          onClick={onAcknowledge}
          disabled={loading}
        >
          {loading ? 'Acknowledging...' : 'Acknowledge & Continue'}
        </button>
      </ModalFooter>
    </Modal>
  );
};
