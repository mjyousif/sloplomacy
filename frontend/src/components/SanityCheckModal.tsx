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
import { Modal, ModalCloseButton, ModalFooter } from './modal/Modal';
import sanityStyles from './SanityCheckModal.module.css';

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
    <Modal
      phone="fit"
      onBackdropClick={onClose}
      cardClassName={sanityStyles.sanityModalCard}
      backdropProps={{ 'data-testid': 'sanity-modal-backdrop' }}
      cardProps={{ 'data-testid': 'sanity-check-modal' }}
    >
      {/* Modal Header */}
      <div className={sanityStyles.sanityModalHeader}>
        <div className={sanityStyles.sanityHeaderTitleGroup}>
          <div className={sanityStyles.sanityHazardBadge}>
            <ShieldAlert size={24} />
          </div>
          <div>
            <div className={sanityStyles.sanityOverline}>
              PRE-FINALIZATION TACTICAL SANITY CHECK
            </div>
            <h2 className={sanityStyles.sanityMainTitle}>
              Hold On — Are You Sure You Want to Finalize {meta.shortName}
              &apos;s Orders?
            </h2>
          </div>
        </div>
        <ModalCloseButton
          className={sanityStyles.sanityCloseX}
          onClick={onClose}
        >
          <X size={18} />
        </ModalCloseButton>
      </div>

      {/* Summary Callout Strip */}
      <div className={sanityStyles.sanitySummaryBanner}>
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
      <div className={sanityStyles.sanityIssuesList}>
        {issues.map((issue) => {
          const isErr = issue.severity === 'error';
          const isInfo = issue.severity === 'info';
          return (
            <div
              key={issue.id}
              className={sanityStyles.sanityIssueItem}
              data-severity={isErr ? 'error' : isInfo ? 'info' : 'warning'}
            >
              <div className={sanityStyles.sanityIssueIcon}>
                {isErr ? (
                  <AlertOctagon size={20} />
                ) : isInfo ? (
                  <Info size={20} />
                ) : (
                  <AlertTriangle size={20} />
                )}
              </div>
              <div className={sanityStyles.sanityIssueContent}>
                <div className={sanityStyles.sanityIssueHeaderRow}>
                  <span
                    className={sanityStyles.sanityCodePill}
                    data-severity={
                      isErr ? 'error' : isInfo ? 'info' : 'warning'
                    }
                  >
                    {issue.code.replace(/_/g, ' ')}
                  </span>
                  <strong className={sanityStyles.sanityIssueTitle}>
                    {issue.title}
                  </strong>
                </div>
                <p className={sanityStyles.sanityIssueMessage}>
                  {issue.message}
                </p>
              </div>
              <button
                className={sanityStyles.sanityInspectBtn}
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
      <ModalFooter className={sanityStyles.sanityModalFooter}>
        <button
          className={sanityStyles.sanityBackBtn}
          data-testid="btn-sanity-back"
          onClick={onClose}
        >
          Go Back &amp; Revise Orders
        </button>
        <button
          className={sanityStyles.sanityForceConfirmBtn}
          data-testid="btn-sanity-force-confirm"
          onClick={onConfirmFinalizeAnyway}
        >
          <CheckCircle2 size={16} />
          <span>Yes, I&apos;m Sure — Finalize Anyway</span>
        </button>
      </ModalFooter>
    </Modal>
  );
};
