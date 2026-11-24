import { Check, Copy, KeyRound, ShieldAlert, X } from 'lucide-react';
import type React from 'react';
import { gameLink } from '../../utils/gameRoute';
import { Modal, ModalCloseButton, ModalFooter } from '../modal/Modal';
import promptStyles from '../modal/PromptDialog.module.css';
import styles from './PrivateCampaignCreatedModal.module.css';

export type CopyField = 'gid' | 'link' | 'pw';

export interface PrivateCampaignCreatedModalProps {
  createdPrivateModal: {
    gameId: string;
    passcode: string;
    name: string;
  } | null;
  onClose: () => void;
  handleCopy: (text: string, field: CopyField) => void;
  copiedGameId: boolean;
  copiedLink: boolean;
  copiedPasscode: boolean;
  /** The field whose last copy failed, so its button can say so (select and copy by hand). */
  copyFailed?: CopyField | null;
}

export const PrivateCampaignCreatedModal: React.FC<
  PrivateCampaignCreatedModalProps
> = ({
  createdPrivateModal,
  onClose,
  handleCopy,
  copiedGameId,
  copiedLink,
  copiedPasscode,
  copyFailed = null,
}) => {
  if (!createdPrivateModal) return null;
  const link = gameLink(createdPrivateModal.gameId);

  return (
    <Modal cardClassName={promptStyles.card} onEscape={onClose}>
      <div className={promptStyles.header}>
        <div className={promptStyles.title}>
          <KeyRound size={22} />
          <h3>Private Campaign Created!</h3>
        </div>
        <ModalCloseButton className={promptStyles.close} onClick={onClose}>
          <X size={18} />
        </ModalCloseButton>
      </div>

      <p className={promptStyles.description}>
        <strong>&ldquo;{createdPrivateModal.name}&rdquo;</strong> has been
        created as a private lobby. Share these secret credentials with other
        commanders so they can join your theater:
      </p>

      <div>
        <div>
          <span className={styles.credLabel}>Campaign ID:</span>
          <div>
            <span className={styles.credValue}>
              {createdPrivateModal.gameId}
            </span>
            <button
              type="button"
              className={styles.credCopyBtn}
              onClick={() => handleCopy(createdPrivateModal.gameId, 'gid')}
              title="Copy Game ID"
            >
              {copiedGameId ? <Check size={14} /> : <Copy size={14} />}
              <span>
                {copiedGameId
                  ? 'Copied'
                  : copyFailed === 'gid'
                    ? 'Copy failed'
                    : 'Copy'}
              </span>
            </button>
          </div>
        </div>

        <div>
          <span className={styles.credLabel}>Game Link:</span>
          <div>
            <span
              className={`${styles.credValue} ${styles.credLink}`}
              data-testid="private-campaign-link"
            >
              {link}
            </span>
            <button
              type="button"
              className={styles.credCopyBtn}
              onClick={() => handleCopy(link, 'link')}
              title="Copy Game Link (it asks for the passcode)"
            >
              {copiedLink ? <Check size={14} /> : <Copy size={14} />}
              <span>
                {copiedLink
                  ? 'Copied'
                  : copyFailed === 'link'
                    ? 'Copy failed'
                    : 'Copy'}
              </span>
            </button>
          </div>
        </div>

        <div>
          <span className={styles.credLabel}>Secret Passcode:</span>
          <div>
            <span className={styles.credValue}>
              {createdPrivateModal.passcode}
            </span>
            <button
              type="button"
              className={styles.credCopyBtn}
              onClick={() => handleCopy(createdPrivateModal.passcode, 'pw')}
              title="Copy Passcode"
            >
              {copiedPasscode ? <Check size={14} /> : <Copy size={14} />}
              <span>
                {copiedPasscode
                  ? 'Copied'
                  : copyFailed === 'pw'
                    ? 'Copy failed'
                    : 'Copy'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div>
        <ShieldAlert size={16} />
        <span>
          Keep your passcode secure. Anyone with these credentials can enter and
          command unassigned sovereign nations.
        </span>
      </div>

      <ModalFooter className={promptStyles.actions}>
        <button
          type="button"
          className={promptStyles.enterButton}
          onClick={onClose}
        >
          Enter Lobby Browser
        </button>
      </ModalFooter>
    </Modal>
  );
};
