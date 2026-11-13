import { ShieldAlert } from 'lucide-react';
import type React from 'react';
import type { AdminActionLogEntry } from '../types/diplomacy';

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
    <div
      className="sanity-modal-backdrop admin-warning-modal-backdrop"
      data-testid="admin-warning-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-warning-title"
    >
      <div
        className="sanity-modal-card admin-warning-modal-card"
        data-testid="admin-action-warning-modal"
      >
        {/* Header */}
        <div className="sanity-modal-header admin-warning-modal-header">
          <div className="sanity-header-title-group">
            <div className="sanity-hazard-badge admin-warning-hazard-badge">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="sanity-overline admin-warning-overline">
                ADMINISTRATIVE INTERVENTION NOTICE
              </div>
              <h2 id="admin-warning-title" className="sanity-title">
                Match State Modified by Administrator
              </h2>
            </div>
          </div>
        </div>

        {/* Content list */}
        <div className="sanity-modal-body admin-warning-modal-body">
          <p className="admin-warning-intro">
            The match creator or administrator has intervened and modified the
            board or turn state for this match. Review the actions taken below:
          </p>

          <div
            className="admin-warning-entries-list"
            data-testid="admin-warning-entries-list"
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="admin-warning-entry-card"
                data-testid="admin-warning-entry-card"
              >
                <div className="admin-warning-entry-header">
                  <span className="admin-warning-turn-badge">
                    {entry.season} {entry.year} {entry.phase}
                  </span>
                  <span className="admin-warning-actor">
                    By <strong>{entry.actor}</strong>
                  </span>
                  <span className="admin-warning-time">
                    {new Date(entry.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <ul className="admin-warning-summary-list">
                  {entry.summary_lines.map((line, idx) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: order is static in audit logs
                    <li key={idx} className="admin-warning-summary-item">
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
        <div className="sanity-modal-footer admin-warning-modal-footer">
          <button
            type="button"
            className="admin-primary-btn"
            data-testid="admin-warning-acknowledge-btn"
            onClick={onAcknowledge}
            disabled={loading}
          >
            {loading ? 'Acknowledging...' : 'Acknowledge & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
