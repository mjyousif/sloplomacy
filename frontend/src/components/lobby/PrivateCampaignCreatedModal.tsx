import { Check, Copy, KeyRound, ShieldAlert, X } from 'lucide-react';
import type React from 'react';

export interface PrivateCampaignCreatedModalProps {
  createdPrivateModal: {
    gameId: string;
    passcode: string;
    name: string;
  } | null;
  onClose: () => void;
  handleCopy: (text: string, field: 'gid' | 'pw') => void;
  copiedGameId: boolean;
  copiedPasscode: boolean;
}

export const PrivateCampaignCreatedModal: React.FC<
  PrivateCampaignCreatedModalProps
> = ({
  createdPrivateModal,
  onClose,
  handleCopy,
  copiedGameId,
  copiedPasscode,
}) => {
  if (!createdPrivateModal) return null;

  return (
    <div className="modal-backdrop">
      <div className="private-created-modal-card">
        <div className="created-modal-header">
          <div className="created-modal-title">
            <KeyRound size={22} className="title-icon" />
            <h3>Private Campaign Created!</h3>
          </div>
          <button type="button" className="modal-close-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="created-modal-desc">
          <strong>&ldquo;{createdPrivateModal.name}&rdquo;</strong> has been
          created as a private lobby. Share these secret credentials with other
          commanders so they can join your theater:
        </p>

        <div className="credentials-box">
          <div className="cred-row">
            <span className="cred-label">Campaign ID:</span>
            <div className="cred-copy-group">
              <span className="cred-value">{createdPrivateModal.gameId}</span>
              <button
                type="button"
                className="cred-copy-btn"
                onClick={() => handleCopy(createdPrivateModal.gameId, 'gid')}
                title="Copy Game ID"
              >
                {copiedGameId ? (
                  <Check size={14} className="copied" />
                ) : (
                  <Copy size={14} />
                )}
                <span>{copiedGameId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div className="cred-row">
            <span className="cred-label">Secret Passcode:</span>
            <div className="cred-copy-group">
              <span className="cred-value passcode">
                {createdPrivateModal.passcode}
              </span>
              <button
                type="button"
                className="cred-copy-btn"
                onClick={() => handleCopy(createdPrivateModal.passcode, 'pw')}
                title="Copy Passcode"
              >
                {copiedPasscode ? (
                  <Check size={14} className="copied" />
                ) : (
                  <Copy size={14} />
                )}
                <span>{copiedPasscode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="security-notice">
          <ShieldAlert size={16} />
          <span>
            Keep your passcode secure. Anyone with these credentials can enter
            and command unassigned sovereign nations.
          </span>
        </div>

        <div className="created-modal-actions">
          <button type="button" className="modal-enter-btn" onClick={onClose}>
            Enter Lobby Browser
          </button>
        </div>
      </div>
    </div>
  );
};
