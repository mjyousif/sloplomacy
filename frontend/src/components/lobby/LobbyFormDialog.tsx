import { X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { Modal, ModalCloseButton } from '../modal/Modal';
import styles from './LobbyFormDialog.module.css';

export interface LobbyFormDialogProps {
  /** What a screen reader calls the dialog, e.g. "Host game". */
  label: string;
  testId: string;
  onClose: () => void;
  /** The form card the dialog holds: `CreateCampaignPanel` or `JoinWithCodeCard`. */
  children: React.ReactNode;
}

/**
 * The dialog a lobby form opens in. It adds only the shell: the ✕, closing on Escape or a click
 * outside, and focus on the form's first field. The form card inside is unchanged.
 */
export const LobbyFormDialog: React.FC<LobbyFormDialogProps> = ({
  label,
  testId,
  onClose,
  children,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return (
    <Modal
      onBackdropClick={onClose}
      cardClassName={styles.card}
      backdropProps={{ 'data-testid': testId }}
      cardProps={{ role: 'dialog', 'aria-modal': true, 'aria-label': label }}
    >
      <ModalCloseButton
        className={styles.close}
        aria-label={`Close ${label}`}
        onClick={onClose}
      >
        <X size={18} />
      </ModalCloseButton>
      <div ref={bodyRef}>{children}</div>
    </Modal>
  );
};
