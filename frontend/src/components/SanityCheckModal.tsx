import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Info,
  ShieldAlert,
  X,
} from 'lucide-react';
import type React from 'react';
import {
  POWER_METADATA,
  type Power,
  type ValidationIssue,
} from '../types/diplomacy';

interface SanityCheckModalProps {
  isOpen: boolean;
  power: Power;
  issues: ValidationIssue[];
  onClose: () => void;
  onInspectIssue: (issue: ValidationIssue) => void;
  onConfirmFinalizeAnyway: () => void;
}

export const SanityCheckModal: React.FC<SanityCheckModalProps> = ({
  isOpen,
  power,
  issues,
  onClose,
  onInspectIssue,
  onConfirmFinalizeAnyway,
}) => {
  if (!isOpen) return null;

  const meta = POWER_METADATA[power];
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return (
    <div
      className="sanity-modal-backdrop"
      data-testid="sanity-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="sanity-modal-card"
        data-testid="sanity-check-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sanity-modal-header">
          <div className="sanity-header-title-group">
            <div className="sanity-hazard-badge">
              <ShieldAlert size={24} />
            </div>
            <div>
              <div className="sanity-overline">
                PRE-FINALIZATION TACTICAL SANITY CHECK
              </div>
              <h2 className="sanity-main-title">
                Hold On — Are You Sure You Want to Finalize {meta.shortName}
                &apos;s Orders?
              </h2>
            </div>
          </div>
          <button className="sanity-close-x" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Summary Callout Strip */}
        <div className="sanity-summary-banner">
          <p>
            Our War Room Staff detected{' '}
            <strong>
              {issues.length} potential tactical issue
              {issues.length > 1 ? 's' : ''}
            </strong>{' '}
            in your current dispatch ({warningCount} warning
            {warningCount !== 1 ? 's' : ''}
            {errorCount > 0
              ? `, ${errorCount} illegal order${errorCount !== 1 ? 's' : ''}`
              : ''}
            ). Review the diagnostics below before locking in your orders:
          </p>
        </div>

        {/* List of Sanity Check Issues */}
        <div className="sanity-issues-list">
          {issues.map((issue) => {
            const isErr = issue.severity === 'error';
            const isInfo = issue.severity === 'info';
            return (
              <div
                key={issue.id}
                className={`sanity-issue-item ${isErr ? 'severity-error' : isInfo ? 'severity-info' : 'severity-warning'}`}
              >
                <div className="sanity-issue-icon">
                  {isErr ? (
                    <AlertOctagon size={20} />
                  ) : isInfo ? (
                    <Info size={20} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                </div>
                <div className="sanity-issue-content">
                  <div className="sanity-issue-header-row">
                    <span
                      className={`sanity-code-pill ${isErr ? 'err' : isInfo ? 'info' : 'warn'}`}
                    >
                      {issue.code.replace(/_/g, ' ')}
                    </span>
                    <strong className="sanity-issue-title">
                      {issue.title}
                    </strong>
                  </div>
                  <p className="sanity-issue-message">{issue.message}</p>
                </div>
                <button
                  className="sanity-inspect-btn"
                  data-testid="btn-sanity-inspect"
                  onClick={() => onInspectIssue(issue)}
                  title="Highlight and edit this unit on the map"
                >
                  <Crosshair size={14} />
                  <span>Fix Order</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="sanity-modal-footer">
          <button
            className="sanity-back-btn"
            data-testid="btn-sanity-back"
            onClick={onClose}
          >
            Go Back &amp; Revise Orders
          </button>
          <button
            className="sanity-force-confirm-btn"
            data-testid="btn-sanity-force-confirm"
            onClick={onConfirmFinalizeAnyway}
          >
            <CheckCircle2 size={16} />
            <span>Yes, I&apos;m Sure — Finalize Anyway</span>
          </button>
        </div>
      </div>
    </div>
  );
};
